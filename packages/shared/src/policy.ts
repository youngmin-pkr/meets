/**
 * 정책 값 정의 (PolicyValue)
 *
 * 숫자로 된 규칙은 모두 여기에서 이름과 기본값을 정합니다.
 * 서버는 DB의 PolicyValue 표를 먼저 읽고, 값이 없으면 이 기본값을 씁니다.
 * 화면이나 다른 코드에 숫자를 직접 쓰지 말고, 서버의 PolicyService를 거쳐 읽으세요.
 */

export const POLICY_DEFAULTS = {
  /**
   * 성인으로 보는 최소 만 나이.
   * TODO(법률 검토): 정리문서는 만 18세로 정했지만 민법상 성년과
   * 청소년보호법의 청소년 기준은 만 19세입니다. 출시 전에 확정해야 합니다.
   */
  ADULT_MIN_AGE: 18,
  /** 가입할 수 있는 최소 만 나이. 이보다 어리면 가입 불가 안내만 보여 줍니다. */
  SIGNUP_MIN_AGE: 14,
  /** 별명 최소 글자 수 */
  NICKNAME_MIN_LENGTH: 2,
  /** 별명 최대 글자 수 */
  NICKNAME_MAX_LENGTH: 10,
  /** 고를 수 있는 팬덤 최대 개수 */
  FANDOM_MAX_COUNT: 3,
  /** 로그인 유지 기간(일) */
  SESSION_TTL_DAYS: 30,
} as const;

export type PolicyKey = keyof typeof POLICY_DEFAULTS;

export const POLICY_KEYS = Object.keys(POLICY_DEFAULTS) as PolicyKey[];

export function isPolicyKey(key: string): key is PolicyKey {
  return Object.prototype.hasOwnProperty.call(POLICY_DEFAULTS, key);
}
