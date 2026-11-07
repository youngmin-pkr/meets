import {
  decideSignupAgeOutcome,
  manAge,
  parseCalendarDate,
  POLICY_DEFAULTS,
  todayInSeoul,
} from '../src';

const d = (s: string) => {
  const parsed = parseCalendarDate(s);
  if (!parsed) throw new Error(`bad date ${s}`);
  return parsed;
};

describe('만 나이 계산', () => {
  test('생일 당일에 한 살을 먹는다', () => {
    expect(manAge(d('2008-11-07'), d('2026-11-07'))).toBe(18);
  });

  test('생일 전날에는 아직 한 살 적다', () => {
    expect(manAge(d('2008-11-07'), d('2026-11-06'))).toBe(17);
  });

  test('올해 생일이 지났으면 연도 차이와 같다', () => {
    expect(manAge(d('2000-01-01'), d('2026-11-07'))).toBe(26);
  });

  test('2월 29일생은 평년에는 3월 1일에 한 살을 먹는다', () => {
    expect(manAge(d('2008-02-29'), d('2026-02-28'))).toBe(17);
    expect(manAge(d('2008-02-29'), d('2026-03-01'))).toBe(18);
  });

  test('2월 29일생은 윤년에는 2월 29일에 한 살을 먹는다', () => {
    expect(manAge(d('2012-02-29'), d('2028-02-28'))).toBe(15);
    expect(manAge(d('2012-02-29'), d('2028-02-29'))).toBe(16);
  });
});

describe('날짜 읽기', () => {
  test('형식이 맞으면 읽는다', () => {
    expect(parseCalendarDate('2000-12-31')).toEqual({ year: 2000, month: 12, day: 31 });
  });

  test.each(['2000-13-01', '2001-02-29', '2000-04-31', '20001231', '2000-1-1', ''])(
    '없는 날짜나 틀린 형식(%s)은 거절한다',
    (text) => {
      expect(parseCalendarDate(text)).toBeNull();
    },
  );
});

describe('한국 날짜', () => {
  test('UTC로 전날 밤 15시 이후면 한국은 다음 날이다', () => {
    expect(todayInSeoul(new Date('2026-11-06T15:30:00Z'))).toEqual({
      year: 2026,
      month: 11,
      day: 7,
    });
    expect(todayInSeoul(new Date('2026-11-06T14:59:00Z'))).toEqual({
      year: 2026,
      month: 11,
      day: 6,
    });
  });
});

describe('가입 결과 판정', () => {
  const limits = {
    adultMinAge: POLICY_DEFAULTS.ADULT_MIN_AGE,
    signupMinAge: POLICY_DEFAULTS.SIGNUP_MIN_AGE,
  };

  test('성인 기준 나이 이상이면 성인', () => {
    expect(decideSignupAgeOutcome(limits.adultMinAge, limits)).toBe('ADULT');
    expect(decideSignupAgeOutcome(40, limits)).toBe('ADULT');
  });

  test('가입 가능 나이 이상, 성인 기준 미만이면 청소년이라 아직 막는다', () => {
    expect(decideSignupAgeOutcome(limits.adultMinAge - 1, limits)).toBe('TEEN_NOT_YET_AVAILABLE');
    expect(decideSignupAgeOutcome(limits.signupMinAge, limits)).toBe('TEEN_NOT_YET_AVAILABLE');
  });

  test('가입 가능 나이 미만이면 가입 불가', () => {
    expect(decideSignupAgeOutcome(limits.signupMinAge - 1, limits)).toBe('UNDER_MIN_AGE');
    expect(decideSignupAgeOutcome(0, limits)).toBe('UNDER_MIN_AGE');
  });

  test('기준 나이는 넘겨준 정책 값을 따른다', () => {
    expect(decideSignupAgeOutcome(18, { adultMinAge: 19, signupMinAge: 14 })).toBe(
      'TEEN_NOT_YET_AVAILABLE',
    );
  });
});
