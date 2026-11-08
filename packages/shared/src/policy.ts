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
  /** 운영자 로그인 유지 기간(시간) */
  ADMIN_SESSION_TTL_HOURS: 12,
  /** 매칭: 템포 차이 허용 범위(단계) */
  MATCH_TEMPO_MAX_GAP: 1,
  /** 매칭: 몰입도 차이 허용 범위(단계) */
  MATCH_IMMERSION_MAX_GAP: 1,
  /** 매칭: 후보가 적을 때 넓힌 몰입도 차이 허용 범위(단계) */
  MATCH_IMMERSION_RELAXED_GAP: 2,
  /** 매칭: 후보가 이 수보다 적으면 '후보가 적다'로 보고 범위를 넓힘 */
  MATCH_FEW_CANDIDATES: 3,
  /** 매칭: 같이할 시간이 최소 이만큼(분) 겹쳐야 후보 */
  MATCH_MIN_OVERLAP_MINUTES: 120,
  /** 매칭: '함께할 시간 줄이기'를 고르면 쓰는 최소 겹침(분) */
  MATCH_SHORT_OVERLAP_MINUTES: 60,
  /** 후보 없음 알림 신청은 행사 며칠 전까지 (정리문서 정책 값 15) */
  WAIT_ALERT_END_DAYS_BEFORE: 3,
  /** 티켓 캡처 이미지 최대 크기(MB) */
  TICKET_IMAGE_MAX_MB: 5,
  /** 티켓 인증 중 무작위로 사람이 검수하는 비율(%) */
  TICKET_REVIEW_SAMPLE_PERCENT: 20,
  /** 인증 검수 처리 목표 시간(시간) (정리문서 정책 값 19) */
  TICKET_REVIEW_TARGET_HOURS: 24,
  /** 일반 제안 만료(시간) (정리문서 정책 값 2) */
  PROPOSAL_EXPIRE_HOURS: 24,
  /** 행사 시작 몇 시간 전까지만 제안이 살아 있는지 (정리문서 정책 값 2) */
  PROPOSAL_EVENT_CUTOFF_HOURS: 24,
  /** '참석 예정'인 사람이 한 제안에 고를 수 있는 구간 수 (시안: 첫 제안은 짧은 구간만) */
  PROPOSAL_PLANNED_MAX_SEGMENTS: 1,
} as const;

export type PolicyKey = keyof typeof POLICY_DEFAULTS;

export const POLICY_KEYS = Object.keys(POLICY_DEFAULTS) as PolicyKey[];

export function isPolicyKey(key: string): key is PolicyKey {
  return Object.prototype.hasOwnProperty.call(POLICY_DEFAULTS, key);
}
