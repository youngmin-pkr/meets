/**
 * 행사 상태 전이 표 (정리문서 5장 "행사")
 *
 * 행사 상태는 이 표로만 바꿀 수 있습니다. (CLAUDE.md 규칙 2) 표에 없는 전이는 모두 거절합니다.
 * 운영자가 직접 등록한 행사는 처음부터 '등록' 상태로 만들어집니다. (전이가 아니라 생성)
 */
import { AppError } from '../common/app-error';

export type EventStatusState = 'REPORTED' | 'REVIEWING' | 'REGISTERED' | 'REJECTED' | 'CHANGED' | 'CANCELLED';

export const EVENT_STATUS_STATES: EventStatusState[] = [
  'REPORTED',
  'REVIEWING',
  'REGISTERED',
  'REJECTED',
  'CHANGED',
  'CANCELLED',
];

interface EventTransition {
  from: EventStatusState;
  to: EventStatusState;
  condition: string;
  requiresTwoPersonApproval?: boolean;
}

export const EVENT_TRANSITIONS: EventTransition[] = [
  { from: 'REPORTED', to: 'REVIEWING', condition: '공식 링크가 있어야 함' },
  { from: 'REVIEWING', to: 'REGISTERED', condition: '운영팀이 승인. 같은 행사 제보는 하나로 합침' },
  { from: 'REVIEWING', to: 'REJECTED', condition: '링크가 없거나 개인 모임' },
  {
    from: 'REGISTERED',
    to: 'CHANGED',
    // TODO(4단계): 약속한 모든 사람에게 안내하고 약속을 '다시 정하기'로 바꿉니다.
    condition: '수정 저장 전 확인을 거친 뒤, 약속한 모든 사람에게 안내하고 약속은 다시 정하기가 됨',
  },
  {
    from: 'CHANGED',
    to: 'CHANGED',
    // 사용자 결정(2026-11-07): 일정이 한 번 바뀐 행사도 다시 바꿀 수 있음. 조건은 '등록 → 변경됨'과 같음.
    // TODO(4단계): 약속한 모든 사람에게 안내하고 약속은 다시 정하기가 됨
    condition: '수정 저장 전 확인을 거친 뒤, 약속한 모든 사람에게 안내하고 약속은 다시 정하기가 됨',
  },
  {
    from: 'CHANGED',
    to: 'CANCELLED',
    // 사용자 결정(2026-11-07): 일정이 바뀐 행사도 취소할 수 있음. 조건은 '등록 → 취소'와 같음.
    // TODO(4단계): 약속을 자동 종료하고 후기 요청은 보내지 않습니다.
    condition: '운영자 2명이 확인. 약속은 자동 종료되고 후기 요청은 보내지 않음',
    requiresTwoPersonApproval: true,
  },
  {
    from: 'REGISTERED',
    to: 'CANCELLED',
    // TODO(4단계): 약속을 자동 종료하고 후기 요청은 보내지 않습니다.
    condition: '운영자 2명이 확인. 약속은 자동 종료되고 후기 요청은 보내지 않음',
    requiresTwoPersonApproval: true,
  },
];

export function findEventTransition(from: EventStatusState, to: EventStatusState) {
  return EVENT_TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export function assertEventTransition(
  from: EventStatusState,
  to: EventStatusState,
  approval?: { proposedBy: string; confirmedBy: string },
): void {
  const t = findEventTransition(from, to);
  if (!t) {
    throw new AppError('INVALID_TRANSITION', `행사 상태를 ${from}에서 ${to}(으)로 바꿀 수 없어요.`);
  }
  if (t.requiresTwoPersonApproval) {
    if (!approval?.proposedBy || !approval?.confirmedBy) {
      throw new AppError('INVALID_TRANSITION', '제안한 사람과 확정한 사람이 모두 필요해요.');
    }
    if (approval.proposedBy === approval.confirmedBy) {
      throw new AppError('INVALID_TRANSITION', '제안한 사람이 직접 확정할 수 없어요.');
    }
  }
}
