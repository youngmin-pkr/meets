/**
 * 제안 상태 전이 표 (정리문서 5장 "제안")
 * 표에 있는 전이만 허용하고 나머지는 거절합니다. (CLAUDE.md 규칙 2)
 */
import type { ProposalStatus } from '@meets/shared';
import { AppError } from '../common/app-error';

export const PROPOSAL_STATUSES: ProposalStatus[] = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'];

export const PROPOSAL_TRANSITIONS: Array<{ from: ProposalStatus; to: ProposalStatus; condition: string }> = [
  { from: 'DRAFT', to: 'SENT', condition: '일행 전원이 제안에 동의함. 이때부터 24시간 (2026-11-10 추가, 일행 제안)' },
  { from: 'DRAFT', to: 'CANCELLED', condition: '일행원이 동의하지 않거나 취소함, 또는 일행이 풀림 (2026-11-10 추가)' },
  { from: 'DRAFT', to: 'EXPIRED', condition: '24시간 안에 전원이 동의하지 않음 (2026-11-10 추가)' },
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
