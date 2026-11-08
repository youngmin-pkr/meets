/**
 * 제안 상태 전이 표 (정리문서 5장 "제안")
 * 표에 있는 전이만 허용하고 나머지는 거절합니다. (CLAUDE.md 규칙 2)
 */
import type { ProposalStatus } from '@meets/shared';
import { AppError } from '../common/app-error';

export const PROPOSAL_STATUSES: ProposalStatus[] = ['SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'];

export const PROPOSAL_TRANSITIONS: Array<{ from: ProposalStatus; to: ProposalStatus; condition: string }> = [
  { from: 'SENT', to: 'ACCEPTED', condition: '받는 쪽이 동의하면 약속이 만들어짐 (확정 대기)' },
  { from: 'SENT', to: 'REJECTED', condition: '받는 쪽이 거절' },
  { from: 'SENT', to: 'EXPIRED', condition: '24시간 안에 응답이 없음. 행사 24시간 전이 더 빠르면 그때까지' },
  { from: 'SENT', to: 'CANCELLED', condition: '보낸 사람이 취소' },
];

export function assertProposalTransition(from: ProposalStatus, to: ProposalStatus): void {
  if (!PROPOSAL_TRANSITIONS.some((t) => t.from === from && t.to === to)) {
    throw new AppError('INVALID_TRANSITION', `제안 상태를 ${from}에서 ${to}(으)로 바꿀 수 없어요.`);
  }
}
