/**
 * 일행: 상태 전이 표 전체, 일행 기준 합치기, 일행 후보, 상태 판단
 */
import {
  canTransitionParty,
  combineProfiles,
  isInputDone,
  matchPartyCandidates,
  nextPartyStatus,
  PARTY_STATUSES,
  PARTY_TRANSITIONS,
  partyGuide,
  partyInviteExpiresAt,
  POLICY_DEFAULTS,
  type MatchDay,
  type MatchPolicy,
  type MatchProfile,
  type PartyStatus,
} from '../src';

const POLICY: MatchPolicy = {
  tempoMaxGap: POLICY_DEFAULTS.MATCH_TEMPO_MAX_GAP,
  immersionMaxGap: POLICY_DEFAULTS.MATCH_IMMERSION_MAX_GAP,
  immersionRelaxedGap: POLICY_DEFAULTS.MATCH_IMMERSION_RELAXED_GAP,
  fewCandidates: POLICY_DEFAULTS.MATCH_FEW_CANDIDATES,
  minOverlapMinutes: POLICY_DEFAULTS.MATCH_MIN_OVERLAP_MINUTES,
  shortOverlapMinutes: POLICY_DEFAULTS.MATCH_SHORT_OVERLAP_MINUTES,
};
const SIZE = { minSize: POLICY_DEFAULTS.PARTY_MIN_SIZE, maxSize: POLICY_DEFAULTS.PARTY_MAX_SIZE };

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

let seq = 0;
function person(o: Partial<MatchProfile> = {}): MatchProfile {
  seq += 1;
  return {
    userId: `p${String(seq).padStart(3, '0')}`,
    age: 25,
    gender: 'F',
    tempo: 2,
    immersion: 2,
    must: { gender: 'ANY', age: 'ANY', promises: [] },
    fandomIds: [],
    days: [{ eventDayId: 'd1', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['goods', 'wait', 'show'] }],
    ...o,
  };
}
const day = (arrive: string, leave: string, segs: string[]) => [{ eventDayId: 'd1', arriveTime: arrive, leaveTime: leave, togetherSegmentIds: segs }];

describe('일행 상태 전이 표 (정리문서 5장)', () => {
  const allowed = [
    ['INVITING', 'CONFIRMING'],
    ['CONFIRMING', 'ACTIVE'],
    ['ACTIVE', 'PROPOSING'],
    ['PROPOSING', 'ACTIVE'],
    ['INVITING', 'DISBANDED'],
    ['CONFIRMING', 'DISBANDED'],
    ['ACTIVE', 'DISBANDED'],
    ['PROPOSING', 'DISBANDED'],
  ];

  test('표에 있는 전이만 허용하고 나머지는 모두 막는다', () => {
    for (const from of PARTY_STATUSES) {
      for (const to of PARTY_STATUSES) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect([from, to, canTransitionParty(from, to)]).toEqual([from, to, expected]);
      }
    }
    expect(PARTY_TRANSITIONS).toHaveLength(allowed.length);
  });

  test('해체된 일행은 되살릴 수 없다', () => {
    for (const to of PARTY_STATUSES) expect(canTransitionParty('DISBANDED', to)).toBe(false);
  });
});

