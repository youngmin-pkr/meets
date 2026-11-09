import {
  checkReviewInput,
  chatClosesAt,
  computeTrust,
  matchCandidates,
  notificationText,
  POLICY_DEFAULTS,
  reportPriority,
  reviewDeadline,
  toggleTag,
  trustView,
  wantsReview,
  type MatchProfile,
  type ReviewInput,
  type TrustFacts,
} from '../src';

const kst = (s: string) => new Date(`${s}+09:00`);

const input = (o: Partial<ReviewInput> = {}): ReviewInput => ({
  overall: 'GREAT',
  goodTags: ['TEMPO_MATCH', 'PUNCTUAL'],
  badTags: [],
  again: 'YES',
  hideTarget: false,
  ...o,
});

describe('후기 입력', () => {
  test('칩은 건너뛰어도 되고, 알려진 칩만 한 번씩 고를 수 있다', () => {
    expect(checkReviewInput(input())).toBeNull();
    expect(checkReviewInput(input({ goodTags: [], badTags: [] }))).toBeNull();
    expect(checkReviewInput(input({ goodTags: ['TEMPO_MATCH', 'TEMPO_MATCH'] }))).toBe('GOOD_TAGS');
    expect(checkReviewInput(input({ goodTags: ['LATE' as never] }))).toBe('GOOD_TAGS');
    expect(checkReviewInput(input({ badTags: ['PUNCTUAL' as never] }))).toBe('BAD_TAGS');
    expect(checkReviewInput(input({ overall: 'AWESOME' as never }))).toBe('OVERALL');
    expect(checkReviewInput(input({ again: 'LATER' as never }))).toBe('AGAIN');
  });

  test('칩 켜고 끄기', () => {
    expect(toggleTag(['PUNCTUAL'] as const, 'CONSIDERATE' as 'PUNCTUAL' | 'CONSIDERATE')).toEqual(['PUNCTUAL', 'CONSIDERATE']);
    expect(toggleTag(['PUNCTUAL', 'CONSIDERATE'] as const, 'PUNCTUAL' as 'PUNCTUAL' | 'CONSIDERATE')).toEqual(['CONSIDERATE']);
  });

  test('후기는 만남이 끝나고 7일 동안, 정상적으로 끝난 만남만', () => {
    expect(reviewDeadline(kst('2026-12-12T17:00:00'), POLICY_DEFAULTS.REVIEW_WINDOW_DAYS)).toEqual(kst('2026-12-19T17:00:00'));
    expect(wantsReview('ENDED')).toBe(true);
    for (const s of ['ENDED_EARLY', 'CANCELLED', 'AUTO_ENDED', 'ON_HOLD', 'CONFIRMED']) expect(wantsReview(s)).toBe(false);
  });

  test('후기 요청·서로 원함 알림 글', () => {
    expect(notificationText('REVIEW_REQUEST', { nickname: '하늘', eventName: '콘서트', deadline: '12.19 (토) 17:00' }).body).toContain('12.19 (토) 17:00까지 후기를 남겨 주세요');
    expect(notificationText('REVIEW_REQUEST', { nickname: '하늘', eventName: '콘서트', deadline: 'x' }).body).toContain('상대에게 보이지 않아요');
    expect(notificationText('REVIEW_MUTUAL_AGAIN', { nickname: '하늘' }).title).toBe('서로 또 같이 가고 싶어 해요');
  });
});

