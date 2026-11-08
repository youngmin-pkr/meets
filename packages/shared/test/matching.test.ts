/**
 * 매칭 4단계와 후보 부족 시 완화 (CLAUDE.md "반드시 테스트할 것")
 */
import {
  checkPreference,
  describeCandidate,
  expectedCounts,
  immersionLevel,
  immersionQuestions,
  matchCandidates,
  overlapOnDay,
  passesMust,
  POLICY_DEFAULTS,
  tempoLevel,
  type MatchDay,
  type MatchPolicy,
  type MatchProfile,
} from '../src';

const POLICY: MatchPolicy = {
  tempoMaxGap: POLICY_DEFAULTS.MATCH_TEMPO_MAX_GAP,
  immersionMaxGap: POLICY_DEFAULTS.MATCH_IMMERSION_MAX_GAP,
  immersionRelaxedGap: POLICY_DEFAULTS.MATCH_IMMERSION_RELAXED_GAP,
  fewCandidates: POLICY_DEFAULTS.MATCH_FEW_CANDIDATES,
  minOverlapMinutes: POLICY_DEFAULTS.MATCH_MIN_OVERLAP_MINUTES,
  shortOverlapMinutes: POLICY_DEFAULTS.MATCH_SHORT_OVERLAP_MINUTES,
};

// 하루짜리 공연: 굿즈 줄(15~17), 입장 대기(17~18), 공연(18~20:30)
const DAY1: MatchDay = {
  id: 'd1',
  date: '2026-12-12',
  startTime: '15:00',
  endTime: '21:00',
  segments: [
    { id: 'goods', label: '굿즈 줄', startTime: '15:00', endTime: '17:00' },
    { id: 'wait', label: '입장 대기', startTime: '17:00', endTime: '18:00' },
    { id: 'show', label: '공연', startTime: '18:00', endTime: '20:30' },
  ],
};
const DAY2: MatchDay = { ...DAY1, id: 'd2', date: '2026-12-13', segments: DAY1.segments.map((s) => ({ ...s, id: `${s.id}2` })) };

let seq = 0;
function person(overrides: Partial<MatchProfile> = {}): MatchProfile {
  seq += 1;
  return {
    userId: `u${String(seq).padStart(3, '0')}`,
    age: 25,
    gender: 'F',
    tempo: 2,
    immersion: 2,
    must: { gender: 'ANY', age: 'ANY', promises: [] },
    fandomIds: [],
    days: [{ eventDayId: 'd1', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['goods', 'wait', 'show'] }],
    ...overrides,
  };
}

const ids = (r: { candidates: Array<{ userId: string }> }) => r.candidates.map((c) => c.userId);

describe('질문 답 → 단계', () => {
  test('템포는 Q1~Q3 평균을 반올림', () => {
    expect(tempoLevel([3, 3, 2])).toBe(3);
    expect(tempoLevel([1, 2, 2])).toBe(2);
    expect(tempoLevel([1, 1, 2])).toBe(1);
  });

  test('몰입도는 행사 종류에 맞는 첫 번째 질문의 답', () => {
    expect(immersionLevel([3, 1])).toBe(3);
    expect(immersionLevel([1, 3])).toBe(1);
  });

  test('행사 종류에 맞는 질문만 보여 준다', () => {
    expect(immersionQuestions('PERFORMANCE').map((q) => q.title)).toEqual([
      '공연을 볼 때 나는…',
      '같이 간 사람이 응원법을 몰라 가만히 있다면?',
    ]);
    expect(immersionQuestions('EXHIBITION').map((q) => q.title)).toEqual([
      '전시를 볼 때 나는…',
      '같이 간 사람이 나보다 빨리 둘러보고 싶어 한다면?',
    ]);
    // 전시·팝업 쪽에는 공연 관련 문구가 없어야 함
    expect(JSON.stringify(immersionQuestions('EXHIBITION'))).not.toMatch(/공연|응원|떼창/);
  });
});

