/**
 * 만 나이 계산과 가입 결과 판정
 *
 * 나이는 사용자가 입력하지 않고 본인 확인 결과의 생년월일로만 계산합니다.
 * 날짜는 한국 시간(Asia/Seoul) 기준입니다.
 */

export interface CalendarDate {
  year: number;
  month: number; // 1~12
  day: number; // 1~31
}

/** 'YYYY-MM-DD' 문자열을 날짜로 바꿉니다. 형식이 틀리거나 없는 날짜면 null. */
export function parseCalendarDate(text: string): CalendarDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** 지금 이 순간의 한국 날짜 */
export function todayInSeoul(now: Date = new Date()): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/**
 * 만 나이를 계산합니다.
 *
 * 2월 29일에 태어난 사람은 평년에는 3월 1일에 한 살을 먹는 것으로 계산합니다.
 * (해당 일이 없으면 그 달 말일에 기간이 끝난다는 민법 해석을 따른 것이고,
 *  성인 판정이 늦어지는 쪽이라 더 안전합니다.)
 * TODO(법률 검토): 2월 29일생의 생일 처리 기준을 확인해 주세요.
 */
export function manAge(birth: CalendarDate, today: CalendarDate): number {
  let age = today.year - birth.year;
  let birthdayMonth = birth.month;
  let birthdayDay = birth.day;
  if (birth.month === 2 && birth.day === 29 && !isLeapYear(today.year)) {
    birthdayMonth = 3;
    birthdayDay = 1;
  }
  const hadBirthday =
    today.month > birthdayMonth || (today.month === birthdayMonth && today.day >= birthdayDay);
  if (!hadBirthday) age -= 1;
  return age;
}

/** 본인 확인 뒤 가입을 어떻게 진행할지 */
export type SignupAgeOutcome =
  /** 성인: 가입을 계속합니다. */
  | 'ADULT'
  /** 청소년: 법률 검토가 끝나기 전까지 가입을 막습니다. (CLAUDE.md 규칙 10) */
  | 'TEEN_NOT_YET_AVAILABLE'
  /** 가입할 수 없는 나이: 안내 화면만 보여 줍니다. */
  | 'UNDER_MIN_AGE';

export function decideSignupAgeOutcome(
  age: number,
  limits: { adultMinAge: number; signupMinAge: number },
): SignupAgeOutcome {
  if (age >= limits.adultMinAge) return 'ADULT';
  if (age >= limits.signupMinAge) return 'TEEN_NOT_YET_AVAILABLE';
  return 'UNDER_MIN_AGE';
}
