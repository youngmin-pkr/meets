/**
 * 후보 매칭 (정리문서 3장)
 *
 * 1. 필수 조건으로 걸러내기 — 연령 범위·성별은 서로 양쪽 조건을 모두 만족해야 합니다(안전 조건, 넓히지 않음).
 *    꼭 지킬 약속은 내가 고른 약속을 상대도 골랐을 때만 후보입니다.
 * 2. 템포 + 일정 겹침으로 좁히기 — 템포 차이가 허용 범위 안이고, 같은 날 같이할 시간이 충분히 겹쳐야 합니다.
 * 3. 몰입도가 가까운 순으로 정렬 — 허용 범위 밖은 빼고, 차이가 작은 순.
 * 4. 같은 순위 안에서는 같은 팬을 먼저 — 팬덤을 고른 사람에게만, 후보를 거르지는 않습니다.
 *
 * 후보가 적으면 몰입도 허용 범위를 넓히고, 넓혀서 들어온 후보에는 '짧은 구간부터' 안내를 붙입니다.
 * 이 파일은 서버와 데모 서버가 똑같이 씁니다. 숫자 기준은 모두 정책 값(MatchPolicy)으로 받습니다.
 */
import { MUST_AGE_YEARS, toMinutes, fromMinutes, type MustConditions, type PromiseCode } from './preference';

export interface MatchDay {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  segments: Array<{ id: string; label: string; startTime: string; endTime: string }>;
}

export interface MatchProfile {
  userId: string;
  /** 오늘 기준 만 나이. 모르면 null (나이 조건이 있으면 후보에서 빠짐) */
  age: number | null;
  /** 'M' | 'F'. 모르면 null (성별 조건이 있으면 후보에서 빠짐) */
  gender: string | null;
  tempo: number;
  immersion: number;
  must: MustConditions;
  fandomIds: string[];
  days: Array<{ eventDayId: string; arriveTime: string; leaveTime: string; togetherSegmentIds: string[] }>;
}

export interface MatchPolicy {
  tempoMaxGap: number;
  immersionMaxGap: number;
  immersionRelaxedGap: number;
  /** 후보가 이 수보다 적으면 몰입도 범위를 넓힘 */
  fewCandidates: number;
  /** 같이할 시간이 최소 이만큼(분) 겹쳐야 함. 내가 고른 시간이 더 짧으면 그만큼 */
  minOverlapMinutes: number;
  /** '함께할 시간 줄이기'를 고르면 쓰는 최소 겹침(분) */
  shortOverlapMinutes: number;
}

export interface MatchOptions {
  /** 이 날짜(EventDay id)만 봄. 없으면 내가 고른 모든 날 */
  dayId?: string;
  /** 후보 없음 → '함께할 시간 줄이기' */
  shortTime?: boolean;
  /** 후보 없음 → '몰입도 차이 한 단계 더' */
  immersionPlus?: boolean;
  sort?: 'RECOMMENDED' | 'OVERLAP';
}

export interface DayOverlap {
  eventDayId: string;
  date: string;
  minutes: number;
  /** 겹치는 첫 시각~마지막 시각 */
  from: string;
  to: string;
  /** 둘 다 '같이'로 고른 구간 */
  segmentIds: string[];
}

export interface MatchCandidate {
  userId: string;
  tempoGap: number;
  immersionGap: number;
  sameFan: boolean;
  /** 둘 다 같은 약속을 고른 것 */
  sharedPromises: PromiseCode[];
  overlaps: DayOverlap[];
  bestOverlapMinutes: number;
  /** 몰입도 범위를 넓혀서 들어온 후보 → '짧은 구간부터 시작해 보세요' */
  shortStart: boolean;
}

export interface MatchResult {
  candidates: MatchCandidate[];
  /** 후보가 적어서 몰입도 범위를 넓혔는지 */
  immersionRelaxed: boolean;
}

/** 1단계: 필수 조건 (양쪽 모두 확인) */
export function passesMust(viewer: MatchProfile, other: MatchProfile): boolean {
  const oneWay = (a: MatchProfile, b: MatchProfile) => {
    if (a.must.gender === 'SAME' && (!a.gender || !b.gender || a.gender !== b.gender)) return false;
    const years = MUST_AGE_YEARS[a.must.age];
    if (years !== null && (a.age === null || b.age === null || Math.abs(a.age - b.age) > years)) return false;
    return true;
  };
  if (!oneWay(viewer, other) || !oneWay(other, viewer)) return false;
  // 꼭 지킬 약속: 내가 고른 것을 상대도 골랐어야 함
  return viewer.must.promises.every((p) => other.must.promises.includes(p));
}

