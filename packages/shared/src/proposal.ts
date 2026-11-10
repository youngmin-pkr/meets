/**
 * 제안과 약속 (정리문서 2장 "후보·제안", 5장 "제안"·"약속" 상태)
 *
 * - 제안 보내기는 티켓 인증 후에만 (티켓이 필요 없는 행사는 '참석 예정'도 가능, 대신 짧은 구간만)
 * - 받는 쪽이 수락하면 약속이 만들어집니다. (확정 대기)
 * - 24시간 안에 답이 없으면 만료. 행사 24시간 전이 더 빠르면 그때까지.
 */

export type ProposalStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: '일행 동의를 모으는 중',
  SENT: '답을 기다리는 중',
  ACCEPTED: '수락됨',
  REJECTED: '거절됨',
  EXPIRED: '만료됨',
  CANCELLED: '취소됨',
};

/** 약속 상태 (정리문서 5장 "약속"). 전이 표와 시간 규칙은 appointment.ts에 있습니다. */
export type AppointmentStatus =
  | 'PENDING_CONFIRM' // 확정 대기
  | 'CONFIRMED' // 확정
  | 'IN_PROGRESS' // 만남 중
  | 'ENDED' // 종료
  | 'ENDED_EARLY' // 중간 종료
  | 'CANCELLED' // 취소
  | 'RESCHEDULING' // 다시 정하기
  | 'ON_HOLD' // 보류
  | 'AUTO_ENDED'; // 자동 종료 (행사 취소)

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING_CONFIRM: '확정 대기',
  CONFIRMED: '확정',
  IN_PROGRESS: '만남 중',
  ENDED: '종료',
  ENDED_EARLY: '중간 종료',
  CANCELLED: '취소',
  RESCHEDULING: '다시 정하기',
  ON_HOLD: '보류',
  AUTO_ENDED: '자동 종료',
};

const HOUR_MS = 60 * 60 * 1000;

/** 한국 시간 'YYYY-MM-DD' + 'HH:MM' → 실제 시각 */
export function seoulDateTime(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h - 9, mi));
}

/**
 * 제안 만료 시각: 보낸 뒤 N시간, 또는 행사 시작 M시간 전 중 더 빠른 때. (정책 값 2)
 * 이미 행사 M시간 전이 지났으면 null (보낼 수 없음)
 */
export function proposalExpiresAt(
  now: Date,
  eventDay: { date: string; startTime: string },
  policy: { expireHours: number; eventCutoffHours: number },
): Date | null {
  const cutoff = new Date(seoulDateTime(eventDay.date, eventDay.startTime).getTime() - policy.eventCutoffHours * HOUR_MS);
  if (cutoff.getTime() <= now.getTime()) return null;
  const normal = new Date(now.getTime() + policy.expireHours * HOUR_MS);
  return normal < cutoff ? normal : cutoff;
}

/** 남은 시간 글: '23시간 남음', '45분 남음' */
export function describeRemaining(expiresAt: string | Date, now: Date): string {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return '만료됨';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}분 남음`;
  return `${Math.floor(minutes / 60)}시간 남음`;
}

/** 상대 (공개 정보만) */
export interface Counterpart {
  userId: string;
  nickname: string;
  avatarInitial: string;
  avatarColor: string;
}

/** 제안 (앱이 받는 모양) */
export interface ProposalView {
  id: string;
  direction: 'RECEIVED' | 'SENT';
  status: ProposalStatus;
  counterpart: Counterpart;
  event: { id: string; name: string };
  /** 행사 일정이 바뀌어 이 날·장소가 없어지면 id는 null (날짜·이름은 남음) */
  day: { id: string | null; date: string };
  segments: Array<{ id: string; label: string; startTime: string; endTime: string }>;
  meetingSpot: { id: string | null; name: string };
  expiresAt: string;
  createdAt: string;
  /** 일행이 보낸 제안이면 일행원들 (제안을 만든 사람 포함). 받는 사람에게도 보입니다. 개인 제안이면 null */
  party: { id: string | null; members: Counterpart[] } | null;
  /** 일행 제안 초안일 때: 일행원의 동의 상황 (보낸 쪽 일행원에게만) */
  consent: { agreed: number; total: number; members: Array<{ userId: string; nickname: string; agreed: boolean; isMe: boolean }>; needsMyAgreement: boolean } | null;
  /** 내가 취소할 수 있는지 (보낸 사람, 또는 보낸 일행의 일행원) */
  canCancel: boolean;
}

/** 제안 보내기 입력 */
export interface ProposalInput {
  receiverId: string;
  eventDayId: string;
  segmentIds: string[];
  meetingSpotId: string;
}
