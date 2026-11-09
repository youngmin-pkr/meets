import { Injectable } from '@nestjs/common';
import { reportPriority, type ReportStatus } from '@meets/shared';
import { AppError } from '../common/app-error';
import type { Prisma } from '../generated/prisma/client';
import { assertReportTransition } from './report-transitions';

/**
 * 신고 상태를 DB에 쓰는 유일한 곳 (CLAUDE.md 규칙 2)
 * 다른 코드는 Report.status를 직접 바꾸지 말고 여기를 거칩니다.
 */
@Injectable()
export class ReportStateService {
  /**
   * 신고를 접수해서 우선순위(도움 요청 > 청소년 > 일반)와 함께 대기열에 올립니다. (접수 → 대기)
   * 신고하는 사람이나 신고당하는 사람이 청소년이면 청소년 신고로 봅니다.
   */
  async createQueued(
    tx: Prisma.TransactionClient,
    data: { reporterId: string; targetId: string; appointmentId: string; category: Prisma.ReportUncheckedCreateInput['category']; detail: string | null },
  ) {
    const users = await tx.user.findMany({ where: { id: { in: [data.reporterId, data.targetId] } }, select: { id: true, ageClass: true } });
    const isTeen = (id: string) => users.find((u) => u.id === id)?.ageClass === 'TEEN';
    const priority = reportPriority({ reporterIsTeen: isTeen(data.reporterId), targetIsTeen: isTeen(data.targetId) });
    const created = await tx.report.create({ data: { ...data, priority, status: 'RECEIVED' } });
    await this.transition(tx, created.id, 'RECEIVED', 'QUEUED');
    return { id: created.id, priority };
  }

  /**
   * 상태를 바꿉니다. 표에 없는 전이는 거절하고, 그사이 다른 사람이 바꿨으면(현재 상태가 다르면) 거절합니다.
   * 정지 확정(정지 제안 → 확정)은 제안한 사람과 확정한 사람이 달라야 합니다.
   */
  async transition(
    tx: Prisma.TransactionClient,
    id: string,
    from: ReportStatus,
    to: ReportStatus,
    data: Omit<Prisma.ReportUncheckedUpdateManyInput, 'status'> = {},
    approval?: { proposedBy: string; confirmedBy: string },
  ) {
    assertReportTransition(from, to, approval);
    const updated = await tx.report.updateMany({ where: { id, status: from }, data: { ...data, status: to } });
    if (updated.count !== 1) throw new AppError('REPORT_STATE', '신고 상태가 그사이 바뀌었어요. 새로고침해 주세요.');
  }
}