describe('신뢰 단계 (정책 값 11·12)', () => {
  const policy = { upReviewCount: POLICY_DEFAULTS.TRUST_UP_REVIEW_COUNT, downCount: POLICY_DEFAULTS.TRUST_DOWN_COUNT };
  const facts = (o: Partial<TrustFacts> = {}): TrustFacts => ({ everPlanned: false, everVerified: false, positiveReviews: 0, upheldReports: 0, recentBadRecords: 0, ...o });

  test('처음에는 1단계, 참석 예정 2단계, 티켓 인증 3단계', () => {
    expect(computeTrust(facts(), policy)).toEqual({ level: 1, reason: 'DEFAULT' });
    expect(computeTrust(facts({ everPlanned: true }), policy)).toEqual({ level: 2, reason: 'ATTENDANCE_PLANNED' });
    expect(computeTrust(facts({ everPlanned: true, everVerified: true }), policy)).toEqual({ level: 3, reason: 'ATTENDANCE_VERIFIED' });
    // 인증만 했어도 3단계 (참석 예정을 거치지 않아도)
    expect(computeTrust(facts({ everVerified: true }), policy).level).toBe(3);
  });

  test('4단계: 3단계에서 좋은 후기 3건 이상, 확인된 불편 신고 0건', () => {
    const base = { everVerified: true };
    expect(computeTrust(facts({ ...base, positiveReviews: 2 }), policy).level).toBe(3);
    expect(computeTrust(facts({ ...base, positiveReviews: 3 }), policy)).toEqual({ level: 4, reason: 'REVIEWS' });
    expect(computeTrust(facts({ ...base, positiveReviews: 9, upheldReports: 1 }), policy)).toEqual({ level: 3, reason: 'REPORT_UPHELD' });
    // 인증 없이 후기만으로는 안 올라감
    expect(computeTrust(facts({ everPlanned: true, positiveReviews: 5 }), policy).level).toBe(2);
  });

  test('최근 임박 취소·무응답·노쇼가 2번 이상이면 한 단계 내려가고, 1단계 아래로는 안 내려간다', () => {
    const verified = { everVerified: true, positiveReviews: 3 };
    expect(computeTrust(facts({ ...verified, recentBadRecords: 1 }), policy).level).toBe(4);
    expect(computeTrust(facts({ ...verified, recentBadRecords: 2 }), policy)).toEqual({ level: 3, reason: 'RECENT_RECORDS' });
    expect(computeTrust(facts({ everVerified: true, recentBadRecords: 5 }), policy).level).toBe(2);
    expect(computeTrust(facts({ recentBadRecords: 5 }), policy).level).toBe(1);
  });

  test("화면: 3단계에서만 '후기 N개 더'와 진행 막대를 보여 주고, 점수 숫자는 없다", () => {
    const v = trustView(3, facts({ everVerified: true, positiveReviews: 1 }), policy);
    expect(v).toMatchObject({ level: 3, label: '참석 인증', next: { label: '쌓인 신뢰', reviewsToGo: 2 } });
    expect(v.next!.progress).toBeCloseTo(1 / 3);
    expect(trustView(2, facts({ everPlanned: true }), policy).next).toEqual({ label: '참석 인증', reviewsToGo: null, progress: null });
    expect(trustView(4, facts(), policy).next).toBeNull();
  });
});

describe('신고 우선순위와 채팅 연장', () => {
  test('도움 요청 > 청소년 > 일반', () => {
    expect(reportPriority({ help: true, reporterIsTeen: false, targetIsTeen: false })).toBe('HELP');
    expect(reportPriority({ reporterIsTeen: true, targetIsTeen: false })).toBe('TEEN');
    expect(reportPriority({ reporterIsTeen: false, targetIsTeen: true })).toBe('TEEN');
    expect(reportPriority({ reporterIsTeen: false, targetIsTeen: false })).toBe('GENERAL');
  });

  test("서로 '또 같이 가고 싶어요'면 만남이 끝나도 채팅이 닫히지 않는다", () => {
    const endsAt = kst('2026-12-13T17:00:00');
    expect(chatClosesAt({ status: 'ENDED', endsAt, endedAt: null, extended: true }, { closeHoursAfterEnd: 24 })).toBeNull();
    expect(chatClosesAt({ status: 'ENDED', endsAt, endedAt: null }, { closeHoursAfterEnd: 24 })).toEqual(kst('2026-12-14T17:00:00'));
    // 취소된 약속은 연장되어 있어도 바로 닫힘
    expect(chatClosesAt({ status: 'CANCELLED', endsAt, endedAt: kst('2026-12-10T10:00:00'), extended: true }, { closeHoursAfterEnd: 24 })).toEqual(kst('2026-12-10T10:00:00'));
  });
});

describe('후보 목록: 서로 다시 가고 싶은 사람이 맨 위, 쌓인 신뢰는 표시만', () => {
  const day = { id: 'd1', date: '2026-12-12', startTime: '10:00', endTime: '20:00', segments: [{ id: 's1', label: '공연', startTime: '10:00', endTime: '14:00' }] };
  const profile = (userId: string, o: Partial<MatchProfile> = {}): MatchProfile => ({
    userId,
    age: 25,
    gender: 'F',
    tempo: 2,
    immersion: 2,
    must: { gender: 'ANY', age: 'ANY', promises: [] },
    fandomIds: [],
    days: [{ eventDayId: 'd1', arriveTime: '10:00', leaveTime: '14:00', togetherSegmentIds: ['s1'] }],
    ...o,
  });
  const policy = { tempoMaxGap: 1, immersionMaxGap: 1, immersionRelaxedGap: 2, fewCandidates: 3, minOverlapMinutes: 120, shortOverlapMinutes: 60 };

  test('같은 조건이면 이름 순, 쌓인 신뢰는 순서에 영향이 없고, 서로 다시 가고 싶은 사람은 맨 위', () => {
    const others = [profile('a', { trusted: true }), profile('b'), profile('c', { immersion: 3 })];
    const viewer = profile('me');
    const plain = matchCandidates(viewer, others, [day], policy).candidates;
    expect(plain.map((c) => c.userId)).toEqual(['a', 'b', 'c']);
    expect(plain.map((c) => c.trusted)).toEqual([true, false, false]);
    expect(plain.every((c) => c.reunion === false)).toBe(true);

    const withReunion = matchCandidates({ ...viewer, reunionWith: ['c'] }, others, [day], policy).candidates;
    expect(withReunion.map((c) => c.userId)).toEqual(['c', 'a', 'b']);
    expect(withReunion[0].reunion).toBe(true);
  });
});
