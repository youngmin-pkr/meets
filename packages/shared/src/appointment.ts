/**
 * 약속 (정리문서 2장 "약속", 5장 "약속" 상태, 6장 정책 값 5·6·7·14)
 *
 * 서버와 데모가 같은 규칙을 쓰도록 시간 계산과 상태 전이 표를 여기에 둡니다.
 * 상태를 실제로 저장하는 곳은 서버의 appointment-state.service.ts 한 곳뿐입니다.
 */
import type { PolicyKey } from './policy';
import { honorific } from './notification';
import { seoulDateTime, type AppointmentStatus, type Counterpart } from './proposal';

/** 약속의 두 쪽: 제안을 보낸 쪽(A)과 받은 쪽(B). 일행이 있으면 한 쪽에 여러 명이 있을 수 있습니다. */
export type AppointmentSide = 'A' | 'B';
export const otherSide = (side: AppointmentSide): AppointmentSide => (side === 'A' ? 'B' : 'A');

export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'PENDING_CONFIRM',
  'CONFIRMED',
  'IN_PROGRESS',
  'ENDED',
  'ENDED_EARLY',
  'CANCELLED',
  'RESCHEDULING',
  'ON_HOLD',
  'AUTO_ENDED',
];

/** 끝난 약속 (더 바뀌지 않음) */
export const CLOSED_APPOINTMENT_STATUSES: AppointmentStatus[] = ['ENDED', 'ENDED_EARLY', 'CANCELLED', 'AUTO_ENDED'];

/** 시간이 겹치면 안 되는 약속 (진행 중인 약속) */
export const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = ['PENDING_CONFIRM', 'CONFIRMED', 'IN_PROGRESS', 'RESCHEDULING'];

/** 약속 상태 전이 표 (정리문서 5장 "약속"). 표에 있는 전이만 허용합니다. */
export const APPOINTMENT_TRANSITIONS: Array<{ from: AppointmentStatus; to: AppointmentStatus; condition: string }> = [
  { from: 'PENDING_CONFIRM', to: 'CONFIRMED', condition: "전날 양쪽이 '갈 수 있어요'를 누름" },
  { from: 'PENDING_CONFIRM', to: 'CANCELLED', condition: '누구든 취소. 확인 마감까지 확인하지 않아도 취소' },
  { from: 'CONFIRMED', to: 'CANCELLED', condition: '누구든 취소. 이르면 영향 없음, 임박하면 영향' },
  { from: 'CONFIRMED', to: 'IN_PROGRESS', condition: '약속 시각이 됨' },
  { from: 'IN_PROGRESS', to: 'ENDED', condition: '만남이 끝남' },
  { from: 'IN_PROGRESS', to: 'ENDED_EARLY', condition: '노쇼(양쪽 도착 기록 비교) 또는 안전 종료' },
  { from: 'CONFIRMED', to: 'RESCHEDULING', condition: '행사 일정이 바뀜' },
  { from: 'PENDING_CONFIRM', to: 'RESCHEDULING', condition: '행사 일정이 바뀜 (확정 전이어도 같음, 2026-11-08 추가)' },
  { from: 'RESCHEDULING', to: 'CONFIRMED', condition: '양쪽이 바뀐 일정을 다시 확인' },
  { from: 'RESCHEDULING', to: 'ON_HOLD', condition: '기한 안에 정하지 못함. 신뢰 단계 영향 없음' },
  { from: 'CONFIRMED', to: 'ENDED_EARLY', condition: "안전 종료('벗어나고 싶어요'). 도착 버튼이 열린 뒤 만남이 시작되기 전에도 가능 (2026-11-10 추가)" },
  { from: 'RESCHEDULING', to: 'CANCELLED', condition: '차단으로 약속이 끝남 (2026-11-09 추가)' },
  { from: 'ON_HOLD', to: 'CANCELLED', condition: '차단으로 약속이 끝남 (2026-11-09 추가)' },
  ...(['PENDING_CONFIRM', 'CONFIRMED', 'IN_PROGRESS', 'RESCHEDULING', 'ON_HOLD'] as AppointmentStatus[]).map((from) => ({
    from,
    to: 'AUTO_ENDED' as AppointmentStatus,
    condition: '행사가 취소됨. 신뢰 단계 영향 없음, 후기 요청 없음',
  })),
];

