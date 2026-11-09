import { Injectable } from '@nestjs/common';
import { reportPriority, type ReportCategory } from '@meets/shared';
import { BlocksService } from '../blocks/blocks.service';
import { AppError } from '../common/app-error';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportStateService } from './report-state.service';

/**
 * 신고 접수 (정리문서 2장 "후기·신뢰" 불편했어요 → 신고)
 * - 신고한 사람의 정보는 상대에게 공개되지 않습니다. 이 서비스는 상대에게 알림을 보내지 않고, 신고 내용을 돌려주지도 않습니다.
 * - 접수된 신고는 운영팀이 우선순위(도움 요청 > 청소년 > 일반) 순으로 처리합니다. 처리 기능은 7-2단계에서 만듭니다.
 * - 신고 내용(자세한 내용)은 로그와 오류 메시지에 남기지 않습니다. (CLAUDE.md 규칙 11)
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly state: ReportStateService,
    private readonly blocks: BlocksService,
  ) {}

  async create(userId: string, input: { appointmentId: string; category: ReportCategory; detail?: string; alsoBlock: boolean }) {
    const a = await this.prisma.appointment.findFirst({
      where: { id: input.appointmentId, participants: { some: { userId } } },
      include: { participants: { include: { user: { select: { id: true, ageClass: true } } } } },
    });
    if (!a) throw new AppError('NOT_FOUND', '약속을 찾을 수 없어요.');
    const reporter = a.participants.find((p) => p.userId === userId)!;
    const target = a.participants.find((p) => p.userId !== userId)!;

    const max = await this.policy.getNumber('REPORT_DETAIL_MAX_LENGTH');
    const detail = input.detail?.trim() || null;
    if (detail && [...detail].length > max) throw new AppError('REPORT_INVALID', `자세한 내용은 ${max}자까지 적을 수 있어요.`, { max });

    const open = await this.prisma.report.findFirst({
      where: { reporterId: userId, appointmentId: a.id, status: { notIn: ['CLOSED'] } },
      select: { id: true },
    });
    if (open) throw new AppError('REPORT_EXISTS', '이 약속은 이미 신고했어요. 운영팀이 확인하고 있어요.');

    const priority = reportPriority({
      reporterIsTeen: reporter.user.ageClass === 'TEEN',
      targetIsTeen: target.user.ageClass === 'TEEN',
    });
    const created = await this.prisma.$transaction((tx) =>
      this.state.createReceived(tx, { reporterId: userId, targetId: target.userId, appointmentId: a.id, category: input.category, detail, priority }),
    );
    if (input.alsoBlock) await this.blocks.block(userId, target.userId, 'REPORT');
    return { id: created.id, received: true as const, blocked: input.alsoBlock };
  }
}
