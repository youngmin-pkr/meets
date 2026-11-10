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
  /** 전날 확인 요청을 보내는 시각(전날 몇 시, 한국 시간) (정리문서 정책 값 5) */
  APPOINTMENT_DAY_BEFORE_HOUR: 18,
  /** 전날 확인 마감: 약속 시작 몇 시간 전까지 '갈 수 있어요'를 눌러야 하는지 (2026-11-08 사용자 확인) */
  APPOINTMENT_CONFIRM_DEADLINE_HOURS: 3,
  /** 재촉 알림: 확인 마감 몇 시간 전에 한 번 (2026-11-08 사용자 확인) */
  APPOINTMENT_CONFIRM_REMINDER_HOURS: 3,
  /** 무료 취소 기한: 약속 몇 시간 전까지 취소하면 신뢰 단계에 영향 없음 (정리문서 정책 값 6) */
  APPOINTMENT_FREE_CANCEL_HOURS: 24,
  /** 노쇼 판단 대기: 약속 시각 몇 분 뒤부터 '안 나왔어요'를 누를 수 있는지 (정리문서 정책 값 7) */
  APPOINTMENT_NO_SHOW_WAIT_MINUTES: 15,
  /** '곧 약속' 알림: 약속 몇 분 전 (2026-11-08 사용자 확인) */
  APPOINTMENT_SOON_MINUTES: 60,
  /** '도착했어요'는 약속 몇 분 전부터 누를 수 있는지 */
  APPOINTMENT_ARRIVAL_OPEN_MINUTES: 60,
  /** 행사 변경 후 다시 정하기 기한(시간) (정리문서 정책 값 14) */
  RESCHEDULE_DEADLINE_HOURS: 48,
  /** 행사까지 기한보다 적게 남았으면, 행사 몇 시간 전까지 (정리문서 정책 값 14) */
  RESCHEDULE_EVENT_CUTOFF_HOURS: 12,
  /** 방해 금지 시작 시각(밤 몇 시, 한국 시간). 이 시간에는 푸시를 보내지 않고 알림함에만 쌓습니다. (2026-11-08 사용자 확인) */
  NOTIFY_QUIET_START_HOUR: 22,
  /** 방해 금지 끝 시각(아침 몇 시, 한국 시간) */
  NOTIFY_QUIET_END_HOUR: 8,
  /** 채팅 닫힘: 만남이 끝나고 몇 시간 뒤 (정리문서 정책 값 8) */
  CHAT_CLOSE_HOURS_AFTER_END: 24,
  /** 채팅 메시지 한 번에 보낼 수 있는 글자 수 (2026-11-09 사용자 확인) */
  CHAT_MESSAGE_MAX_LENGTH: 500,
  /**
   * 대화 기록 보관 기간(일). 신고 처리에 쓰려고 보관합니다.
   * TODO(법률 검토): 신고·제재 기록 보관(180일)과 같게 임시로 두었습니다. 실제 삭제는 7단계 신고 기능과 함께 만듭니다.
   */
  CHAT_RETENTION_DAYS: 180,
  /** 후기를 남길 수 있는 기간: 만남이 끝나고 며칠 (2026-11-09 사용자 확인) */
  REVIEW_WINDOW_DAYS: 7,
  /** 신뢰 4단계: 받은 '좋았어요·괜찮았어요' 후기가 이 수 이상 (정리문서 정책 값 11) */
  TRUST_UP_REVIEW_COUNT: 3,
  /** 신뢰 단계 하락: 최근 며칠 동안의 임박 취소·무응답·확인된 노쇼를 보는지 (정책 값 12) */
  TRUST_DOWN_WINDOW_DAYS: 90,
  /** 신뢰 단계 하락: 최근 기간에 이만큼 이상이면 한 단계 내려감 (정책 값 12) */
  TRUST_DOWN_COUNT: 2,
  /** 신고 '자세한 내용' 최대 글자 수 */
  REPORT_DETAIL_MAX_LENGTH: 1000,
  /** 신고 조치 '기능 제한' 기간(일): 제안 보내기·수락만 막고 채팅·열람은 허용 (2026-11-09 사용자 확인) */
  REPORT_RESTRICT_DAYS: 7,
  /** 운영자가 열람·조치 사유로 적어야 하는 최소 글자 수 (사유 없이 열람하는 것을 막음) */
  ADMIN_REASON_MIN_LENGTH: 5,
  /** 안전 확인: 약속 하나에 최대 몇 번 묻는지 (정리문서 정책 값 10) */
  SAFETY_CHECK_MAX_COUNT: 2,
  /** 안전 확인: 만남이 시작되고 첫 확인까지, 그리고 확인 사이의 간격(분) (정책 값 10. 첫 확인 시각은 2026-11-10 사용자 확인) */
  SAFETY_CHECK_INTERVAL_MINUTES: 60,
  /** 안전 확인: 답이 없으면 다시 묻기까지, 그리고 그래도 없으면 믿는 사람에게 알리기까지(분) (정책 값 10) */
  SAFETY_CHECK_REASK_MINUTES: 10,
  /** 믿는 사람에게 보내는 링크는 약속이 끝나고 몇 시간 뒤 사라지는지 (정책 값 9) */
  SHARE_LINK_EXPIRE_HOURS_AFTER_END: 6,
} as const;

export type PolicyKey = keyof typeof POLICY_DEFAULTS;

export const POLICY_KEYS = Object.keys(POLICY_DEFAULTS) as PolicyKey[];

export function isPolicyKey(key: string): key is PolicyKey {
  return Object.prototype.hasOwnProperty.call(POLICY_DEFAULTS, key);
}
