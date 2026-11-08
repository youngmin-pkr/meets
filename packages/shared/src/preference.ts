/**
 * 입력 흐름(일정·템포·몰입도·필수 조건)의 질문과 답 (정리문서 2장 "입력 흐름", 시안 Schedule·Tempo·Immersion·Must)
 *
 * 답은 1~3의 숫자로 저장합니다. 템포는 '얼마나 빠르게 많이 다니는지',
 * 몰입도는 '얼마나 적극적으로 즐기는지'이고, 1이 가장 느긋한 쪽입니다.
 */
import type { EventCategory } from './events';

export interface ChoiceQuestion {
  id: string;
  label: string;
  title: string;
  /** 보기. value는 1(느긋함)~3(적극적) */
  options: Array<{ value: 1 | 2 | 3; text: string }>;
}

export const TEMPO_QUESTIONS: ChoiceQuestion[] = [
  {
    id: 'Q1',
    label: 'Q1 · 일정 밀도',
    title: '이번 행사에서 나는…',
    options: [
      { value: 3, text: '가능한 한 다 보고 싶어요' },
      { value: 2, text: '핵심만 보고 여유 있게 다니고 싶어요' },
      { value: 1, text: '한두 가지만 천천히 즐기고 싶어요' },
    ],
  },
  {
    id: 'Q2',
    label: 'Q2 · 기다림',
    title: '팝업 대기줄이 90분이에요. 나는?',
    options: [
      { value: 3, text: '포기하고 다른 곳부터 가요' },
      { value: 1, text: '기다리며 수다 떨면 괜찮아요' },
      { value: 2, text: '번갈아 줄 서며 다른 것도 봐요' },
    ],
  },
  {
    id: 'Q3',
    label: 'Q3 · 체력',
    title: '중간에 쉬는 시간이 필요한가요?',
    options: [
      { value: 1, text: '자주 쉬어야 해요' },
      { value: 2, text: '한두 번이면 충분해요' },
      { value: 3, text: '쉬지 않고 다닐 수 있어요' },
    ],
  },
];

const PERFORMANCE_QUESTION: ChoiceQuestion = {
  id: 'Q4',
  label: 'Q4 · 콘서트·페스티벌',
  title: '공연을 볼 때 나는…',
  options: [
    { value: 3, text: '응원법·떼창을 풀가동해요' },
    { value: 2, text: '따라 부르되 적당히 즐겨요' },
    { value: 1, text: '가만히 집중해서 감상해요' },
  ],
};

const EXHIBITION_QUESTION: ChoiceQuestion = {
  id: 'Q4',
  label: 'Q4 · 전시·팝업·박람회',
  title: '전시를 볼 때 나는…',
  options: [
    { value: 3, text: '하나하나 오래 머물러 봐요' },
    { value: 2, text: '눈에 띄는 것 위주로 봐요' },
    { value: 1, text: '훑고 지나가며 사진을 많이 찍어요' },
  ],
};

const TOGETHER_PERFORMANCE: ChoiceQuestion = {
  id: 'Q5',
  label: 'Q5 · 함께 즐길 때',
  title: '같이 간 사람이 응원법을 몰라 가만히 있다면?',
  options: [
    { value: 1, text: '신경 쓰지 않고 내 방식대로 즐겨요' },
    { value: 2, text: '알려주고 같이 해요' },
    { value: 3, text: '조금 신경 쓰이고 아쉬워요' },
  ],
};

/** 전시·팝업·박람회용 '함께 즐길 때' (사용자 결정 2026-11-08, 시안에는 없음) */
const TOGETHER_EXHIBITION: ChoiceQuestion = {
  id: 'Q5',
  label: 'Q5 · 함께 즐길 때',
  title: '같이 간 사람이 나보다 빨리 둘러보고 싶어 한다면?',
  options: [
    { value: 1, text: '각자 보고 출구에서 만나요' },
    { value: 2, text: '중간중간 맞춰 가요' },
    { value: 3, text: '같이 천천히 봤으면 좋겠어요' },
  ],
};

/**
 * 몰입도 질문은 행사 종류에 맞는 것만 보여 줍니다. (사용자 결정 2026-11-08)
 * 첫 번째 질문의 답이 몰입도 단계이고, 두 번째(함께 즐길 때)는 단계 계산에 넣지 않습니다.
 */
export const IMMERSION_QUESTIONS_BY_CATEGORY: Record<EventCategory, ChoiceQuestion[]> = {
  PERFORMANCE: [PERFORMANCE_QUESTION, TOGETHER_PERFORMANCE],
  EXHIBITION: [EXHIBITION_QUESTION, TOGETHER_EXHIBITION],
};

export function immersionQuestions(category: EventCategory): ChoiceQuestion[] {
  return IMMERSION_QUESTIONS_BY_CATEGORY[category];
}

export const IMMERSION_ANSWER_COUNT = 2;

export type AnswerValue = 1 | 2 | 3;

function roundLevel(values: number[]): AnswerValue {
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.min(3, Math.max(1, Math.round(avg))) as AnswerValue;
}

/** 템포 단계: Q1~Q3 평균을 반올림 (1~3) */
export function tempoLevel(answers: AnswerValue[]): AnswerValue {
  return roundLevel(answers);
}

/** 몰입도 단계: 행사 종류에 맞는 첫 번째 질문의 답 (1~3) */
export function immersionLevel(answers: AnswerValue[]): AnswerValue {
  return answers[0];
}

export type MustGender = 'ANY' | 'SAME';
export type MustAge = 'ANY' | 'WITHIN_3' | 'WITHIN_5';
export type PromiseCode = 'PUNCTUAL' | 'PHOTO_CONSENT' | 'NO_ALCOHOL_SMOKING' | 'IN_APP_CONTACT_ONLY';