describe('일행 기준 합치기 (정리문서 3장)', () => {
  test('템포·몰입도는 가장 낮은(여유 있는) 사람 기준', () => {
    const c = combineProfiles('k', [person({ tempo: 3, immersion: 3 }), person({ tempo: 1, immersion: 2 }), person({ tempo: 2, immersion: 3 })], [DAY1]);
    expect(c.tempo).toBe(1);
    expect(c.immersion).toBe(2);
  });

  test('같이 볼 시간은 전원이 겹치는 시간만', () => {
    const c = combineProfiles(
      'k',
      [
        person({ days: day('15:00', '21:00', ['goods', 'wait', 'show']) }),
        person({ days: day('16:00', '21:00', ['wait', 'show']) }),
        person({ days: day('15:00', '19:00', ['goods', 'wait', 'show']) }),
      ],
      [DAY1],
    );
    expect(c.days).toEqual(day('16:00', '19:00', ['wait', 'show']));
  });

  test('한 명이라도 그날 입장할 수 없거나 입력하지 않았으면 그날은 뺀다', () => {
    const none = person({ days: [] });
    expect(combineProfiles('k', [person(), none], [DAY1]).days).toEqual([]);
    const ticket = person({ admissibleDayIds: ['d2'] });
    expect(combineProfiles('k', [person(), ticket], [DAY1]).days).toEqual([]);
  });

  test('전원이 같이 하기로 한 구간이 하나도 없으면 그날은 뺀다', () => {
    const c = combineProfiles('k', [person({ days: day('15:00', '21:00', ['goods']) }), person({ days: day('15:00', '21:00', ['show']) })], [DAY1]);
    expect(c.days).toEqual([]);
  });

  test('팬덤은 합집합, 티켓 등급은 가장 약한 쪽', () => {
    const c = combineProfiles('k', [person({ fandomIds: ['a'], grade: 'VERIFIED' }), person({ fandomIds: ['b'], grade: 'PLANNED' })], [DAY1]);
    expect(c.fandomIds.sort()).toEqual(['a', 'b']);
    expect(c.grade).toBe('PLANNED');
  });
});

describe('일행 후보', () => {
  test('일행 구성원 본인은 후보가 아니다', () => {
    const a = person();
    const b = person();
    const other = person();
    const r = matchPartyCandidates('k', [a, b], [a, b, other], [DAY1], POLICY);
    expect(r.candidates.map((c) => c.userId)).toEqual([other.userId]);
  });

  test('꼭 지킬 조건은 일행 한 명 한 명 모두에게 맞아야 한다', () => {
    const strict = person({ age: 30, must: { gender: 'ANY', age: 'WITHIN_5', promises: [] } });
    const easy = person({ age: 24 });
    const near = person({ age: 31 }); // strict에게만 맞음
    const both = person({ age: 27 });
    const r = matchPartyCandidates('k', [strict, easy], [near, both], [DAY1], POLICY);
    // strict는 5년 이내를 원하고 easy는 상관없지만, near(31)는 strict에 맞고 both(27)도 맞는다. 나이 조건은 후보의 조건도 확인한다.
    expect(r.candidates.map((c) => c.userId).sort()).toEqual([both.userId, near.userId].sort());
    const tight = person({ age: 36 }); // 한 명(30세)의 ±5세 밖
    expect(matchPartyCandidates('k', [strict, easy], [tight], [DAY1], POLICY).candidates).toEqual([]);
  });

  test('가장 여유 있는 사람의 템포와 너무 다른 후보는 빠진다', () => {
    const slow = person({ tempo: 1 });
    const fast = person({ tempo: 3 });
    const fastCandidate = person({ tempo: 3 });
    // 둘이 일행이면 템포 1이 기준 → 3과는 2단계 차이로 후보 아님
    expect(matchPartyCandidates('k', [slow, fast], [fastCandidate], [DAY1], POLICY).candidates).toEqual([]);
    // 혼자(fast)라면 후보
    expect(matchPartyCandidates('k', [fast], [fastCandidate], [DAY1], POLICY).candidates).toHaveLength(1);
  });

  test('전원이 겹치는 시간이 짧아 기준(120분)보다 적으면 후보가 아니다', () => {
    const a = person({ days: day('15:00', '21:00', ['goods', 'wait', 'show']) });
    const b = person({ days: day('18:00', '21:00', ['show']) });
    const cand = person({ days: day('15:00', '17:00', ['goods']) });
    expect(matchPartyCandidates('k', [a, b], [cand], [DAY1], POLICY).candidates).toEqual([]);
  });

  test('일행 중 한 명이 서로 차단 등으로 후보에서 빠지는 것은 서버가 걸러서 넘긴다 (여기서는 넘겨받은 사람만 본다)', () => {
    const a = person();
    const b = person();
    expect(matchPartyCandidates('k', [a, b], [], [DAY1], POLICY).candidates).toEqual([]);
  });
});

