import { Injectable } from '@nestjs/common';
import {
  TICKET_REVIEW_REASON_LABELS,
  TICKET_REVIEW_REASON_ORDER,
  type TicketFailReason,
  type TicketReviewReason,
} from '@meets/shared';
import { AuditService } from '../admin/audit.service';
import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { TicketStateService } from './ticket-state.service';

const PENDING = ['REVIEW_PENDING', 'REVERIFYING'] as const;

/**
 * 운영 콘솔의 인증 검수 (화면은 나중에, 서버 기능만)
 * - 검수 목록: 중복 의심 → 신고 재검증 → 자동 인식 실패 → 무작위 점검 순
 * - 가린 이미지는 검수자만, 검수 중에만 볼 수 있고 열람은 기록합니다.
 * - 승인·반려하면 이미지를 바로 지웁니다.
 */
@Injectable()
export class AdminTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: TicketStateService,
    private readonly audit: AuditService,
  ) {}

  async queue(adminId: string) {
    const rows = await this.prisma.ticketVerification.findMany({
      where: { status: { in: [...PENDING] } },
      include: { event: { select: { name: true } }, image: { select: { verificationId: true } } },
      orderBy: { updatedAt: 'asc' },
    });
    await this.audit.record({ actorId: adminId, action: 'TICKET_QUEUE_VIEW', targetType: 'TicketVerification' });
    const rank = (r: string | null) => {
      const i = TICKET_REVIEW_REASON_ORDER.indexOf(r as TicketReviewReason);
      return i < 0 ? TICKET_REVIEW_REASON_ORDER.length : i;
    };
    return rows
      .sort((a, b) => rank(a.reviewReason) - rank(b.reviewReason))
      .map((r) => ({
        id: r.id,
        status: r.status,
        reason: r.reviewReason,
        reasonLabel: TICKET_REVIEW_REASON_LABELS[r.reviewReason as TicketReviewReason] ?? '',
        eventName: r.event.name,
        admissibleDayIds: r.admissibleDayIds,
        hasImage: !!r.image,
        held: !!r.heldAt,
        createdAt: r.createdAt,
      }));
  }

  /** 가린 이미지 보기: 검수자만(권한표), 검수 중에만. 열람 사유와 함께 기록합니다. */
  async viewImage(adminId: string, id: string, reason?: string) {
    const v = await this.prisma.ticketVerification.findUnique({ where: { id }, include: { image: true } });
    if (!v || !PENDING.includes(v.status as (typeof PENDING)[number]) || !v.image) {
      throw new AppError('NOT_FOUND', '볼 수 있는 이미지가 없어요.');
    }
    await this.audit.record({
      actorId: adminId,
      action: 'TICKET_IMAGE_VIEW',
      targetType: 'TicketVerification',
      targetId: id,
      reason: reason ?? '인증 검수',
    });
    return { mimeType: v.image.mimeType, imageBase64: Buffer.from(v.image.data).toString('base64') };
  }

  /**
   * 승인. 같은 예매번호를 가진 다른 계정의 인증이 있으면(중복 의심) 그쪽은 재검증으로 돌리고,
   * 번호의 주인을 이 인증으로 옮깁니다.
   */
  async approve(adminId: string, id: string) {
    const v = await this.prisma.ticketVerification.findUnique({ where: { id } });
    if (!v || !PENDING.includes(v.status as (typeof PENDING)[number]) || !v.reservationHash) {
      throw new AppError('NOT_FOUND', '검수할 인증을 찾을 수 없어요.');
    }
    const hash = v.reservationHash;
    await this.prisma.$transaction(async (tx) => {
      const owner = await tx.ticketHash.findUnique({ where: { hash }, include: { verification: true } });
      if (owner && owner.verificationId !== id && owner.verification.userId !== v.userId) {
        if (v.status === 'REVERIFYING') {
          throw new AppError('APPROVAL_INVALID', '같은 예매번호가 다른 계정에 인증되어 있어요. 먼저 그쪽을 확인해 주세요.');
        }
        if (owner.verification.status === 'VERIFIED') {
          await this.state.transition(tx, owner.verificationId, 'VERIFIED', 'REVERIFYING', {
            reviewReason: 'DUPLICATE_SUSPECT',
          });
        }
      }
      await this.state.transition(tx, id, v.status, 'VERIFIED', { reviewerId: adminId });
      await tx.ticketHash.upsert({ where: { hash }, update: { verificationId: id }, create: { hash, verificationId: id } });
      await this.audit.record({ actorId: adminId, action: 'TICKET_APPROVE', targetType: 'TicketVerification', targetId: id }, tx);
    });
    // TODO(4단계): 결과를 알림으로 알려 줍니다.
    return { id, status: 'VERIFIED' as const };
  }

  async reject(adminId: string, id: string, reason: TicketFailReason) {
    const v = await this.prisma.ticketVerification.findUnique({ where: { id } });
    if (!v || !PENDING.includes(v.status as (typeof PENDING)[number])) {
      throw new AppError('NOT_FOUND', '검수할 인증을 찾을 수 없어요.');
    }
    await this.prisma.$transaction(async (tx) => {
      await this.state.transition(tx, id, v.status, 'FAILED', { failReason: reason, reviewerId: adminId });
      // 실패한 인증은 예매번호의 주인이 될 수 없습니다.
      await tx.ticketHash.deleteMany({ where: { verificationId: id } });
      await this.audit.record(
        { actorId: adminId, action: 'TICKET_REJECT', targetType: 'TicketVerification', targetId: id, reason },
        tx,
      );
    });
    return { id, status: 'FAILED' as const };
  }

  /** 보류: 상태는 그대로 두고 표시만 합니다. */
  async hold(adminId: string, id: string) {
    const v = await this.prisma.ticketVerification.findUnique({ where: { id } });
    if (!v || !PENDING.includes(v.status as (typeof PENDING)[number])) {
      throw new AppError('NOT_FOUND', '검수할 인증을 찾을 수 없어요.');
    }
    await this.prisma.ticketVerification.update({ where: { id }, data: { heldAt: new Date() } });
    await this.audit.record({ actorId: adminId, action: 'TICKET_HOLD', targetType: 'TicketVerification', targetId: id });
    return { id, held: true };
  }

  /**
   * 재검증 요청 (인증 완료 → 재검증). 신고를 처리하는 사람이 씁니다.
   * TODO(7단계): 신고 처리 화면과 연결합니다. 이미지는 이미 지웠으므로 사용자가 다시 올려야 합니다.
   */
  async requestReverify(adminId: string, id: string, reason: string) {
    const v = await this.prisma.ticketVerification.findUnique({ where: { id } });
    if (!v) throw new AppError('NOT_FOUND', '인증을 찾을 수 없어요.');
    await this.prisma.$transaction(async (tx) => {
      await this.state.transition(tx, id, v.status, 'REVERIFYING', { reviewReason: 'REPORTED' });
      await this.audit.record(
        { actorId: adminId, action: 'TICKET_REVERIFY_REQUEST', targetType: 'TicketVerification', targetId: id, reason },
        tx,
      );
    });
    return { id, status: 'REVERIFYING' as const };
  }
}