/** 한 날의 '같이' 시간 겹침. 구간이 없는 날은 행사 시간 전체를 하나의 구간으로 봅니다. */
export function overlapOnDay(day: MatchDay, a: MatchProfile, b: MatchProfile): DayOverlap | null {
  const pa = a.days.find((d) => d.eventDayId === day.id);
  const pb = b.days.find((d) => d.eventDayId === day.id);
  if (!pa || !pb) return null;
  const windowStart = Math.max(toMinutes(pa.arriveTime), toMinutes(pb.arriveTime));
  const windowEnd = Math.min(toMinutes(pa.leaveTime), toMinutes(pb.leaveTime));
  if (windowStart >= windowEnd) return null;

  const segments =
    day.segments.length > 0
      ? day.segments.filter((s) => pa.togetherSegmentIds.includes(s.id) && pb.togetherSegmentIds.includes(s.id))
      : [{ id: '', label: '', startTime: day.startTime, endTime: day.endTime }];

  let minutes = 0;
  let from = Infinity;
  let to = -Infinity;
  const ids: string[] = [];
  for (const s of segments) {
    const start = Math.max(toMinutes(s.startTime), windowStart);
    const end = Math.min(toMinutes(s.endTime), windowEnd);
    if (end <= start) continue;
    minutes += end - start;
    from = Math.min(from, start);
    to = Math.max(to, end);
    if (s.id) ids.push(s.id);
  }
  if (minutes === 0) return null;
  return { eventDayId: day.id, date: day.date, minutes, from: fromMinutes(from), to: fromMinutes(to), segmentIds: ids };
}

/** 내가 그날 '같이'로 고른 시간(분) */
function myTogetherMinutes(day: MatchDay, me: MatchProfile): number {
  const plan = me.days.find((d) => d.eventDayId === day.id);
  if (!plan) return 0;
  const a = toMinutes(plan.arriveTime);
  const b = toMinutes(plan.leaveTime);
  const segs =
    day.segments.length > 0
      ? day.segments.filter((s) => plan.togetherSegmentIds.includes(s.id))
      : [{ startTime: day.startTime, endTime: day.endTime }];
  return segs.reduce((sum, s) => sum + Math.max(0, Math.min(toMinutes(s.endTime), b) - Math.max(toMinutes(s.startTime), a)), 0);
}

/** 2단계까지 통과한 후보 (몰입도는 아직 거르지 않음) */
function narrowed(
  viewer: MatchProfile,
  others: MatchProfile[],
  days: MatchDay[],
  policy: MatchPolicy,
  options: MatchOptions,
) {
  const myDays = days.filter(
    (d) => viewer.days.some((p) => p.eventDayId === d.id) && (!options.dayId || d.id === options.dayId),
  );
  const minOverlap = options.shortTime ? policy.shortOverlapMinutes : policy.minOverlapMinutes;
  const viewerFans = new Set(viewer.fandomIds);

  return others
    .filter((o) => o.userId !== viewer.userId)
    .filter((o) => passesMust(viewer, o))
    .filter((o) => Math.abs(o.tempo - viewer.tempo) <= policy.tempoMaxGap)
    .map((o) => {
      const overlaps = myDays
        .map((d) => {
          const ov = overlapOnDay(d, viewer, o);
          if (!ov) return null;
          // 내가 고른 시간이 기준보다 짧으면 내가 고른 만큼만 겹치면 됩니다.
          const need = Math.min(minOverlap, myTogetherMinutes(d, viewer));
          return ov.minutes >= need ? ov : null;
        })
        .filter((x): x is DayOverlap => x !== null);
      return { o, overlaps };
    })
    .filter(({ overlaps }) => overlaps.length > 0)
    .map(({ o, overlaps }) => ({
      userId: o.userId,
      tempoGap: Math.abs(o.tempo - viewer.tempo),
      immersionGap: Math.abs(o.immersion - viewer.immersion),
      sameFan: viewerFans.size > 0 && o.fandomIds.some((f) => viewerFans.has(f)),
      sharedPromises: viewer.must.promises.filter((p) => o.must.promises.includes(p)),
      overlaps,
      bestOverlapMinutes: Math.max(...overlaps.map((x) => x.minutes)),
    }));
}

function sortCandidates(list: MatchCandidate[], sort: MatchOptions['sort']): MatchCandidate[] {
  return [...list].sort((a, b) => {
    if (sort === 'OVERLAP') {
      return b.bestOverlapMinutes - a.bestOverlapMinutes || a.immersionGap - b.immersionGap || a.userId.localeCompare(b.userId);
    }
    return (
      a.immersionGap - b.immersionGap || // 3단계: 몰입도가 가까운 순
      Number(b.sameFan) - Number(a.sameFan) || // 4단계: 같은 순위면 같은 팬 먼저
      b.bestOverlapMinutes - a.bestOverlapMinutes ||
      a.tempoGap - b.tempoGap ||
      a.userId.localeCompare(b.userId)
    );
  });
}

export function matchCandidates(
  viewer: MatchProfile,
  others: MatchProfile[],
  days: MatchDay[],
  policy: MatchPolicy,
  options: MatchOptions = {},
): MatchResult {
  const pool = narrowed(viewer, others, days, policy, options);
  const withinGap = (gap: number, shortStart: boolean) =>
    pool.filter((c) => c.immersionGap <= gap).map((c) => ({ ...c, shortStart: shortStart && c.immersionGap > policy.immersionMaxGap }));

  let immersionRelaxed = false;
  let gap = policy.immersionMaxGap;
  let list = withinGap(gap, false);
  if (list.length < policy.fewCandidates) {
    // 후보가 적을 때: 몰입도 허용 범위를 넓히고 '짧은 구간부터' 안내를 붙임
    gap = policy.immersionRelaxedGap;
    immersionRelaxed = true;
    list = withinGap(gap, true);
  }
  if (options.immersionPlus) {
    gap += 1;
    list = withinGap(gap, true);
  }
  return { candidates: sortCandidates(list, options.sort), immersionRelaxed };
}

