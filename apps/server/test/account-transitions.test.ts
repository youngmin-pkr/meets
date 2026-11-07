/**
 * 계정 상태 전이 표 전체 테스트 (CLAUDE.md "반드시 테스트할 것")
 * 모든 (현재, 다음) 조합을 돌면서 표에 있는 것만 통과하는지 확인합니다.
 */
import {
  ACCOUNT_STATUS_STATES,
  AGE_CLASS_STATES,
  assertAccountStatusTransition,
  assertAgeClassTransition,
  type AccountStatusState,
  type AgeClassState,
} from '../src/account-state/account-transitions';

const ALLOWED_AGE: Array<[AgeClassState, AgeClassState]> = [
  ['UNVERIFIED', 'ADULT'],
  ['UNVERIFIED', 'TEEN'],
  ['UNVERIFIED', 'INELIGIBLE'],
  ['TEEN', 'ADULT'],
];

const ALLOWED_STATUS: Array<[AccountStatusState, AccountStatusState]> = [
  ['ACTIVE', 'SUSPENDED'],
  ['ACTIVE', 'WITHDRAWN'],
];

const pairs = <S>(states: S[]) => states.flatMap((from) => states.map((to) => [from, to] as [S, S]));
const isIn = <S>(list: Array<[S, S]>, [a, b]: [S, S]) => list.some(([x, y]) => x === a && y === b);

describe('나이 구분 전이', () => {
  test.each(pairs(AGE_CLASS_STATES))('%s → %s', (from, to) => {
    if (isIn(ALLOWED_AGE, [from, to])) {
      expect(() => assertAgeClassTransition(from, to)).not.toThrow();
    } else {
      expect(() => assertAgeClassTransition(from, to)).toThrow(
        expect.objectContaining({ code: 'INVALID_TRANSITION' }),
      );
    }
  });

  test('성인을 청소년으로 되돌릴 수 없다', () => {
    expect(() => assertAgeClassTransition('ADULT', 'TEEN')).toThrow();
  });
});

describe('이용 상태 전이', () => {
  const twoPeople = { proposedBy: 'report-manager', confirmedBy: 'admin' };

  test.each(pairs(ACCOUNT_STATUS_STATES))('%s → %s', (from, to) => {
    if (isIn(ALLOWED_STATUS, [from, to])) {
      expect(() => assertAccountStatusTransition(from, to, twoPeople)).not.toThrow();
    } else {
      expect(() => assertAccountStatusTransition(from, to, twoPeople)).toThrow(
        expect.objectContaining({ code: 'INVALID_TRANSITION' }),
      );
    }
  });

  test('정지는 확정한 사람이 없으면 거절', () => {
    expect(() => assertAccountStatusTransition('ACTIVE', 'SUSPENDED')).toThrow();
  });

  test('정지는 제안한 사람이 직접 확정할 수 없다', () => {
    expect(() =>
      assertAccountStatusTransition('ACTIVE', 'SUSPENDED', { proposedBy: 'a', confirmedBy: 'a' }),
    ).toThrow();
  });

  test('탈퇴는 두 명 확인이 필요 없다', () => {
    expect(() => assertAccountStatusTransition('ACTIVE', 'WITHDRAWN')).not.toThrow();
  });
});
