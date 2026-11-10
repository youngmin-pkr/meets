/**
 * 즉석 동행: 쓸 수 있는 때, 시간대, 대기 인원 기준, 후보 매칭 (정리문서 정책 값 1·3·18)
 */
import {
  hmOf,
  instantMatchDay,
  instantMatchPolicy,
  instantProfileDay,
  instantUntil,
  instantWaiting,
  instantWindowNow,
  matchCandidates,
  POLICY_DEFAULTS,
  presenceWindow,
  seoulDateOf,
  type InstantDay,
  type MatchPolicy,
  type MatchProfile,
} from '../src';

const kst = (s: string) => new Date(`${s}+09:00`);
const P = {
  minWaiting: POLICY_DEFAULTS.INSTANT_MIN_WAITING,
  endHour: POLICY_DEFAULTS.INSTANT_END_HOUR,
  presenceMinutes: POLICY_DEFAULTS.INSTANT_PRESENCE_MINUTES,
  windowMinutes: POLICY_DEFAULTS.INSTANT_WINDOW_MINUTES,
  minOverlapMinutes: POLICY_DEFAULTS.INSTANT_MIN_OVERLAP_MINUTES,
};
const day: InstantDay = {
  id: 'd1',
  date: '2026-12-12',
  startTime: '10:00',
  endTime: '21:00',
  segments: [
    { id: 's1', label: '오전', startTime: '10:00', endTime: '15:00' },
    { id: 's2', label: '오후', startTime: '15:00', endTime: '21:00' },
  ],
};

describe('정책 값', () => {
  test('문서의 값: 대기 5명, 22시, 60분', () => {
    expect([P.minWaiting, P.endHour, P.windowMinutes, P.presenceMinutes]).toEqual([5, 22, 60, 60]);
  });
});

describe('쓸 수 있는 때', () => {
  test('행사 당일 행사 시간 안에서만, 지금부터 60분', () => {
    const r = instantWindowNow([day], kst('2026-12-12T14:20:30'), P);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.window).toMatchObject({ from: '14:20', to: '15:20', minutes: 60 });
  });

  test('행사 날이 아니면 쓸 수 없다', () => {
    expect(instantWindowNow([day], kst('2026-12-11T14:00:00'), P)).toMatchObject({ ok: false, reason: 'NOT_TODAY' });
    expect(instantWindowNow([day], kst('2026-12-13T14:00:00'), P)).toMatchObject({ ok: false, reason: 'NOT_TODAY' });
    expect(instantWindowNow([], kst('2026-12-12T14:00:00'), P)).toMatchObject({ ok: false, reason: 'NOT_TODAY', day: null });
  });

  test('행사 시작 전에는 쓸 수 없다', () => {
    expect(instantWindowNow([day], kst('2026-12-12T09:59:00'), P)).toMatchObject({ ok: false, reason: 'NOT_STARTED' });
    expect(instantWindowNow([day], kst('2026-12-12T10:00:00'), P).ok).toBe(true);
  });

  test('시간대는 행사 끝과 22시를 넘지 않고, 남은 시간이 30분보다 짧으면 쓸 수 없다', () => {
    const late = instantWindowNow([{ ...day, endTime: '23:30' }], kst('2026-12-12T21:30:00'), P);
    expect(late.ok).toBe(true);
    if (late.ok) expect(late.window).toMatchObject({ from: '21:30', to: '22:00', minutes: 30 });
    expect(instantWindowNow([{ ...day, endTime: '23:30' }], kst('2026-12-12T21:31:00'), P)).toMatchObject({ ok: false, reason: 'AFTER_HOURS' });
    expect(instantWindowNow([{ ...day, endTime: '23:30' }], kst('2026-12-12T22:30:00'), P)).toMatchObject({ ok: false, reason: 'AFTER_HOURS' });
    // 행사가 22시 전에 끝나면 '행사 끝'
    expect(instantWindowNow([day], kst('2026-12-12T20:40:00'), P)).toMatchObject({ ok: false, reason: 'ENDED' });
    const edge = instantWindowNow([day], kst('2026-12-12T20:30:00'), P);
    expect(edge.ok).toBe(true);
    if (edge.ok) expect(edge.window.minutes).toBe(30);
  });
});