export function canTransitionAppointment(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return APPOINTMENT_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

/** 약속을 만들 때 저장해 두는 정책 값. 정책 값이 바뀌어도 이미 만든 약속에는 소급하지 않습니다. (정리문서 6장) */
export interface AppointmentPolicy {
  dayBeforeHour: number;
  confirmDeadlineHours: number;
  confirmReminderHours: number;
  freeCancelHours: number;
  noShowWaitMinutes: number;
  soonMinutes: number;
  arrivalOpenMinutes: number;
}

export const APPOINTMENT_POLICY_KEYS = [
  'APPOINTMENT_DAY_BEFORE_HOUR',
  'APPOINTMENT_CONFIRM_DEADLINE_HOURS',
  'APPOINTMENT_CONFIRM_REMINDER_HOURS',
  'APPOINTMENT_FREE_CANCEL_HOURS',
  'APPOINTMENT_NO_SHOW_WAIT_MINUTES',
  'APPOINTMENT_SOON_MINUTES',
  'APPOINTMENT_ARRIVAL_OPEN_MINUTES',
] as const satisfies readonly PolicyKey[];

export function appointmentPolicyFrom(v: Record<(typeof APPOINTMENT_POLICY_KEYS)[number], number>): AppointmentPolicy {
  return {
    dayBeforeHour: v.APPOINTMENT_DAY_BEFORE_HOUR,
    confirmDeadlineHours: v.APPOINTMENT_CONFIRM_DEADLINE_HOURS,
    confirmReminderHours: v.APPOINTMENT_CONFIRM_REMINDER_HOURS,
    freeCancelHours: v.APPOINTMENT_FREE_CANCEL_HOURS,
    noShowWaitMinutes: v.APPOINTMENT_NO_SHOW_WAIT_MINUTES,
    soonMinutes: v.APPOINTMENT_SOON_MINUTES,
    arrivalOpenMinutes: v.APPOINTMENT_ARRIVAL_OPEN_MINUTES,
  };
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** 약속 시간: 고른 구간의 처음~끝. 구간이 없는 날은 행사 시간 전체 */
export function appointmentWindow(
  day: { startTime: string; endTime: string },
  segments: Array<{ startTime: string; endTime: string }>,
): { startTime: string; endTime: string } {
  if (segments.length === 0) return { startTime: day.startTime, endTime: day.endTime };
  const starts = segments.map((s) => s.startTime).sort();
  const ends = segments.map((s) => s.endTime).sort();
  return { startTime: starts[0], endTime: ends[ends.length - 1] };
}

export interface TimeRange {
  startsAt: Date;
  endsAt: Date;
}

export function rangeOf(date: string, startTime: string, endTime: string): TimeRange {
  return { startsAt: seoulDateTime(date, startTime), endsAt: seoulDateTime(date, endTime) };
}

/** 두 시간이 겹치는지 (끝나는 순간에 시작하는 것은 겹치지 않음) */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

function previousDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/**
 * 전날 확인 일정
 * - opensAt: 전날 N시에 확인 요청 (이때부터 '갈 수 있어요'를 누를 수 있음)
 * - deadline: 약속 M시간 전까지 둘 다 확인하지 않으면 취소
 * - reminderAt: 마감 K시간 전에 재촉 알림 1번
 */
export function confirmSchedule(date: string, startTime: string, policy: AppointmentPolicy) {
  const startsAt = seoulDateTime(date, startTime);
  const opensAt = seoulDateTime(previousDate(date), hh(policy.dayBeforeHour));
  let deadline = new Date(startsAt.getTime() - policy.confirmDeadlineHours * HOUR);
  if (deadline <= opensAt) deadline = startsAt;
  let reminderAt = new Date(deadline.getTime() - policy.confirmReminderHours * HOUR);
  if (reminderAt < opensAt) reminderAt = opensAt;
  return { opensAt, deadline, reminderAt };
}

/** 이 시각 이후 취소는 '임박 취소' */
export function freeCancelUntil(date: string, startTime: string, policy: AppointmentPolicy): Date {
  return new Date(seoulDateTime(date, startTime).getTime() - policy.freeCancelHours * HOUR);
}

/** 행사 변경 후 다시 정하기 기한: N시간 뒤, 행사까지 그보다 적게 남았으면 행사 M시간 전 (정책 값 14) */
export function rescheduleDeadline(now: Date, startsAt: Date, policy: { hours: number; eventCutoffHours: number }): Date {
  const normal = new Date(now.getTime() + policy.hours * HOUR);
  const cutoff = new Date(startsAt.getTime() - policy.eventCutoffHours * HOUR);
  const d = normal < cutoff ? normal : cutoff;
  return d < now ? now : d;
}

/** 약속 한 사람의 기록 */
export interface ParticipantFacts {
  userId: string;
  confirmedAt: Date | null;
  rescheduleConfirmedAt: Date | null;
  arrivedAt: Date | null;
  dayBeforeNotifiedAt: Date | null;
  reminderNotifiedAt: Date | null;
  soonNotifiedAt: Date | null;
  /** 제안을 보낸 쪽(A) / 받은 쪽(B). 없으면 A로 봅니다 */
  side?: AppointmentSide;
  /** 이 사람이 '안 나왔어요'를 이미 눌렀는지 */
  noShowReportedAt?: Date | null;
}

/** 시간 규칙 계산에 필요한 약속 정보. participants에는 아직 빠지지 않은 사람만 넣습니다. */
export interface AppointmentFacts {
  status: AppointmentStatus;
  date: string;
  startTime: string;
  endTime: string;
  policy: AppointmentPolicy;
  rescheduleDeadline: Date | null;
  /** 데모 전용: 전날 확인을 바로 열어 둘 때 */
  confirmOpensAt?: Date | null;
  participants: ParticipantFacts[];
}

export function factsTimes(f: AppointmentFacts) {
  const { startsAt, endsAt } = rangeOf(f.date, f.startTime, f.endTime);
  const c = confirmSchedule(f.date, f.startTime, f.policy);
  const opensAt = f.confirmOpensAt && f.confirmOpensAt < c.opensAt ? f.confirmOpensAt : c.opensAt;
  return { startsAt, endsAt, ...c, opensAt };
}

/** 양쪽에 한 명 이상 남아 있는지 */
export function sidesRemain(people: Array<{ side?: AppointmentSide }>): boolean {
  return (['A', 'B'] as AppointmentSide[]).every((side) => people.some((p) => (p.side ?? 'A') === side));
}

/** 시간이 되어 저절로 일어나는 일 */
export type AppointmentStep =
  | { kind: 'NOTIFY_DAY_BEFORE'; userIds: string[] }
  | { kind: 'NOTIFY_REMINDER'; userIds: string[] }
  /** 확인 마감: 한 쪽에 확인한 사람이 한 명도 없어 약속이 취소됨 */
  | { kind: 'CANCEL_NO_CONFIRM'; noResponseUserIds: string[] }
  /** 확인 마감: 확인하지 않은 사람만 빠지고, 확인한 사람들끼리 확정 (양쪽에 한 명 이상 남을 때) */
  | { kind: 'DROP_NO_CONFIRM'; noResponseUserIds: string[] }
  | { kind: 'NOTIFY_SOON'; userIds: string[] }
  | { kind: 'START' }
  | { kind: 'END' }
  | { kind: 'HOLD' };

/** 지금 해야 할 일 (순서대로) */
export function dueAppointmentSteps(f: AppointmentFacts, now: Date): AppointmentStep[] {
  const t = factsTimes(f);
  const steps: AppointmentStep[] = [];
  const ids = (pick: (p: ParticipantFacts) => boolean) => f.participants.filter(pick).map((p) => p.userId);

  if (f.status === 'PENDING_CONFIRM') {
    if (now >= t.deadline) {
      const silent = ids((p) => !p.confirmedAt);
      steps.push({ kind: sidesRemain(f.participants.filter((p) => !!p.confirmedAt)) ? 'DROP_NO_CONFIRM' : 'CANCEL_NO_CONFIRM', noResponseUserIds: silent });
      return steps;
    }
    if (now >= t.opensAt) {
      const first = ids((p) => !p.dayBeforeNotifiedAt && !p.confirmedAt);
      if (first.length) steps.push({ kind: 'NOTIFY_DAY_BEFORE', userIds: first });
      // 재촉은 1번만, 그리고 확인 요청을 재촉 시각보다 먼저 받은 사람에게만
      if (now >= t.reminderAt) {
        const remind = ids((p) => !p.confirmedAt && !p.reminderNotifiedAt && !!p.dayBeforeNotifiedAt && p.dayBeforeNotifiedAt < t.reminderAt);
        if (remind.length) steps.push({ kind: 'NOTIFY_REMINDER', userIds: remind });
      }
    }
    return steps;
  }
  if (f.status === 'CONFIRMED') {
    if (now >= t.startsAt) {
      steps.push({ kind: 'START' });
      if (now >= t.endsAt) steps.push({ kind: 'END' });
      return steps;
    }
    if (now >= new Date(t.startsAt.getTime() - f.policy.soonMinutes * MINUTE)) {
      const soon = ids((p) => !p.soonNotifiedAt);
      if (soon.length) steps.push({ kind: 'NOTIFY_SOON', userIds: soon });
    }
    return steps;
  }
  if (f.status === 'IN_PROGRESS' && now >= t.endsAt) steps.push({ kind: 'END' });
  if (f.status === 'RESCHEDULING' && f.rescheduleDeadline && now >= f.rescheduleDeadline) steps.push({ kind: 'HOLD' });
  return steps;
}

/** 지금 이 사람이 누를 수 있는 버튼 (서버가 판단해서 화면에 알려 줍니다) */
export interface AppointmentActions {
  confirm: boolean;
  reconfirm: boolean;
  cancel: boolean;
  arrive: boolean;
  reportNoShow: boolean;
}

export function appointmentActions(f: AppointmentFacts, me: string, now: Date, opts: { newScheduleAvailable: boolean }): AppointmentActions {
  const t = factsTimes(f);
  const mine = f.participants.find((p) => p.userId === me);
  const others = f.participants.filter((p) => p.userId !== me);
  const none: AppointmentActions = { confirm: false, reconfirm: false, cancel: false, arrive: false, reportNoShow: false };
  if (!mine || others.length === 0) return none;
  const meetingTime = f.status === 'CONFIRMED' || f.status === 'IN_PROGRESS';
  return {
    confirm: f.status === 'PENDING_CONFIRM' && now >= t.opensAt && now < t.deadline && !mine.confirmedAt,
    reconfirm:
      f.status === 'RESCHEDULING' && opts.newScheduleAvailable && !!f.rescheduleDeadline && now < f.rescheduleDeadline && !mine.rescheduleConfirmedAt,
    cancel: (f.status === 'PENDING_CONFIRM' || f.status === 'CONFIRMED') && now < t.startsAt,
    arrive: meetingTime && now >= new Date(t.startsAt.getTime() - f.policy.arrivalOpenMinutes * MINUTE) && now < t.endsAt && !mine.arrivedAt,
    reportNoShow:
      f.status === 'IN_PROGRESS' &&
      !!mine.arrivedAt &&
      !mine.noShowReportedAt &&
      others.some((o) => !o.arrivedAt) &&
      now >= new Date(t.startsAt.getTime() + f.policy.noShowWaitMinutes * MINUTE),
  };
}

/** 취소 사유 (상대에게 간단히 전달됩니다) */
export const CANCEL_REASONS = {
  SCHEDULE_CONFLICT: '일정이 겹쳤어요',
  SICK: '몸이 안 좋아요',
  TRAVEL: '이동이 어려워졌어요',
  CANT_ATTEND: '행사에 못 가게 됐어요',
  OTHER: '다른 이유',
} as const;
export type CancelReason = keyof typeof CANCEL_REASONS;
export const CANCEL_REASON_CODES = Object.keys(CANCEL_REASONS) as CancelReason[];

/** 약속이 끝난 이유 */
export type AppointmentEndReason = 'CANCELLED' | 'NO_CONFIRM' | 'NO_SHOW' | 'EVENT_CANCELLED';

/** 다시 정하기 사유 */
export type RescheduleReason = 'EVENT_CHANGED' | 'MEMBERS_CHANGED';

/** '하늘님' / '하늘님 외 2명': 화면에서 함께하는 사람들을 부르는 말 (1:1이면 상대 한 명) */
export function companionsLabel(x: { counterpart: Counterpart; companions?: Counterpart[] }): string {
  const names = (x.companions && x.companions.length > 0 ? x.companions : [x.counterpart]).map((c) => c.nickname);
  return honorific(groupName(names));
}

/** 약속에 함께하는 다른 사람 (이미 빠진 사람은 없음) */
export interface AppointmentCompanion extends Counterpart {
  /** 나와 같은 쪽(일행)인지 */
  sameSide: boolean;
  confirmed: boolean;
  arrivedAt: string | null;
}

/** '하늘' / '하늘 외 2명' */
export function groupName(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names[0]} 외 ${names.length - 1}명`;
}

/** 약속 (앱이 받는 모양) */
export interface AppointmentView {
  id: string;
  status: AppointmentStatus;
  /** 1:1이면 상대, 여러 명이 만나면 첫 번째 상대 */
  counterpart: Counterpart;
  /** 나를 뺀 함께하는 사람들 (1:1이면 상대 한 명) */
  companions: AppointmentCompanion[];
  event: { id: string; name: string };
  day: { id: string | null; date: string; startTime: string };
  segments: Array<{ id: string; label: string; startTime: string; endTime: string }>;
  meetingSpot: { id: string | null; name: string };
  createdAt: string;
  startsAt: string;
  endsAt: string;
  /** 전날 확인 */
  confirm: { opensAt: string; deadline: string; mine: boolean; theirs: boolean };
  /** 도착 기록 (theirs: 다른 사람 중 가장 먼저 도착한 시각) */
  arrival: { mine: string | null; theirs: string | null };
  /** 이 시각까지 취소하면 영향 없음 */
  freeCancelUntil: string;
  /** 행사 일정이 바뀌었을 때 */
  reschedule: {
    deadline: string;
    mine: boolean;
    theirs: boolean;
    /** 바뀐 일정. 이 날이 없어졌으면 null (다시 정할 수 없고, 기한이 지나면 보류) */
    newSchedule: { date: string; startTime: string; endTime: string } | null;
    /** 행사 일정이 바뀌어서인지, 함께하는 사람이 줄어서인지 */
    reason: RescheduleReason;
  } | null;
  /** 끝난 이유 */
  end: { reason: AppointmentEndReason; byMe: boolean; cancelReason: string | null; late: boolean } | null;
  actions: AppointmentActions;
  /** 오늘 할 일로 보여 줄지 (지금 눌러야 하는 것이 있음) */
  needsAction: boolean;
  /** 이 약속 채팅에서 내가 아직 읽지 않은 상대 메시지 수 */
  unreadMessages: number;
  /** 후기: 남길 수 있는지, 이미 남겼는지, 마지막 시각 (후기 내용은 어디에도 돌려주지 않음) */
  review: { canWrite: boolean; done: boolean; deadline: string; /** 아직 후기를 남기지 않은 상대들 (후기는 한 사람씩 따로 남김) */ targets: Counterpart[] };
  /** 안전: 지금 도움을 요청할 수 있는지, 답을 기다리는 안전 확인 */
  safety: { canRequestHelp: boolean; pendingCheck: { id: string; askedAt: string; minutesSinceStart: number } | null };
}

/** D-day 글 (한국 날짜 기준) */
export function dDayLabel(date: string, today: string): string {
  const toDays = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / (24 * HOUR);
  };
  const n = toDays(date) - toDays(today);
  if (n === 0) return 'D-DAY';
  return n > 0 ? `D-${n}` : `D+${-n}`;
}

// ───────────── 여러 명이 만나는 약속에서 누가 빠질 때 (정리문서 2장 일행, 9-2a) ─────────────

/** 약속에서 빠지는 사람이 생겼을 때 약속이 어떻게 되는지 */
export type LeaveOutcome =
  /** 그 사람의 쪽에 아무도 남지 않아 약속이 취소됨 */
  | { kind: 'CANCEL_ALL' }
  /** 남은 사람끼리 계속. reconfirmSide가 있으면 그 쪽이 다시 확인해야 함 */
  | { kind: 'CONTINUE'; reconfirmSide: AppointmentSide | null; becomesConfirmed: boolean };

/**
 * - 한 쪽이 비면 약속은 취소됩니다.
 * - 확정된 약속에서 빠지면 상대 쪽이 다시 확인합니다. (RESCHEDULING, 사유 MEMBERS_CHANGED)
 * - 확정 대기에서 빠지면 남은 사람이 모두 이미 확인했을 때 바로 확정됩니다.
 * - 만남 중에 빠지면 그냥 남은 사람끼리 계속합니다.
 */
export function outcomeOfLeaving(
  status: AppointmentStatus,
  people: Array<{ userId: string; side?: AppointmentSide; confirmedAt?: Date | null }>,
  leaverId: string,
): LeaveOutcome {
  const leaver = people.find((p) => p.userId === leaverId);
  const rest = people.filter((p) => p.userId !== leaverId);
  const side = leaver?.side ?? 'A';
  if (!sidesRemain(rest)) return { kind: 'CANCEL_ALL' };
  if (status === 'CONFIRMED') return { kind: 'CONTINUE', reconfirmSide: otherSide(side), becomesConfirmed: false };
  if (status === 'PENDING_CONFIRM') return { kind: 'CONTINUE', reconfirmSide: null, becomesConfirmed: rest.every((p) => !!p.confirmedAt) };
  return { kind: 'CONTINUE', reconfirmSide: null, becomesConfirmed: false };
}

/**
 * 노쇼 신고를 눌렀을 때 (정리문서 2장 약속, 9-2a): 도착하지 않은 사람마다 신고가 접수되고,
 * 다른 사람이 아무도 도착하지 않았을 때만 만남이 끝납니다. 일부만 안 왔으면 만남은 계속됩니다.
 */
export function noShowOutcome(me: string, people: Array<{ userId: string; arrivedAt?: Date | null }>): { targets: string[]; endsMeeting: boolean } {
  const others = people.filter((p) => p.userId !== me);
  return { targets: others.filter((p) => !p.arrivedAt).map((p) => p.userId), endsMeeting: others.every((p) => !p.arrivedAt) };
}
