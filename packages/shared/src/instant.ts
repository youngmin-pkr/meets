/**
 * 즉석 동행 (정리문서 2장 "즉석 동행", 6장 정책 값 1·3·18)
 *
 * - 행사 당일, 행사 시간 안에 사용자가 직접 '지금 행사장에 있어요'를 켜면 후보 풀에 들어갑니다. 위치(좌표)는 받지 않습니다.
 * - 나를 뺀 대기 인원이 5명 미만이면 사람 수만 알려 주고, 5명 이상일 때만 후보 목록을 보여 줍니다.
 * - 만남은 지금부터 60분 이내, 22시를 넘기지 않습니다.
 * TODO(법률 검토): GPS로 행사장 안인지 확인하는 방식은 위치 정보 이용 동의를 정한 뒤에 넣습니다.
 * 청소년은 쓸 수 없습니다. (11단계 청소년 모드 전까지 청소년 가입이 막혀 있음)
 */
import { seoulDateTime } from './proposal';
import type { MatchDay, MatchPolicy, MatchProfile } from './matching';

const MINUTE = 60 * 1000;

export interface InstantDay {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  segments: Array<{ id: string; label: string; startTime: string; endTime: string }>;
}

export interface InstantPolicy {
  /** 후보가 열리는 최소 대기 인원 */
  minWaiting: number;
  endHour: number;
  presenceMinutes: number;
  windowMinutes: number;
  minOverlapMinutes: number;
}

export type InstantClosedReason = 'NOT_TODAY' | 'NOT_STARTED' | 'ENDED' | 'AFTER_HOURS' | 'NOT_ALLOWED';

export const INSTANT_CLOSED_MESSAGES: Record<InstantClosedReason, string> = {
  NOT_TODAY: '즉석 동행은 행사가 열리는 날에만 쓸 수 있어요.',
  NOT_STARTED: '행사가 시작하면 쓸 수 있어요.',
  ENDED: '오늘 행사 시간이 끝났어요.',
  AFTER_HOURS: '즉석 동행은 밤 늦은 시간에는 쓸 수 없어요.',
  NOT_ALLOWED: '지금은 즉석 동행을 쓸 수 없어요. 최근 기록에 따라 잠시 제한돼요.',
};