describe('켜 둔 시간', () => {
  test('켠 때부터 60분, 행사 끝·22시를 넘지 않는다', () => {
    expect(instantUntil(kst('2026-12-12T14:00:00'), day, P).toISOString()).toBe(kst('2026-12-12T15:00:00').toISOString());
    expect(instantUntil(kst('2026-12-12T20:30:00'), day, P).toISOString()).toBe(kst('2026-12-12T21:00:00').toISOString());
    expect(instantUntil(kst('2026-12-12T21:30:00'), { ...day, endTime: '23:00' }, P).toISOString()).toBe(kst('2026-12-12T22:00:00').toISOString());
  });

  test('내 시간대는 지금부터 켜 둔 시간(또는 시간대 끝) 중 이른 때까지', () => {
    const r = instantWindowNow([day], kst('2026-12-12T14:00:00'), P);
    if (!r.ok) throw new Error();
    expect(presenceWindow(r.window, kst('2026-12-12T14:40:00'))).toEqual({ arriveTime: '14:00', leaveTime: '14:40' });
    expect(presenceWindow(r.window, kst('2026-12-12T16:00:00'))).toEqual({ arriveTime: '14:00', leaveTime: '15:00' });
    expect(presenceWindow(r.window, kst('2026-12-12T13:59:00'))).toBeNull();
  });

  test('시각 글자', () => {
    expect(hmOf(kst('2026-12-12T09:05:00'))).toBe('09:05');
    expect(seoulDateOf(kst('2026-12-12T00:10:00'))).toBe('2026-12-12');
    expect(seoulDateOf(new Date('2026-12-11T15:10:00Z'))).toBe('2026-12-12');
  });
});

describe('대기 인원', () => {
  test('나를 뺀 인원이 5명 이상일 때만 열린다', () => {
    expect(instantWaiting(4, P.minWaiting)).toEqual({ count: 4, min: 5, open: false });
    expect(instantWaiting(5, P.minWaiting).open).toBe(true);
    expect(instantWaiting(0, P.minWaiting).open).toBe(false);
  });
});

describe('후보 매칭 (일반 매칭 규칙 그대로, 겹침만 30분)', () => {
  const base: MatchPolicy = {
    tempoMaxGap: POLICY_DEFAULTS.MATCH_TEMPO_MAX_GAP,
    immersionMaxGap: POLICY_DEFAULTS.MATCH_IMMERSION_MAX_GAP,
    immersionRelaxedGap: POLICY_DEFAULTS.MATCH_IMMERSION_RELAXED_GAP,
    fewCandidates: POLICY_DEFAULTS.MATCH_FEW_CANDIDATES,
    minOverlapMinutes: POLICY_DEFAULTS.MATCH_MIN_OVERLAP_MINUTES,
    shortOverlapMinutes: POLICY_DEFAULTS.MATCH_SHORT_OVERLAP_MINUTES,
  };
  const policy = instantMatchPolicy(base, P);
  const now = kst('2026-12-12T14:00:00');
  const w = instantWindowNow([day], now, P);
  if (!w.ok) throw new Error();
  let n = 0;
  const person = (o: Partial<MatchProfile> = {}, leave = '15:00'): MatchProfile => ({
    userId: `u${++n}`,
    age: 25,
    gender: 'F',
    tempo: 2,
    immersion: 2,
    must: { gender: 'ANY', age: 'ANY', promises: [] },
    fandomIds: [],
    days: [instantProfileDay(day, { arriveTime: '14:00', leaveTime: leave })],
    ...o,
  });
  const run = (me: MatchProfile, others: MatchProfile[]) => matchCandidates(me, others, [instantMatchDay(day)], policy);

  test('30분 이상 겹치면 후보, 그보다 짧으면 후보가 아니다', () => {
    const me = person();
    expect(run(me, [person({}, '14:30')]).candidates).toHaveLength(1);
    expect(run(me, [person({}, '14:29')]).candidates).toHaveLength(0);
  });

  test('안전 조건(나이·성별)은 양쪽 모두 확인한다', () => {
    const me = person({ gender: 'F', must: { gender: 'SAME', age: 'ANY', promises: [] } });
    expect(run(me, [person({ gender: 'M' })]).candidates).toHaveLength(0);
    const other = person({ gender: 'F', age: 40, must: { gender: 'ANY', age: 'WITHIN_3', promises: [] } });
    expect(run(person({ age: 25 }), [other]).candidates).toHaveLength(0);
  });

  test('템포가 많이 다르면 빠진다. 나는 후보가 아니다', () => {
    const me = person({ tempo: 1 });
    expect(run(me, [person({ tempo: 3 })]).candidates).toHaveLength(0);
    expect(run(me, [me]).candidates).toHaveLength(0);
  });
});