describe('1단계: 필수 조건', () => {
  test('같은 성별만 원하면 다른 성별은 빠진다 (양쪽 모두 확인)', () => {
    const me = person({ gender: 'F', must: { gender: 'SAME', age: 'ANY', promises: [] } });
    expect(passesMust(me, person({ gender: 'M' }))).toBe(false);
    expect(passesMust(me, person({ gender: 'F' }))).toBe(true);
    // 상대가 같은 성별만 원하면 나도 그 사람 후보에 못 나오고, 나에게도 안 보인다
    expect(passesMust(person({ gender: 'M' }), person({ gender: 'F', must: { gender: 'SAME', age: 'ANY', promises: [] } }))).toBe(false);
  });

  test('나이 범위: ±3세 경계', () => {
    const me = person({ age: 25, must: { gender: 'ANY', age: 'WITHIN_3', promises: [] } });
    expect(passesMust(me, person({ age: 28 }))).toBe(true);
    expect(passesMust(me, person({ age: 29 }))).toBe(false);
    expect(passesMust(me, person({ age: 22 }))).toBe(true);
    expect(passesMust(me, person({ age: 21 }))).toBe(false);
  });

  test('나이나 성별을 모르면 그 조건이 있을 때 후보에서 빠진다', () => {
    expect(passesMust(person({ must: { gender: 'ANY', age: 'WITHIN_5', promises: [] } }), person({ age: null }))).toBe(false);
    expect(passesMust(person({ must: { gender: 'SAME', age: 'ANY', promises: [] } }), person({ gender: null }))).toBe(false);
    expect(passesMust(person(), person({ age: null, gender: null }))).toBe(true);
  });

  test('꼭 지킬 약속은 내가 고른 것을 상대도 골라야 한다', () => {
    const me = person({ must: { gender: 'ANY', age: 'ANY', promises: ['PUNCTUAL', 'PHOTO_CONSENT'] } });
    expect(passesMust(me, person({ must: { gender: 'ANY', age: 'ANY', promises: ['PUNCTUAL'] } }))).toBe(false);
    expect(
      passesMust(me, person({ must: { gender: 'ANY', age: 'ANY', promises: ['PUNCTUAL', 'PHOTO_CONSENT', 'NO_ALCOHOL_SMOKING'] } })),
    ).toBe(true);
  });
});

describe('2단계: 템포 + 일정 겹침', () => {
  test('템포 차이가 허용 범위를 넘으면 빠진다', () => {
    const me = person({ tempo: 1 });
    const near = person({ tempo: 2 });
    const far = person({ tempo: 3 });
    expect(ids(matchCandidates(me, [near, far], [DAY1], POLICY))).toEqual([near.userId]);
  });

  test('같이할 구간이 겹치는 시간만 센다', () => {
    const a = person({ days: [{ eventDayId: 'd1', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['goods', 'show'] }] });
    const b = person({ days: [{ eventDayId: 'd1', arriveTime: '16:00', leaveTime: '21:00', togetherSegmentIds: ['goods', 'wait'] }] });
    expect(overlapOnDay(DAY1, a, b)).toEqual({
      eventDayId: 'd1',
      date: '2026-12-12',
      minutes: 60,
      from: '16:00',
      to: '17:00',
      segmentIds: ['goods'],
    });
  });

  test('도착·귀가 시간이 안 겹치면 겹침 없음', () => {
    const a = person({ days: [{ eventDayId: 'd1', arriveTime: '15:00', leaveTime: '16:00', togetherSegmentIds: ['goods'] }] });
    const b = person({ days: [{ eventDayId: 'd1', arriveTime: '16:00', leaveTime: '21:00', togetherSegmentIds: ['goods'] }] });
    expect(overlapOnDay(DAY1, a, b)).toBeNull();
  });

  test('구간이 없는 날은 행사 시간 전체를 같이할 수 있는 시간으로 본다', () => {
    const day: MatchDay = { ...DAY1, segments: [] };
    const a = person({ days: [{ eventDayId: 'd1', arriveTime: '15:00', leaveTime: '18:00', togetherSegmentIds: [] }] });
    const b = person({ days: [{ eventDayId: 'd1', arriveTime: '16:00', leaveTime: '21:00', togetherSegmentIds: [] }] });
    expect(overlapOnDay(day, a, b)?.minutes).toBe(120);
  });

  test('겹침이 최소 기준(120분)보다 짧으면 빠지고, 함께할 시간 줄이기(60분)면 들어온다', () => {
    const me = person();
    const short = person({ days: [{ eventDayId: 'd1', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['wait'] }] });
    expect(ids(matchCandidates(me, [short], [DAY1], POLICY))).toEqual([]);
    expect(ids(matchCandidates(me, [short], [DAY1], POLICY, { shortTime: true }))).toEqual([short.userId]);
  });

  test('내가 고른 같이할 시간이 기준보다 짧으면 그만큼만 겹치면 된다', () => {
    const me = person({ days: [{ eventDayId: 'd1', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['wait'] }] });
    const other = person();
    expect(ids(matchCandidates(me, [other], [DAY1], POLICY))).toEqual([other.userId]);
  });

  test('여러 날 행사: 하루라도 겹치면 후보이고, 날짜별로 따로 본다', () => {
    const me = person({
      days: [
        { eventDayId: 'd1', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['goods', 'wait', 'show'] },
        { eventDayId: 'd2', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['goods2', 'wait2', 'show2'] },
      ],
    });
    const onlyDay2 = person({ days: [{ eventDayId: 'd2', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['show2'] }] });
    const r = matchCandidates(me, [onlyDay2], [DAY1, DAY2], POLICY);
    expect(r.candidates[0].overlaps.map((o) => o.date)).toEqual(['2026-12-13']);
    expect(ids(matchCandidates(me, [onlyDay2], [DAY1, DAY2], POLICY, { dayId: 'd1' }))).toEqual([]);
  });
});

