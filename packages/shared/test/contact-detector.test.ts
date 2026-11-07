import { detectContact } from '../src';

describe('연락처·SNS 감지', () => {
  test.each([
    ['010-1234-5678', 'PHONE'],
    ['01012345678', 'PHONE'],
    ['010 1234 5678', 'PHONE'],
    ['０１０１２３４５６７８', 'PHONE'], // 전각 숫자
    ['공일공 일이삼사 오육칠팔', 'PHONE'], // 한글로 쓴 번호
    ['민010', 'PHONE'], // 휴대폰 앞자리
    ['공일공', 'PHONE'],
    ['1234567', 'PHONE'],
    ['me@example.com', 'EMAIL'],
    ['인스타 @fan_123', 'SNS_HANDLE'],
    ['https://example.com', 'URL'],
    ['open.kakao.com/o/abc', 'URL'],
    ['www.fan', 'URL'],
    ['카톡주세요', 'MESSENGER'],
    ['카 톡', 'MESSENGER'], // 띄어 써도 감지
    ['KAKAO', 'MESSENGER'], // 대문자도 감지
    ['인스타해요', 'MESSENGER'],
    ['텔레그램', 'MESSENGER'],
    ['오픈채팅방', 'MESSENGER'],
  ])('"%s"는 %s로 감지한다', (text, kind) => {
    const result = detectContact(text);
    expect(result.detected).toBe(true);
    expect(result.kinds).toContain(kind);
  });

  test.each([
    '민',
    '공연좋아',
    '오늘도화이팅',
    '굿즈줄은꼭서요',
    '2026콘서트',
    '3일권',
    '이삼일',
    'instant',
    '텔레비전',
    'Luna',
  ])('평범한 말 "%s"는 감지하지 않는다', (text) => {
    expect(detectContact(text)).toEqual({ detected: false, kinds: [] });
  });

  test('감지 결과에는 찾아낸 원문이 담기지 않는다', () => {
    const result = detectContact('010-1234-5678');
    expect(JSON.stringify(result)).not.toContain('1234');
  });
});
