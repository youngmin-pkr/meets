/**
 * 가입 중 어느 화면을 보여 줄지 정하는 규칙 (화면 코드와 분리해서 테스트합니다)
 */
import type { IdentityResult, SignupStep } from '@meets/shared';

export type Screen =
  | 'WELCOME'
  | 'VERIFY'
  | 'UNDER_MIN_AGE'
  | 'TEEN_NOT_YET'
  | 'ACCOUNT_UNAVAILABLE'
  | 'PROFILE'
  | 'FANDOM'
  | 'READY'
  | 'HOME';

export function screenForStep(step: SignupStep): Screen {
  switch (step) {
    case 'PROFILE':
      return 'PROFILE';
    case 'FANDOM':
      return 'FANDOM';
    case 'READY':
      return 'READY';
    case 'DONE':
      return 'HOME';
  }
}

export function screenAfterIdentity(result: IdentityResult): Screen {
  switch (result.outcome) {
    case 'UNDER_MIN_AGE':
      return 'UNDER_MIN_AGE';
    case 'TEEN_NOT_YET_AVAILABLE':
      return 'TEEN_NOT_YET';
    case 'ACCOUNT_UNAVAILABLE':
      return 'ACCOUNT_UNAVAILABLE';
    case 'SIGNED_UP':
    case 'LOGGED_IN':
      return screenForStep(result.nextStep);
  }
}

/** 필수 약관에 모두 체크했는지. 처음에는 아무것도 체크되어 있지 않습니다. */
export function allRequiredChecked(
  terms: ReadonlyArray<{ code: string; required: boolean }>,
  checked: Record<string, boolean>,
): boolean {
  return terms.filter((t) => t.required).every((t) => checked[t.code] === true);
}