describe('3·4단계: 정렬', () => {
  test('몰입도가 가까운 순, 같은 순위 안에서는 같은 팬 먼저 (팬덤은 거르지 않음)', () => {
    const me = person({ immersion: 2, fandomIds: ['f1'] });
    const gap1 = person({ immersion: 3 });
    const gap0 = person({ immersion: 2 });
    const gap0Fan = person({ immersion: 2, fandomIds: ['f1'] });
    const gap1Fan = person({ immersion: 1, fandomIds: ['f1'] });
    const r = matchCandidates(me, [gap1, gap0, gap0Fan, gap1Fan], [DAY1], POLICY);
    expect(ids(r)).toEqual([gap0Fan.userId, gap0.userId, gap1Fan.userId, gap1.userId]);
    expect(r.candidates.find((c) => c.userId === gap0Fan.userId)?.sameFan).toBe(true);
  });

  test('팬덤을 고르지 않은 사람에게는 같은 팬 순서를 쓰지 않는다', () => {
    const me = person({ fandomIds: [] });
    const fan = person({ fandomIds: ['f1'] });
    expect(matchCandidates(me, [fan], [DAY1], POLICY).candidates[0].sameFan).toBe(false);
  });

  test('겹치는 시간순 정렬', () => {
    const me = person();
    const less = person({ days: [{ eventDayId: 'd1', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['show'] }] });
    const more = person();
    expect(ids(matchCandidates(me, [less, more], [DAY1], POLICY, { sort: 'OVERLAP' }))).toEqual([more.userId, less.userId]);
  });
});

describe('후보가 적을 때 완화', () => {
  test('후보가 기준(3명)보다 적으면 몰입도 범위를 2단계로 넓히고 짧은 구간부터 안내', () => {
    const me = person({ immersion: 1 });
    const close = person({ immersion: 1 });
    const far = person({ immersion: 3 });
    const r = matchCandidates(me, [close, far], [DAY1], POLICY);
    expect(r.immersionRelaxed).toBe(true);
    expect(ids(r)).toEqual([close.userId, far.userId]);
    expect(r.candidates.map((c) => c.shortStart)).toEqual([false, true]);
  });

  test('후보가 충분하면 넓히지 않는다', () => {
    const me = person({ immersion: 1 });
    const close = [person({ immersion: 1 }), person({ immersion: 2 }), person({ immersion: 1 })];
    const far = person({ immersion: 3 });
    const r = matchCandidates(me, [...close, far], [DAY1], POLICY);
    expect(r.immersionRelaxed).toBe(false);
    expect(ids(r)).not.toContain(far.userId);
  });

  test('완화해도 안전 조건(나이·성별)은 넓히지 않는다', () => {
    const me = person({ age: 25, must: { gender: 'SAME', age: 'WITHIN_3', promises: [] } });
    const others = [person({ age: 40 }), person({ gender: 'M' })];
    expect(matchCandidates(me, others, [DAY1], POLICY, { shortTime: true, immersionPlus: true }).candidates).toEqual([]);
  });

  test('예상 후보 수를 미리 계산한다', () => {
    const me = person({
      days: [{ eventDayId: 'd1', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['goods', 'wait', 'show'] }],
    });
    const shortOnly = person({ days: [{ eventDayId: 'd1', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['wait'] }] });
    const otherDay = person({ days: [{ eventDayId: 'd2', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['show2'] }] });
    expect(matchCandidates(me, [shortOnly, otherDay], [DAY1, DAY2], POLICY).candidates).toEqual([]);
    expect(expectedCounts(me, [shortOnly, otherDay], [DAY1, DAY2], POLICY)).toEqual({
      shortTime: 1,
      immersionPlus: 0,
      otherDays: [{ eventDayId: 'd2', date: '2026-12-13', people: 1 }],
    });
  });

  test('나 자신은 후보가 아니다', () => {
    const me = person();
    expect(matchCandidates(me, [me], [DAY1], POLICY).candidates).toEqual([]);
  });
});

