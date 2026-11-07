/**
 * 가입 흐름에서 앱과 서버가 함께 쓰는 정의
 */

/** 동의받는 약관. 내용이 바뀌면 version을 올립니다. */
export const TERMS = [
  { code: 'SERVICE', title: '이용약관', version: '2026-11-07', required: true },
  { code: 'PRIVACY', title: '개인정보 처리', version: '2026-11-07', required: true },
] as const;

export type TermCode = (typeof TERMS)[number]['code'];

export interface AgreedTerm {
  code: string;
  version: string;
}

/** 필수 약관에 모두 (현재 버전으로) 동의했는지 */
export function hasAgreedToRequiredTerms(agreed: AgreedTerm[]): boolean {
  return TERMS.filter((t) => t.required).every((t) =>
    agreed.some((a) => a.code === t.code && a.version === t.version),
  );
}

/** 가입 중 다음에 보여 줄 화면 */
export type SignupStep = 'PROFILE' | 'FANDOM' | 'READY' | 'DONE';

export interface SignupProgress {
  profileCompleted: boolean;
  fandomStepCompleted: boolean;
  signupCompleted: boolean;
}

export function nextSignupStep(p: SignupProgress): SignupStep {
  if (!p.profileCompleted) return 'PROFILE';
  if (!p.fandomStepCompleted) return 'FANDOM';
  if (!p.signupCompleted) return 'READY';
  return 'DONE';
}

/** 본인 확인 API의 결과 */
export type IdentityResult =
  | { outcome: 'UNDER_MIN_AGE' }
  | { outcome: 'TEEN_NOT_YET_AVAILABLE' }
  /** 정지되었거나 탈퇴한 계정 */
  | { outcome: 'ACCOUNT_UNAVAILABLE' }
  | { outcome: 'SIGNED_UP' | 'LOGGED_IN'; sessionToken: string; nextStep: SignupStep };
