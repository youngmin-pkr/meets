/**
 * 계정 상태 전이 표 (정리문서 5장 "계정")
 *
 * 계정 상태를 바꿀 수 있는지는 이 표로만 판단합니다. (CLAUDE.md 규칙 2)
 * 표에 없는 전이는 모두 거절합니다.
 *
 * 정리문서의 표는 나이 구분(미인증/성인/청소년/가입 불가)과
 * 이용 상태(활성/정지/탈퇴)를 함께 적었는데, 서로 독립적이라 두 표로 나눴습니다.
 */
import { AppError } from '../common/app-error';

export type AgeClassState = 'UNVERIFIED' | 'ADULT' | 'TEEN' | 'INELIGIBLE';
export type AccountStatusState = 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN';

export const AGE_CLASS_STATES: AgeClassState[] = ['UNVERIFIED', 'ADULT', 'TEEN', 'INELIGIBLE'];
export const ACCOUNT_STATUS_STATES: AccountStatusState[] = ['ACTIVE', 'SUSPENDED', 'WITHDRAWN'];

interface Transition<S> {
  from: S;
  to: S;
  /** 정리문서의 조건 */
  condition: string;
  /** 제안한 사람과 확정한 사람이 달라야 하는 작업 (CLAUDE.md 규칙 4) */
  requiresTwoPersonApproval?: boolean;
}

export const AGE_CLASS_TRANSITIONS: Transition<AgeClassState>[] = [
  { from: 'UNVERIFIED', to: 'ADULT', condition: '본인 확인 결과 성인 기준 나이 이상' },
  { from: 'UNVERIFIED', to: 'TEEN', condition: '본인 확인 결과 만 14~17세 (청소년 모드 안내를 거침)' },
  { from: 'UNVERIFIED', to: 'INELIGIBLE', condition: '본인 확인 결과 만 14세 미만' },
  { from: 'TEEN', to: 'ADULT', condition: '성인 기준 나이가 됨 (14일 전 예고)' },
];

export const ACCOUNT_STATUS_TRANSITIONS: Transition<AccountStatusState>[] = [
  {
    from: 'ACTIVE',
    to: 'SUSPENDED',
    condition: '신고 처리 결과. 제안자와 확정자 2명이 필요',
    requiresTwoPersonApproval: true,
  },
  {
    from: 'ACTIVE',
    to: 'WITHDRAWN',
    // TODO(법률 검토): 탈퇴 뒤 신고·제재 기록 보관 기간 (정책 값 16, 임시 180일)
    condition: '진행 중 약속 정리를 안내한 뒤 탈퇴',
  },
];

export interface TwoPersonApproval {
  proposedBy: string;
  confirmedBy: string;
}

function invalid(kind: string, from: string, to: string): AppError {
  return new AppError('INVALID_TRANSITION', `${kind} 상태를 ${from}에서 ${to}(으)로 바꿀 수 없어요.`);
}

export function assertAgeClassTransition(from: AgeClassState, to: AgeClassState): void {
  const ok = AGE_CLASS_TRANSITIONS.some((t) => t.from === from && t.to === to);
  if (!ok) throw invalid('나이 구분', from, to);
}

export function assertAccountStatusTransition(
  from: AccountStatusState,
  to: AccountStatusState,
  approval?: TwoPersonApproval,
): void {
  const t = ACCOUNT_STATUS_TRANSITIONS.find((x) => x.from === from && x.to === to);
  if (!t) throw invalid('이용', from, to);
  if (t.requiresTwoPersonApproval) {
    if (!approval?.proposedBy || !approval?.confirmedBy) {
      throw new AppError('INVALID_TRANSITION', '제안한 사람과 확정한 사람이 모두 필요해요.');
    }
    if (approval.proposedBy === approval.confirmedBy) {
      throw new AppError('INVALID_TRANSITION', '제안한 사람이 직접 확정할 수 없어요.');
    }
  }
}
