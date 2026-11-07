import {
  checkEventReport,
  describeEventDate,
  describeEventDateRange,
  officialUrlKey,
} from '../src';

describe('공식 링크 비교값', () => {
  test('www, 대소문자, 끝의 /, 추적용 값, #은 무시한다', () => {
    const a = officialUrlKey('https://www.Ticket.example.com/show/123/?utm_source=insta&fbclid=x#top');
    const b = officialUrlKey('http://ticket.example.com/show/123');
    expect(a).toBe('ticket.example.com/show/123');
    expect(a).toBe(b);
  });

  test('의미 있는 주소 값은 남기고 순서를 맞춘다', () => {
    expect(officialUrlKey('https://example.com/e?b=2&a=1')).toBe('example.com/e?a=1&b=2');
    expect(officialUrlKey('https://example.com/e?id=1')).not.toBe(officialUrlKey('https://example.com/e?id=2'));
  });

  test('대문자 https와 포트 번호도 읽는다', () => {
    expect(officialUrlKey('HTTPS://Example.com:8443/a')).toBe('example.com:8443/a');
  });

  test.each(['', 'example.com/show', 'ftp://example.com', 'https://localhost/x', 'https://', 'not a url', 'https://exa mple.com', 'https://.example.com'])(
    '형식이 틀린 주소(%s)는 null',
    (raw) => {
      expect(officialUrlKey(raw)).toBeNull();
    },
  );
});

describe('행사 제보 검사', () => {
  const base = {
    category: 'PERFORMANCE' as const,
    name: '테스트 밴드 단독 공연',
    dateText: '12.13',
    placeText: '테스트홀',
    officialUrl: 'https://example.com/show',
  };

  test('올바른 제보는 통과하고 비교값을 돌려준다', () => {
    expect(checkEventReport(base)).toEqual({ ok: true, urlKey: 'example.com/show' });
  });

  test.each([
    [{ name: '  ' }, 'NAME_REQUIRED'],
    [{ name: '가'.repeat(81) }, 'NAME_TOO_LONG'],
    [{ officialUrl: '' }, 'OFFICIAL_URL_INVALID'],
    [{ officialUrl: 'example.com' }, 'OFFICIAL_URL_INVALID'],
    [{ placeText: '가'.repeat(61) }, 'TEXT_TOO_LONG'],
    [{ name: '모임 카톡 주세요' }, 'CONTAINS_CONTACT'],
    [{ placeText: '010-1234-5678' }, 'CONTAINS_CONTACT'],
  ])('%o → %s', (patch, problem) => {
    expect(checkEventReport({ ...base, ...patch })).toEqual({ ok: false, problem });
  });
});

describe('행사 날짜 글', () => {
  test('요일을 붙인다', () => {
    expect(describeEventDate('2026-12-13')).toEqual({ month: 12, day: 13, weekday: '일' });
  });

  test('하루짜리와 여러 날', () => {
    expect(describeEventDateRange(['2026-12-12'])).toBe('12.12 (토)');
    expect(describeEventDateRange(['2026-12-14', '2026-12-12', '2026-12-13'])).toBe(
      '12.12 (토) – 12.14 (월)',
    );
    expect(describeEventDateRange([])).toBe('');
  });
});