/** 후보 없음 화면: 조건을 바꾸기 전에 예상 후보 수를 미리 계산합니다. (정리문서 3장) */
export function expectedCounts(
  viewer: MatchProfile,
  others: MatchProfile[],
  days: MatchDay[],
  policy: MatchPolicy,
  options: MatchOptions = {},
): { shortTime: number; immersionPlus: number; otherDays: Array<{ eventDayId: string; date: string; people: number }> } {
  const shortTime = matchCandidates(viewer, others, days, policy, { ...options, shortTime: true }).candidates.length;
  const immersionPlus = matchCandidates(viewer, others, days, policy, { ...options, immersionPlus: true }).candidates.length;
  // 다른 날짜: 내가 고르지 않은 날에 등록했고, 필수 조건·템포가 맞는 사람 수
  const otherDays = days
    .filter((d) => !viewer.days.some((p) => p.eventDayId === d.id))
    .map((d) => ({
      eventDayId: d.id,
      date: d.date,
      people: others.filter(
        (o) =>
          o.userId !== viewer.userId &&
          o.days.some((p) => p.eventDayId === d.id) &&
          passesMust(viewer, o) &&
          Math.abs(o.tempo - viewer.tempo) <= policy.tempoMaxGap,
      ).length,
    }))
    .filter((x) => x.people > 0);
  return { shortTime, immersionPlus, otherDays };
}

/** 후보 카드의 한 줄 설명 */
export function describeCandidate(c: Pick<MatchCandidate, 'tempoGap' | 'immersionGap' | 'shortStart'>): string {
  if (c.shortStart) return '스타일 차이가 있어요. 짧은 구간부터 시작해 보세요.';
  if (c.tempoGap === 0 && c.immersionGap === 0) return '템포와 즐기는 방식이 모두 비슷해요.';
  if (c.tempoGap === 0) return `템포가 같고, 몰입도는 ${c.immersionGap}단계 차이예요.`;
  if (c.immersionGap === 0) return `즐기는 방식이 같고, 템포는 ${c.tempoGap}단계 차이예요.`;
  return `템포 ${c.tempoGap}단계, 몰입도 ${c.immersionGap}단계 차이예요.`;
}

/** 후보 카드 (앱이 받는 모양) */
export interface CandidateCard {
  userId: string;
  nickname: string;
  avatarInitial: string;
  avatarColor: string;
  tempoGap: number;
  immersionGap: number;
  sameFan: boolean;
  overlaps: DayOverlap[];
  bestOverlapMinutes: number;
  shortStart: boolean;
  summary: string;
}

export interface CandidatesResponse {
  total: number;
  immersionRelaxed: boolean;
  candidates: CandidateCard[];
  /** 후보가 0명일 때만: 조건을 넓히면 예상되는 후보 수 */
  widen: ReturnType<typeof expectedCounts> | null;
}

export interface CandidateDetail extends CandidateCard {
  reasons: { tempo: string; immersion: string; time: string; promises: string };
  /** 상대가 공개한 팬덤 이름 (공개를 끈 사람은 빈 목록, '같은 팬' 표시만) */
  publicFandoms: string[];
}

/** "왜 잘 맞나요?" 문장 */
export function explainMatch(
  c: MatchCandidate,
  days: MatchDay[],
  promiseLabels: Record<string, string>,
): CandidateDetail['reasons'] {
  const best = [...c.overlaps].sort((a, b) => b.minutes - a.minutes)[0];
  const day = days.find((d) => d.id === best?.eventDayId);
  const labels = day?.segments.filter((s) => best.segmentIds.includes(s.id)).map((s) => s.label) ?? [];
  const short = (code: string) => promiseLabels[code] ?? code;
  return {
    tempo: c.tempoGap === 0 ? '둘 다 비슷한 속도로 다니는 편이에요.' : `템포가 ${c.tempoGap}단계 차이예요.`,
    immersion:
      c.immersionGap === 0
        ? '즐기는 방식이 비슷해요.'
        : `몰입도가 ${c.immersionGap}단계 차이예요.${c.shortStart ? ' 짧은 구간부터 시작해 보세요.' : ''}`,
    time: best ? `${labels.length ? `${labels.join(', ')} ` : ''}(${best.from}–${best.to}, ${formatMinutes(best.minutes)})` : '',
    promises: c.sharedPromises.length ? `${c.sharedPromises.map(short).join(', ')} 기준이 같아요.` : '고른 약속이 없어요.',
  };
}

/** 150 → '2시간 30분' */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h}시간` : '', m ? `${m}분` : ''].filter(Boolean).join(' ') || '0분';
}
