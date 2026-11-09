/**
 * 후기 흐름의 규칙 (화면 코드와 분리해서 테스트합니다)
 * 어땠어요? → (불편했어요면 신고) → 칩 고르기 → 또 같이 가고 싶어요? → 끝
 */
import {
  toggleTag,
  type ReviewAgain,
  type ReviewBadTag,
  type ReviewGoodTag,
  type ReviewInput,
  type ReviewOverall,
} from '@meets/shared';

export interface ReviewDraft {
  overall: ReviewOverall | null;
  goodTags: ReviewGoodTag[];
  badTags: ReviewBadTag[];
  again: ReviewAgain;
  /** '앞으로 이 사람이 추천에 나오지 않게 해 주세요' (차단과 같음) */
  hideTarget: boolean;
}

export const initialReviewDraft = (): ReviewDraft => ({ overall: null, goodTags: [], badTags: [], again: 'MAYBE', hideTarget: false });

/** 어땠는지에 따라 '또 같이 가고 싶어요?'의 처음 선택을 정해 둡니다 (바꿀 수 있음) */
export function defaultAgain(overall: ReviewOverall): ReviewAgain {
  return overall === 'GREAT' ? 'YES' : overall === 'OK' ? 'MAYBE' : 'NO';
}

/** 어땠는지를 고르면 다음에 어디로 가는지: 불편했어요는 신고로, 나머지는 칩 고르기로 */
export function chooseOverall(draft: ReviewDraft, overall: ReviewOverall): { draft: ReviewDraft; next: 'REVIEW_PICK' | 'REPORT' } {
  return {
    draft: { ...draft, overall, again: defaultAgain(overall), goodTags: [], badTags: [], hideTarget: false },
    next: overall === 'UNCOMFORTABLE' ? 'REPORT' : 'REVIEW_PICK',
  };
}

export const toggleGood = (d: ReviewDraft, tag: ReviewGoodTag): ReviewDraft => ({ ...d, goodTags: toggleTag(d.goodTags, tag) });
export const toggleBad = (d: ReviewDraft, tag: ReviewBadTag): ReviewDraft => ({ ...d, badTags: toggleTag(d.badTags, tag) });

/** '또 같이 가고 싶어요?'를 고르면 '추천에서 빼기'는 풀립니다 (같이 가고 싶은 사람을 숨기는 건 모순) */
export const setAgain = (d: ReviewDraft, again: ReviewAgain): ReviewDraft => ({ ...d, again, hideTarget: false });

/** '추천에서 빼기'를 켜면 '또 같이 가고 싶어요'는 아니요로 바뀝니다 */
export const setHideTarget = (d: ReviewDraft, hide: boolean): ReviewDraft => ({ ...d, hideTarget: hide, again: hide ? 'NO' : d.again });

/** 서버에 보내는 모양. 어땠는지를 아직 안 골랐으면 null */
export function toReviewInput(d: ReviewDraft): ReviewInput | null {
  if (!d.overall) return null;
  return { overall: d.overall, goodTags: d.goodTags, badTags: d.badTags, again: d.again, hideTarget: d.hideTarget };
}

/** 신고로 넘어간 '불편했어요' 후기 (칩 없이, 또 같이 가고 싶지 않음) */
export const uncomfortableReview = (): ReviewInput => ({ overall: 'UNCOMFORTABLE', goodTags: [], badTags: [], again: 'NO', hideTarget: false });
