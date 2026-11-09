import { Injectable } from '@nestjs/common';
import type { ReportPriority } from '@meets/shared';
import type { Prisma } from '../generated/prisma/client';

/**
 * 신고 상태를 DB에 쓰는 유일한 곳 (CLAUDE.md 규칙 2)
 * 7-1단계에서는 '접수'로 만드는 것만 있고, 대기 → 처리 중 → 정지 제안 → 확정 → 종결 전이는 7-2단계에서 더합니다.
 */
@Injectable()
export class ReportStateService {
  async createReceived(
    tx: Prisma.TransactionClient,
    data: { reporterId: string; targetId: string; appointmentId: string; category: Prisma.ReportUncheckedCreateInput['category']; detail: string | null; priority: ReportPriority },
  ) {
    return tx.report.create({ data: { ...data, status: 'RECEIVED' } });
  }
}
