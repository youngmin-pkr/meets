/**
 * 만남 중 안전 (정리문서 2장 "안전", 정책 값 9·10·19)
 *
 * - 도움 요청: '불편해서 벗어나고 싶어요'는 약속을 끝내고 운영팀에 가장 먼저 접수합니다. 상대에게 사유는 보이지 않습니다.
 * - 믿는 사람에게 알리기: 링크 하나로 행사·시간·장소·동행 별명만 보여 줍니다. 연락처는 받지 않습니다.
 * - 안전 확인: 만남 중 최대 2번, 60분 간격. 답이 없으면 10분 뒤 한 번 더, 그래도 없으면 믿는 사람 링크에 알립니다(켜 둔 경우만).
 * TODO(11단계): 청소년이면 도움 요청이 보호자 알림으로 이어집니다.
 */
import type { AppointmentStatus } from './proposal';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * 도움 요청을 할 수 있는 때: 도착 버튼이 열리는 때(약속 시각 1시간 전)부터 약속이 끝날 때까지, 확정된 약속이나 만남 중일 때
 * 그 밖의 때에는 '나중에 신고할게요'로 안내합니다.
 */
export function canRequestHelp(
  status: AppointmentStatus,
  now: Date,
  times: { startsAt: Date; endsAt: Date },
  arrivalOpenMinutes: number,
): boolean {
  if (status !== 'CONFIRMED' && status !== 'IN_PROGRESS') return false;
  return now.getTime() >= times.startsAt.getTime() - arrivalOpenMinutes * MINUTE && now < times.endsAt;
}

export interface SafetyPolicy {
  maxCount: number;
  intervalMinutes: number;
  reaskMinutes: number;
}

/** 안전 확인을 묻는 시각들: 만남이 시작되고 60분 뒤부터 60분 간격으로 최대 2번. 약속이 끝나기 전의 것만 */
export function safetyCheckTimes(startsAt: Date, endsAt: Date, p: SafetyPolicy): Date[] {
  const times: Date[] = [];
  for (let k = 1; k <= p.maxCount; k++) {
    const at = new Date(startsAt.getTime() + k * p.intervalMinutes * MINUTE);
    if (at >= endsAt) break;
    times.push(at);
  }
  return times;
}

/** 이미 물어본 안전 확인 한 건의 상태 */
export interface SafetyCheckFacts {
  seq: number;
  askedAt: Date;
  remindedAt: Date | null;
  answeredAt: Date | null;
  alertedAt: Date | null;
}

export type SafetyStep =
  | { kind: 'ASK'; seq: number }
  | { kind: 'REMIND'; seq: number }
  | { kind: 'ALERT'; seq: number };

/**
 * 지금 해야 할 일 (순서대로)
 * - 묻기: 정해진 시각이 지났고 아직 안 물었으면
 * - 다시 묻기: 물어본 지 10분이 지나도 답이 없으면 한 번만
 * - 알리기: 다시 물어본 지 10분이 지나도 답이 없으면 한 번만 (믿는 사람에게 알리는 설정은 호출하는 쪽에서 확인)
 */
export function dueSafetySteps(
  startsAt: Date,
  endsAt: Date,
  checks: SafetyCheckFacts[],
  now: Date,
  p: SafetyPolicy,
): SafetyStep[] {
  const steps: SafetyStep[] = [];
  const times = safetyCheckTimes(startsAt, endsAt, p);
  times.forEach((at, i) => {
    const seq = i + 1;
    const c = checks.find((x) => x.seq === seq);
    if (!c) {
      if (now >= at) steps.push({ kind: 'ASK', seq });
      return;
    }
    if (c.answeredAt) return;
    if (!c.remindedAt) {
      if (now.getTime() >= c.askedAt.getTime() + p.reaskMinutes * MINUTE) steps.push({ kind: 'REMIND', seq });
      return;
    }
    if (!c.alertedAt && now.getTime() >= c.remindedAt.getTime() + p.reaskMinutes * MINUTE) steps.push({ kind: 'ALERT', seq });
  });
  return steps;
}

/** 믿는 사람 링크가 사라지는 시각: 약속이 끝나고 N시간 뒤 */
export function shareLinkExpiresAt(endsAt: Date, hoursAfterEnd: number): Date {
  return new Date(endsAt.getTime() + hoursAfterEnd * HOUR);
}

/** 믿는 사람 링크 화면에 보이는 내용. 연락처·계정·채팅·상대 프로필은 어디에도 없습니다. */
export type SharedStatus = 'UPCOMING' | 'ARRIVED' | 'ENDED' | 'CANCELLED';
export type SharedAlert = 'HELP' | 'NO_RESPONSE';

export interface SharedAppointmentView {
  eventName: string;
  /** 약속 시각 글 (예: '12.13 (일) 14:00') */
  when: string;
  spotName: string;
  /** 동행의 별명만 */
  companion: string;
  /** '도착·종료 상태도 보여 주기'를 켰을 때만 값이 있음 */
  status: SharedStatus | null;
  arrivedAt: string | null;
  /** 믿는 사람 알림을 미리 켜 둔 경우에만, 도움 요청이나 안전 확인 무응답 때 */
  alert: { kind: SharedAlert; at: string } | null;
  /** 이 링크가 사라지는 시각 */
  expiresAt: string;
}

export const SHARED_STATUS_LABELS: Record<SharedStatus, string> = {
  UPCOMING: '아직 만나기 전이에요',
  ARRIVED: '약속 장소에 도착했어요',
  ENDED: '만남이 끝났어요',
  CANCELLED: '약속이 취소됐어요',
};

export const SHARED_ALERT_LABELS: Record<SharedAlert, string> = {
  HELP: '도움이 필요하다고 알렸어요. 연락해 보세요.',
  NO_RESPONSE: '안전 확인에 답이 없어요. 연락해 보세요.',
};

/** 약속 상태와 도착 기록으로 링크 화면의 상태를 정합니다. 안전 종료·취소의 이유는 드러내지 않고 '끝났어요·취소됐어요'로만 보입니다. */
export function sharedStatusOf(status: AppointmentStatus, arrivedAt: Date | null): SharedStatus {
  switch (status) {
    case 'ENDED':
    case 'ENDED_EARLY':
    case 'AUTO_ENDED':
      return 'ENDED';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return arrivedAt ? 'ARRIVED' : 'UPCOMING';
  }
}

/** 앱이 받는 안전 설정 */
export interface SafetySettings {
  /** 안전 확인 받기 (기본 켜짐) */
  checkEnabled: boolean;
  /** 도움 요청이나 안전 확인 무응답 때 믿는 사람 링크에도 알리기 (기본 꺼짐) */
  alertTrusted: boolean;
}

export const DEFAULT_SAFETY_SETTINGS: SafetySettings = { checkEnabled: true, alertTrusted: false };

/** 링크 만들기 결과 (내가 믿는 사람에게 보내는 링크) */
export interface ShareLinkView {
  id: string;
  appointmentId: string;
  /** 보낼 주소. 데모에서는 열리지 않는 예시 주소 */
  url: string;
  showStatus: boolean;
  expiresAt: string;
  /** 받는 사람에게 이렇게 보여요 (링크 화면과 같은 내용) */
  preview: SharedAppointmentView;
  /** 목록에서 알아보기 위한 약속 정보 */
  eventName: string;
}

/** 도움 요청 결과 */
export interface HelpResult {
  ended: true;
  reported: true;
  /** 믿는 사람 링크에 알렸는지 (미리 켜 둔 경우에만) */
  trustedNotified: boolean;
}