describe('티켓 인증과 매칭', () => {
  test('인증한 사람은 티켓으로 입장할 수 있는 날만 후보로 본다 (1일권)', () => {
    const me = person({
      days: [
        { eventDayId: 'd1', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['goods', 'wait', 'show'] },
        { eventDayId: 'd2', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['goods2', 'wait2', 'show2'] },
      ],
    });
    const oneDayTicket = person({
      grade: 'VERIFIED',
      admissibleDayIds: ['d2'],
      days: me.days,
    });
    const r = matchCandidates(me, [oneDayTicket], [DAY1, DAY2], POLICY);
    expect(r.candidates[0].overlaps.map((o) => o.eventDayId)).toEqual(['d2']);
    expect(ids(matchCandidates(me, [oneDayTicket], [DAY1, DAY2], POLICY, { dayId: 'd1' }))).toEqual([]);
  });

  test('같은 순위라면 티켓 인증 → 참석 예정 → 인증 전 순서', () => {
    const me = person();
    const none = person();
    const planned = person({ grade: 'PLANNED' });
    const verified = person({ grade: 'VERIFIED' });
    expect(ids(matchCandidates(me, [none, planned, verified], [DAY1], POLICY))).toEqual([
      verified.userId,
      planned.userId,
      none.userId,
    ]);
  });

  test('몰입도가 더 가까운 사람이 인증 여부보다 먼저다', () => {
    const me = person({ immersion: 2 });
    const closeNone = person({ immersion: 2 });
    const farVerified = person({ immersion: 3, grade: 'VERIFIED' });
    expect(ids(matchCandidates(me, [farVerified, closeNone], [DAY1], POLICY))[0]).toBe(closeNone.userId);
  });
});

describe('입력 검사와 설명', () => {
  const valid = {
    days: [{ eventDayId: 'd1', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['show'] }],
    tempoAnswers: [2, 2, 2] as const,
    immersionAnswers: [2, 2] as const,
    must: { gender: 'ANY' as const, age: 'ANY' as const, promises: ['PUNCTUAL' as const] },
  };
  const input = (o: object) => ({ ...valid, tempoAnswers: [...valid.tempoAnswers], immersionAnswers: [...valid.immersionAnswers], ...o });

  test('올바른 입력은 통과', () => {
    expect(checkPreference(input({}), [DAY1])).toEqual({ ok: true });
  });

  test.each([
    [{ days: [] }, 'NO_DAYS'],
    [{ days: [{ eventDayId: 'x', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: [] }] }, 'UNKNOWN_DAY'],
    [{ days: [{ eventDayId: 'd1', arriveTime: '21:00', leaveTime: '15:00', togetherSegmentIds: ['show'] }] }, 'BAD_TIME'],
    [{ days: [{ eventDayId: 'd1', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['nope'] }] }, 'UNKNOWN_SEGMENT'],
    [{ days: [{ eventDayId: 'd1', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: [] }] }, 'NO_TOGETHER_SEGMENT'],
    [{ tempoAnswers: [2, 2] }, 'BAD_ANSWERS'],
    [{ immersionAnswers: [2, 4] }, 'BAD_ANSWERS'],
    [{ immersionAnswers: [2, 2, 2] }, 'BAD_ANSWERS'],
    [{ must: { gender: 'ANY', age: 'WITHIN_9', promises: [] } }, 'BAD_MUST'],
    [{ must: { gender: 'ANY', age: 'ANY', promises: ['PUNCTUAL', 'PUNCTUAL'] } }, 'BAD_MUST'],
  ])('%o → %s', (patch, problem) => {
    expect(checkPreference(input(patch) as never, [DAY1])).toEqual({ ok: false, problem });
  });

  test('후보 설명 문장', () => {
    expect(describeCandidate({ tempoGap: 0, immersionGap: 0, shortStart: false })).toContain('모두 비슷');
    expect(describeCandidate({ tempoGap: 0, immersionGap: 2, shortStart: true })).toContain('짧은 구간부터');
  });
});