export const MUST_GENDER_LABELS: Record<MustGender, string> = { ANY: '성별 무관', SAME: '같은 성별만' };
export const MUST_AGE_LABELS: Record<MustAge, string> = { ANY: '나이 무관', WITHIN_3: '±3세 이내', WITHIN_5: '±5세 이내' };
export const MUST_AGE_YEARS: Record<MustAge, number | null> = { ANY: null, WITHIN_3: 3, WITHIN_5: 5 };

export const PROMISE_LABELS: Record<PromiseCode, string> = {
  PUNCTUAL: '약속 시간을 지켜요 (늦으면 미리 연락)',
  PHOTO_CONSENT: '사진·영상은 올리기 전에 동의받아요',
  NO_ALCOHOL_SMOKING: '술·흡연 없이 만나요',
  IN_APP_CONTACT_ONLY: '행사 전에는 앱 안에서만 연락해요',
};
export const PROMISE_CODES = Object.keys(PROMISE_LABELS) as PromiseCode[];

/** 후보 설명에 쓰는 짧은 이름 */
export const PROMISE_SHORT_LABELS: Record<PromiseCode, string> = {
  PUNCTUAL: '시간 약속',
  PHOTO_CONSENT: '사진 동의',
  NO_ALCOHOL_SMOKING: '술·흡연 없이',
  IN_APP_CONTACT_ONLY: '앱 안에서만 연락',
};

export interface MustConditions {
  gender: MustGender;
  age: MustAge;
  promises: PromiseCode[];
}

/** 하루 일정: 도착 가능 시간, 귀가 마감, 같이할 구간 */
export interface DayPlan {
  eventDayId: string;
  arriveTime: string;
  leaveTime: string;
  togetherSegmentIds: string[];
}

/** 입력 흐름 전체 (앱 → 서버) */
export interface PreferenceInput {
  days: DayPlan[];
  tempoAnswers: AnswerValue[];
  immersionAnswers: AnswerValue[];
  must: MustConditions;
}

export interface PreferenceView extends PreferenceInput {
  tempoLevel: AnswerValue;
  immersionLevel: AnswerValue;
}

/** "HH:MM" → 분 */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** 분 → "HH:MM" */
export function fromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export type PreferenceProblem =
  | 'NO_DAYS'
  | 'UNKNOWN_DAY'
  | 'DUPLICATE_DAY'
  | 'BAD_TIME'
  | 'UNKNOWN_SEGMENT'
  | 'NO_TOGETHER_SEGMENT'
  | 'BAD_ANSWERS'
  | 'BAD_MUST';

export const PREFERENCE_PROBLEM_MESSAGES: Record<PreferenceProblem, string> = {
  NO_DAYS: '가고 싶은 날을 하나 이상 골라 주세요.',
  UNKNOWN_DAY: '행사 날짜를 다시 골라 주세요.',
  DUPLICATE_DAY: '같은 날짜가 두 번 있어요.',
  BAD_TIME: '도착 시간이 귀가 마감보다 앞이어야 해요.',
  UNKNOWN_SEGMENT: '구간을 다시 골라 주세요.',
  NO_TOGETHER_SEGMENT: '같이할 구간을 하나 이상 골라 주세요.',
  BAD_ANSWERS: '질문에 모두 답해 주세요.',
  BAD_MUST: '필수 조건을 다시 골라 주세요.',
};

interface DayShape {
  id: string;
  startTime: string;
  endTime: string;
  segments: Array<{ id: string }>;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const isAnswer = (v: unknown): v is AnswerValue => v === 1 || v === 2 || v === 3;

/** 입력 검사. 서버와 데모 서버가 같이 씁니다. */
export function checkPreference(
  input: PreferenceInput,
  eventDays: DayShape[],
): { ok: true } | { ok: false; problem: PreferenceProblem } {
  if (input.days.length === 0) return { ok: false, problem: 'NO_DAYS' };
  const seen = new Set<string>();
  for (const plan of input.days) {
    const day = eventDays.find((d) => d.id === plan.eventDayId);
    if (!day) return { ok: false, problem: 'UNKNOWN_DAY' };
    if (seen.has(day.id)) return { ok: false, problem: 'DUPLICATE_DAY' };
    seen.add(day.id);
    if (!TIME_RE.test(plan.arriveTime) || !TIME_RE.test(plan.leaveTime) || plan.arriveTime >= plan.leaveTime) {
      return { ok: false, problem: 'BAD_TIME' };
    }
    if (plan.togetherSegmentIds.some((id) => !day.segments.some((s) => s.id === id))) {
      return { ok: false, problem: 'UNKNOWN_SEGMENT' };
    }
    if (day.segments.length > 0 && plan.togetherSegmentIds.length === 0) {
      return { ok: false, problem: 'NO_TOGETHER_SEGMENT' };
    }
  }
  if (input.tempoAnswers.length !== 3 || !input.tempoAnswers.every(isAnswer)) return { ok: false, problem: 'BAD_ANSWERS' };
  if (input.immersionAnswers.length !== IMMERSION_ANSWER_COUNT || !input.immersionAnswers.every(isAnswer)) {
    return { ok: false, problem: 'BAD_ANSWERS' };
  }
  const m = input.must;
  if (
    !(m.gender in MUST_GENDER_LABELS) ||
    !(m.age in MUST_AGE_LABELS) ||
    !m.promises.every((p) => PROMISE_CODES.includes(p)) ||
    new Set(m.promises).size !== m.promises.length
  ) {
    return { ok: false, problem: 'BAD_MUST' };
  }
  return { ok: true };
}