/** 한국 시간 'HH:MM' */
export function hmOf(at: Date): string {
  const k = new Date(at.getTime() + 9 * 60 * MINUTE);
  return `${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
}

/** 한국 날짜 'YYYY-MM-DD' */
export function seoulDateOf(at: Date): string {
  return new Date(at.getTime() + 9 * 60 * MINUTE).toISOString().slice(0, 10);
}

export interface InstantWindow {
  from: string;
  to: string;
  minutes: number;
  fromAt: Date;
  toAt: Date;
}

/**
 * 지금 즉석 동행을 쓸 수 있는지, 쓸 수 있으면 만날 수 있는 시간대(지금~최대 60분 뒤, 행사 끝·22시 이전)
 * 오늘 열리는 날이 여러 개일 수는 없으므로(날짜가 하루에 하나) 오늘 날짜의 날을 찾습니다.
 */
export function instantWindowNow(
  days: InstantDay[],
  now: Date,
  p: Pick<InstantPolicy, 'endHour' | 'windowMinutes' | 'minOverlapMinutes'>,
): { ok: true; day: InstantDay; window: InstantWindow } | { ok: false; reason: Exclude<InstantClosedReason, 'NOT_ALLOWED'>; day: InstantDay | null } {
  const today = seoulDateOf(now);
  const day = days.find((d) => d.date === today) ?? null;
  if (!day) return { ok: false, reason: 'NOT_TODAY', day: null };
  const startsAt = seoulDateTime(day.date, day.startTime);
  const hardEnd = seoulDateTime(day.date, `${String(p.endHour).padStart(2, '0')}:00`);
  const eventEnd = seoulDateTime(day.date, day.endTime);
  if (now < startsAt) return { ok: false, reason: 'NOT_STARTED', day };
  const endsAt = eventEnd < hardEnd ? eventEnd : hardEnd;
  // 분 단위로 맞춥니다 (지금 시각은 분 아래를 버림)
  const fromAt = new Date(Math.floor(now.getTime() / MINUTE) * MINUTE);
  const toAt = new Date(Math.min(fromAt.getTime() + p.windowMinutes * MINUTE, endsAt.getTime()));
  const minutes = Math.round((toAt.getTime() - fromAt.getTime()) / MINUTE);
  if (minutes < p.minOverlapMinutes) return { ok: false, reason: hardEnd <= eventEnd ? 'AFTER_HOURS' : 'ENDED', day };
  return { ok: true, day, window: { from: hmOf(fromAt), to: hmOf(toAt), minutes, fromAt, toAt } };
}

/** 켜 둔 사람의 만남 가능 시간: 지금부터, 켜 둔 시간(until)과 위의 시간대 중 더 이른 때까지 */
export function presenceWindow(window: InstantWindow, until: Date): { arriveTime: string; leaveTime: string } | null {
  const toAt = until < window.toAt ? until : window.toAt;
  if (toAt <= window.fromAt) return null;
  return { arriveTime: window.from, leaveTime: hmOf(toAt) };
}

/** 후보 매칭에 쓰는 오늘의 한 날: 구간은 모두 '같이'로 봅니다. (즉석은 구간을 따로 고르지 않음) */
export function instantMatchDay(day: InstantDay): MatchDay {
  return { id: day.id, date: day.date, startTime: day.startTime, endTime: day.endTime, segments: day.segments };
}

export function instantProfileDay(day: InstantDay, w: { arriveTime: string; leaveTime: string }): MatchProfile['days'][number] {
  return { eventDayId: day.id, arriveTime: w.arriveTime, leaveTime: w.leaveTime, togetherSegmentIds: day.segments.map((s) => s.id) };
}

/** 즉석 동행용 매칭 정책: 일반 매칭 규칙에서 필요한 겹침 시간만 짧게 */
export function instantMatchPolicy(base: MatchPolicy, p: Pick<InstantPolicy, 'minOverlapMinutes'>): MatchPolicy {
  return { ...base, minOverlapMinutes: p.minOverlapMinutes, shortOverlapMinutes: p.minOverlapMinutes };
}

/** 후보 목록이 열렸는지: 나를 뺀 대기 인원이 기준 이상 */
export function instantWaiting(othersCount: number, minWaiting: number): { count: number; min: number; open: boolean } {
  return { count: othersCount, min: minWaiting, open: othersCount >= minWaiting };
}

/** 켜 둔 시간이 끝나는 시각: 지금부터 N분, 행사 끝·22시를 넘지 않음 */
export function instantUntil(now: Date, day: InstantDay, p: Pick<InstantPolicy, 'endHour' | 'presenceMinutes'>): Date {
  const hardEnd = seoulDateTime(day.date, `${String(p.endHour).padStart(2, '0')}:00`);
  const eventEnd = seoulDateTime(day.date, day.endTime);
  const endsAt = eventEnd < hardEnd ? eventEnd : hardEnd;
  return new Date(Math.min(now.getTime() + p.presenceMinutes * MINUTE, endsAt.getTime()));
}

// ───────────── 앱이 받는 모양 ─────────────

export interface InstantStatusView {
  event: { id: string; name: string; venue: string };
  /** 지금 쓸 수 있는지. 쓸 수 없으면 이유 */
  available: boolean;
  closedReason: InstantClosedReason | null;
  closedMessage: string | null;
  /** 내가 켜 두었는지, 언제까지인지 */
  mine: { active: boolean; until: string | null };
  /** 대기 인원 (나를 뺀 수). 개인 정보는 후보가 열렸을 때만 후보 목록으로 */
  waiting: { count: number; min: number; open: boolean };
  /** 지금부터 만날 수 있는 시간대 */
  window: { from: string; to: string; minutes: number } | null;
  /** 저장된 입력이 없어 간단한 스타일 질문에 답해야 하는지 */
  needsStyle: boolean;
}

export interface InstantEventView {
  event: { id: string; name: string; venue: string };
  active: boolean;
}

/** 간단한 스타일 입력(저장된 입력이 없을 때): 템포 3문항, 몰입도 2문항 */
export interface InstantStyleInput {
  tempoAnswers: Array<1 | 2 | 3>;
  immersionAnswers: Array<1 | 2 | 3>;
}

