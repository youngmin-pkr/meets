import { Inject, Injectable } from '@nestjs/common';
import { AVATAR_COLORS, BLOCK_SOURCE_LABELS, type BlockSource, type BlockView } from '@meets/shared';
import { AppointmentsService } from '../appointments/appointments.service';
import { AppError } from '../common/app-error';
import { CLOCK, type Clock } from '../common/clock';
import { PrismaService } from '../prisma/prisma.service';
import { ProposalStateService } from '../proposals/proposal-state.service';

/**
 * 차단 (정리문서 2장 "홈·나 탭", 4장 Block)
 * - 서로 후보에서 숨기고, 상대에게는 아무 알림도 보내지 않습니다.
 * - 둘 사이의 답을 기다리는 제안은 조용히 취소하고, 진행 중인 약속은 끝냅니다. (차단을 풀어도 되살아나지 않음)
 * - 차단과 신고는 별개입니다. 차단을 풀어도 이미 접수한 신고는 그대로입니다.
 */
@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proposals: ProposalStateService,
    private readonly appointments: AppointmentsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async block(userId: string, targetId: string, source: BlockSource = 'ME') {
    if (userId === targetId) throw new AppError('BLOCK_INVALID', '나 자신은 차단할 수 없어요.');
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw new AppError('NOT_FOUND', '사용자를 찾을 수 없어요.');
    await this.prisma.$transaction(async (tx) => {
      await tx.block.upsert({
        where: { blockerId_blockedId: { blockerId: userId, blockedId: targetId } },
        update: {},
        create: { blockerId: userId, blockedId: targetId, source, createdAt: this.clock.now() },
      });
      const pending = await tx.proposal.findMany({
        where: {
          status: { in: ['SENT'] },
          OR: [
            { senderId: userId, receiverId: targetId },
            { senderId: targetId, receiverId: userId },
          ],
        },
        select: { id: true },
      });
      for (const p of pending) await this.proposals.transition(tx, p.id, 'SENT', 'CANCELLED');
      await this.appointments.endForBlock(tx, userId, targetId);
    });
    return { blocked: true as const };
  }

  /** 차단 풀기. 이전 약속이 살아나지는 않습니다. */
  async unblock(userId: string, targetId: string) {
    await this.prisma.block.deleteMany({ where: { blockerId: userId, blockedId: targetId } });
    return { blocked: false as const };
  }

  async list(userId: string): Promise<BlockView[]> {
    const rows = await this.prisma.block.findMany({
      where: { blockerId: userId },
      include: { blocked: { select: { id: true, nickname: true, avatarInitial: true, avatarColor: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      rows.map(async (r) => {
        const last = await this.prisma.appointment.findFirst({
          where: { AND: [{ participants: { some: { userId } } }, { participants: { some: { userId: r.blockedId } } }] },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        return {
          userId: r.blockedId,
          nickname: r.blocked.nickname ?? '',
          avatarInitial: r.blocked.avatarInitial ?? '',
          avatarColor: AVATAR_COLORS[(r.blocked.avatarColor ?? 'ink') as keyof typeof AVATAR_COLORS] ?? AVATAR_COLORS.ink,
          blockedAt: r.createdAt.toISOString(),
          sourceLabel: BLOCK_SOURCE_LABELS[r.source as BlockSource] ?? BLOCK_SOURCE_LABELS.ME,
          lastAppointmentId: last?.id ?? null,
        };
      }),
    );
  }

  /** 약속 상대를 차단 (채팅 규칙 화면의 '상대 차단하고 약속 취소') */
  async blockCounterpart(userId: string, appointmentId: string, source: BlockSource, targetId?: string) {
    const a = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, participants: { some: { userId } } },
      include: { participants: true },
    });
    if (!a) throw new AppError('NOT_FOUND', '약속을 찾을 수 없어요.');
    const others = a.participants.filter((p) => p.userId !== userId && (!targetId || p.userId === targetId));
    // 여러 명이 만나는 약속에서는 누구를 차단하는지 알려 주어야 합니다.
    if (others.length !== 1) throw new AppError('BLOCK_INVALID', '차단할 사람을 골라 주세요.');
    return this.block(userId, others[0].userId, source);
  }
}
