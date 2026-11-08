/**
 * 티켓 인증 공통 규칙 (정리문서 2장 "티켓 인증", 5장 "티켓 인증" 상태)
 *
 * - 예매 내역 캡처를 올리고, 이름·전화번호·결제 정보는 가립니다.
 * - 확인이 끝나면 이미지를 지우고, 같은 예매번호인지 확인할 값(해시)만 남깁니다.
 * - 같은 예매번호는 여러 계정이 쓸 수 없습니다.
 * - 무료·예약제 행사는 예약 확인 화면으로 인증하거나 '참석 예정'으로 시작할 수 있습니다.
 */

/** 무엇으로 인증하는지: 티켓 예매 내역 / 예약 확인 화면 */
export type TicketKind = 'TICKET' | 'RESERVATION';

/** 상대에게 보이는 등급: 티켓 인증 / 참석 예정 */
export type AttendanceGrade = 'VERIFIED' | 'PLANNED';

export const ATTENDANCE_GRADE_LABELS: Record<AttendanceGrade, string> = {
  VERIFIED: '티켓 인증',
  PLANNED: '참석 예정',
};

/** 인증 상태 (정리문서 5장) */
export type TicketStatus =
  | 'STARTED' // 시작
  | 'UPLOADED' // 업로드
  | 'CONFIRMED' // 확인 (사용자가 인식 결과를 확인)
  | 'REVIEW_PENDING' // 검수 대기
  | 'VERIFIED' // 인증 완료
  | 'FAILED' // 실패
  | 'REVERIFYING'; // 재검증

/** 사람이 검수하는 이유 (검수 목록의 처리 순서도 이 순서) */
export type TicketReviewReason = 'DUPLICATE_SUSPECT' | 'REPORTED' | 'LOW_CONFIDENCE' | 'RANDOM';

export const TICKET_REVIEW_REASON_ORDER: TicketReviewReason[] = ['DUPLICATE_SUSPECT', 'REPORTED', 'LOW_CONFIDENCE', 'RANDOM'];

export const TICKET_REVIEW_REASON_LABELS: Record<TicketReviewReason, string> = {
  DUPLICATE_SUSPECT: '중복 예매번호 의심',
  REPORTED: '신고로 재검증',
  LOW_CONFIDENCE: '자동 인식 실패',
  RANDOM: '무작위 점검',
};

/** 실패 이유 */
export type TicketFailReason = 'UNREADABLE' | 'WRONG_EVENT' | 'DUPLICATE' | 'OTHER';

export const TICKET_FAIL_MESSAGES: Record<TicketFailReason, { title: string; body: string }> = {
  UNREADABLE: { title: '글자가 흐려서 읽지 못했어요', body: '밝은 곳에서 화면 전체가 나오게 다시 캡처해 주세요.' },
  WRONG_EVENT: { title: '고른 행사와 달라요', body: '날짜나 회차가 다른 예매 내역이에요.' },
  DUPLICATE: { title: '이미 쓰인 예매번호예요', body: '내 티켓이 맞다면 확인해 드릴게요.' },
  OTHER: { title: '확인하지 못했어요', body: '예매 내역 상세 화면을 다시 올려 주세요.' },
};

/** 가릴 영역. 이미지 크기에 대한 비율(0~1)로 나타냅니다. */
export interface MaskBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const TICKET_LIMITS = { maxMasks: 20, numberMin: 4, numberMax: 30 } as const;

export function isValidMask(b: MaskBox): boolean {
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  return (
    ok(b.x) && ok(b.y) && ok(b.w) && ok(b.h) &&
    b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 &&
    b.x + b.w <= 1.0001 && b.y + b.h <= 1.0001
  );
}

/** 예매번호 비교용 정리: 띄어쓰기·하이픈을 빼고 대문자로. 형식이 틀리면 null */
export function normalizeReservationNumber(raw: string): string | null {
  const v = raw.normalize('NFKC').replace(/[\s-]/g, '').toUpperCase();
  if (v.length < TICKET_LIMITS.numberMin || v.length > TICKET_LIMITS.numberMax) return null;
  if (!/^[A-Z0-9]+$/.test(v)) return null;
  return v;
}

/** 내 인증 상태 (앱이 받는 모양) */
export interface MyTicketStatus {
  /** 진행 중이거나 마지막 인증. 없으면 null */
  verification: {
    id: string;
    kind: TicketKind;
    status: TicketStatus;
    failReason: TicketFailReason | null;
    admissibleDayIds: string[];
  } | null;
  /** 상대에게 보이는 등급. 인증도 참석 예정도 아니면 null */
  grade: AttendanceGrade | null;
  /** 이 행사에서 '참석 예정'을 고를 수 있는지 (티켓이 필요 없는 행사만) */
  canPlanWithoutTicket: boolean;
}

/** 인식 결과 확인 뒤 결과 */
export interface TicketConfirmResult {
  status: 'VERIFIED' | 'REVIEW_PENDING' | 'FAILED';
  failReason: TicketFailReason | null;
  /** 자동으로 확인한 것 */
  checks: { sameEvent: boolean; notPast: boolean; notUsedElsewhere: boolean };
}
