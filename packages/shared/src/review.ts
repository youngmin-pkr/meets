/**
 * 후기 (정리문서 2장 "후기·신뢰")
 *
 * - 점수 없이 상황 칩만 고릅니다. 후기 내용은 상대에게 보이지 않습니다.
 * - 서로 '또 같이 가고 싶어요'를 골랐을 때만 연결됩니다. (한쪽만 고르면 상대에게 아무것도 알려지지 않음)
 * - 행사가 취소됐거나 중간에 끝난 약속에는 후기를 요청하지 않습니다.
 */

export const REVIEW_OVERALL_CODES = ['GREAT', 'OK', 'POOR', 'UNCOMFORTABLE'] as const;
export type ReviewOverall = (typeof REVIEW_OVERALL_CODES)[number];

export const REVIEW_OVERALL: Record<ReviewOverall, { label: string; hint: string }> = {
  GREAT: { label: '좋았어요', hint: '또 같이 가고 싶어요' },
  OK: { label: '괜찮았어요', hint: '무난하게 잘 지냈어요' },
  POOR: { label: '아쉬웠어요', hint: '잘 맞지 않는 부분이 있었어요' },
  UNCOMFORTABLE: { label: '불편했어요', hint: '안전이나 예의에 문제가 있었어요' },
};

export const REVIEW_GOOD_TAGS = {
  TEMPO_MATCH: '템포가 잘 맞았어요',
  STYLE_MATCH: '즐기는 방식이 비슷했어요',
  PUNCTUAL: '약속을 잘 지켰어요',
  COMFORTABLE_TALK: '대화가 편했어요',
  PHOTO_CONSENT: '사진·영상 동의를 지켰어요',
  CONSIDERATE: '배려해 줬어요',
} as const;
export type ReviewGoodTag = keyof typeof REVIEW_GOOD_TAGS;
export const REVIEW_GOOD_TAG_CODES = Object.keys(REVIEW_GOOD_TAGS) as ReviewGoodTag[];

export const REVIEW_BAD_TAGS = {
  TEMPO_MISMATCH: '템포가 안 맞았어요',
  STYLE_MISMATCH: '즐기는 방식이 달랐어요',
  LATE: '약속에 늦었어요',
  HARD_TO_REACH: '연락이 잘 안 됐어요',
  TALK_BURDEN: '대화가 부담스러웠어요',
} as const;
export type ReviewBadTag = keyof typeof REVIEW_BAD_TAGS;
export const REVIEW_BAD_TAG_CODES = Object.keys(REVIEW_BAD_TAGS) as ReviewBadTag[];

export const REVIEW_AGAIN_CODES = ['YES', 'MAYBE', 'NO'] as const;
export type ReviewAgain = (typeof REVIEW_AGAIN_CODES)[number];
export const REVIEW_AGAIN_LABELS: Record<ReviewAgain, string> = {
  YES: '네, 또 같이 가고 싶어요',
  MAYBE: '상황 봐서 다음에 정할게요',
  NO: '아니요, 이번으로 충분해요',
};

export interface ReviewInput {
  overall: ReviewOverall;
  goodTags: ReviewGoodTag[];
  badTags: ReviewBadTag[];
  again: ReviewAgain;
  /** '앞으로 이 사람이 추천에 나오지 않게 해 주세요' (차단과 같음) */
  hideTarget: boolean;
  /** 여러 명이 만난 약속에서 누구에 대한 후기인지. 1:1이면 비워 둡니다 */
  targetId?: string;
}

export type ReviewProblem = 'OVERALL' | 'GOOD_TAGS' | 'BAD_TAGS' | 'AGAIN';

export const REVIEW_PROBLEM_MESSAGES: Record<ReviewProblem, string> = {
  OVERALL: '어땠는지 골라 주세요.',
  GOOD_TAGS: '좋았던 점을 다시 골라 주세요.',
  BAD_TAGS: '아쉬웠던 점을 다시 골라 주세요.',
  AGAIN: '또 같이 가고 싶은지 골라 주세요.',
};

const distinctAndKnown = (list: readonly string[], known: readonly string[]) =>
  Array.isArray(list) && new Set(list).size === list.length && list.every((x) => known.includes(x));

/** 후기 입력 검사 */
export function checkReviewInput(input: ReviewInput): ReviewProblem | null {
  if (!REVIEW_OVERALL_CODES.includes(input.overall)) return 'OVERALL';
  if (!distinctAndKnown(input.goodTags, REVIEW_GOOD_TAG_CODES)) return 'GOOD_TAGS';
  if (!distinctAndKnown(input.badTags, REVIEW_BAD_TAG_CODES)) return 'BAD_TAGS';
  if (!REVIEW_AGAIN_CODES.includes(input.again)) return 'AGAIN';
  return null;
}

/** 칩 하나를 켜고 끕니다 */
export function toggleTag<T extends string>(list: readonly T[], code: T): T[] {
  return list.includes(code) ? list.filter((x) => x !== code) : [...list, code];
}

/** 후기를 남길 수 있는 마지막 시각: 만남이 끝나고 N일 */
export function reviewDeadline(endsAt: Date, windowDays: number): Date {
  return new Date(endsAt.getTime() + windowDays * 24 * 60 * 60 * 1000);
}

/** 후기 요청을 받아야 하는 약속인지: 정상적으로 끝난 만남만 (행사 취소·중간 종료·취소는 제외) */
export function wantsReview(status: string): boolean {
  return status === 'ENDED';
}
