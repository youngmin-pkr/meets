import { isValidMask, normalizeReservationNumber } from '../src';

describe('예매번호 정리', () => {
  test.each([
    ['T1234-5678', 'T12345678'],
    ['t 1234 5678', 'T12345678'],
    ['ＡＢ１２３４', 'AB1234'], // 전각 문자
  ])('%s → %s', (raw, v) => {
    expect(normalizeReservationNumber(raw)).toBe(v);
  });

  test.each(['', '123', '1234!', '가나다라마', 'A'.repeat(31)])('잘못된 번호(%s)는 null', (raw) => {
    expect(normalizeReservationNumber(raw)).toBeNull();
  });
});

describe('가릴 영역', () => {
  test('이미지 안에 있는 영역만 받는다', () => {
    expect(isValidMask({ x: 0.1, y: 0.2, w: 0.5, h: 0.1 })).toBe(true);
    expect(isValidMask({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(isValidMask({ x: 0.8, y: 0, w: 0.5, h: 0.1 })).toBe(false);
    expect(isValidMask({ x: -0.1, y: 0, w: 0.5, h: 0.1 })).toBe(false);
    expect(isValidMask({ x: 0, y: 0, w: 0, h: 0.1 })).toBe(false);
    expect(isValidMask({ x: Number.NaN, y: 0, w: 0.1, h: 0.1 })).toBe(false);
  });
});
