import { checkReviewInput } from '@meets/shared';
import {
  chooseOverall,
  defaultAgain,
  initialReviewDraft,
  setAgain,
  setHideTarget,
  toggleBad,
  toggleGood,
  toReviewInput,
  uncomfortableReview,
} from '../src/reviewFlow';

describe('후기 흐름', () => {
  test('어땠는지를 고르면 처음 선택이 정해지고, 불편했어요는 신고로 넘어간다', () => {
    expect(defaultAgain('GREAT')).toBe('YES');
    expect(defaultAgain('OK')).toBe('MAYBE');
    expect(defaultAgain('POOR')).toBe('NO');
    const great = chooseOverall(initialReviewDraft(), 'GREAT');
    expect(great).toMatchObject({ next: 'REVIEW_PICK', draft: { overall: 'GREAT', again: 'YES' } });
    expect(chooseOverall(initialReviewDraft(), 'UNCOMFORTABLE').next).toBe('REPORT');
  });

  test('다시 고르면 앞에서 골랐던 칩과 선택이 초기화된다', () => {
    let d = chooseOverall(initialReviewDraft(), 'GREAT').draft;
    d = toggleGood(d, 'PUNCTUAL');
    d = toggleBad(d, 'LATE');
    expect(d).toMatchObject({ goodTags: ['PUNCTUAL'], badTags: ['LATE'] });
    d = toggleGood(d, 'PUNCTUAL');
    expect(d.goodTags).toEqual([]);
    d = setHideTarget(d, true);
    d = chooseOverall(d, 'POOR').draft;
    expect(d).toMatchObject({ overall: 'POOR', again: 'NO', badTags: [], goodTags: [], hideTarget: false });
  });

  test("'추천에서 빼기'를 켜면 아니요로 바뀌고, 다른 답을 고르면 풀린다", () => {
    let d = chooseOverall(initialReviewDraft(), 'GREAT').draft;
    d = setHideTarget(d, true);
    expect(d).toMatchObject({ hideTarget: true, again: 'NO' });
    d = setAgain(d, 'YES');
    expect(d).toMatchObject({ hideTarget: false, again: 'YES' });
    expect(setHideTarget(d, false).again).toBe('YES');
  });

  test('서버에 보내는 모양은 공통 규칙 검사를 통과한다', () => {
    expect(toReviewInput(initialReviewDraft())).toBeNull();
    let d = chooseOverall(initialReviewDraft(), 'OK').draft;
    d = toggleGood(d, 'CONSIDERATE');
    const input = toReviewInput(d)!;
    expect(input).toEqual({ overall: 'OK', goodTags: ['CONSIDERATE'], badTags: [], again: 'MAYBE', hideTarget: false });
    expect(checkReviewInput(input)).toBeNull();
    expect(checkReviewInput(uncomfortableReview())).toBeNull();
  });
});