describe('일행 상태 판단 (누가 빠져도 남은 사람끼리 계속)', () => {
  const m = (...ready: boolean[]) => ready.map((r) => ({ ready: r }));

  test('초대 중: 아무도 합류하지 않으면 그대로, 시간이 지나면 풀린다', () => {
    expect(nextPartyStatus('INVITING', m(false), SIZE, false)).toBeNull();
    expect(nextPartyStatus('INVITING', m(false), SIZE, true)).toEqual({ to: 'DISBANDED', reason: 'INVITE_EXPIRED' });
  });

  test('초대 중 → 확인 중: 친구가 합류', () => {
    expect(nextPartyStatus('INVITING', m(true, false), SIZE, false)).toEqual({ to: 'CONFIRMING', reason: 'JOINED' });
    // 합류한 뒤에는 초대 시간이 지나도 풀리지 않는다
    expect(nextPartyStatus('INVITING', m(true, false), SIZE, true)).toEqual({ to: 'CONFIRMING', reason: 'JOINED' });
  });

  test('확인 중 → 활성: 전원이 입력을 마쳤을 때만', () => {
    expect(nextPartyStatus('CONFIRMING', m(true, false), SIZE, false)).toBeNull();
    expect(nextPartyStatus('CONFIRMING', m(true, true), SIZE, false)).toEqual({ to: 'ACTIVE', reason: 'ALL_READY' });
    expect(nextPartyStatus('CONFIRMING', m(true, true, true, true), SIZE, false)).toEqual({ to: 'ACTIVE', reason: 'ALL_READY' });
  });

  test('한 명만 남으면 어느 상태에서든 풀린다', () => {
    for (const s of ['CONFIRMING', 'ACTIVE', 'PROPOSING'] as PartyStatus[]) {
      expect(nextPartyStatus(s, m(true), SIZE, false)).toEqual({ to: 'DISBANDED', reason: 'ONE_LEFT' });
    }
  });

  test('둘 이상 남아 있으면 계속한다', () => {
    for (const s of ['ACTIVE', 'PROPOSING'] as PartyStatus[]) {
      expect(nextPartyStatus(s, m(true, true, false), SIZE, false)).toBeNull();
    }
  });

  test('해체된 일행은 아무것도 하지 않는다', () => {
    expect(nextPartyStatus('DISBANDED', m(true, true), SIZE, true)).toBeNull();
  });
});

describe('입력 마침·초대·안내', () => {
  test('일정·스타일 입력과 티켓 인증(또는 참석 예정)이 모두 있어야 입력을 마친 것', () => {
    expect(isInputDone({ hasPreference: true, grade: 'VERIFIED' })).toBe(true);
    expect(isInputDone({ hasPreference: true, grade: 'PLANNED' })).toBe(true);
    expect(isInputDone({ hasPreference: true, grade: null })).toBe(false);
    expect(isInputDone({ hasPreference: false, grade: 'VERIFIED' })).toBe(false);
  });

  test('초대 링크는 만든 지 48시간 뒤 사라진다', () => {
    const at = new Date('2026-12-01T00:00:00Z');
    expect(partyInviteExpiresAt(at, POLICY_DEFAULTS.PARTY_INVITE_EXPIRE_HOURS).toISOString()).toBe('2026-12-03T00:00:00.000Z');
  });

  test('정원은 2~4명', () => {
    expect([POLICY_DEFAULTS.PARTY_MIN_SIZE, POLICY_DEFAULTS.PARTY_MAX_SIZE]).toEqual([2, 4]);
  });

  test('안내 문구: 입력하지 않은 친구 이름만 보여 준다', () => {
    expect(partyGuide({ status: 'CONFIRMING', isLeader: true, notReady: ['하늘', '지우'], memberCount: 3, maxSize: 4 })).toContain('하늘, 지우님');
  });
});
