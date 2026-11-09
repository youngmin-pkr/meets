/**
 * 신고 상태 전이 표 (정리문서 5장 "신고"). 표 자체는 @meets/shared에 있습니다.
 * 표에 있는 전이만 허용하고 나머지는 거절합니다. (CLAUDE.md 규칙 2)
 * 정지 확정은 두 명 확인이라, 제안한 사람과 확정한 사람이 달라야 합니다. (규칙 4)
 */
import { reportTransition, type ReportStatus } from '@meets/shared';
import { AppError } from '../common/app-error';

export { REPORT_STATUSES, REPORT_TRANSITIONS } from '@meets/shared';

export function assertReportTransition(from: ReportStatus, to: ReportStatus, approval?: { proposedBy: string; confirmedBy: string }): void {
  const t = reportTransition(from, to);
  if (!t) throw new AppError('INVALID_TRANSITION', `신고 상태를 ${from}에서 ${to}(으)로 바꿀 수 없어요.`);
  if (t.twoPerson) {
    if (!approval?.proposedBy || !approval?.confirmedBy) {
      throw new AppError('INVALID_TRANSITION', '제안한 사람과 확정한 사람이 모두 필요해요.');
    }
    if (approval.proposedBy === approval.confirmedBy) {
      throw new AppError('INVALID_TRANSITION', '제안한 사람이 직접 확정할 수 없어요.');
    }
  }
}
