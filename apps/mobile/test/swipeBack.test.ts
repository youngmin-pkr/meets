import { swipeBackTarget } from '../src/swipeBack';

describe('밀어서 뒤로 가기', () => {
  const ctx = { partyBack: 'EVENTS' as const };
  it('입력 흐름은 한 단계씩 거꾸로 간다', () => {
    expect(swipeBackTarget('TEMPO', ctx)).toBe('SCHEDULE');
    expect(swipeBackTarget('IMMERSION', ctx)).toBe('TEMPO');
    expect(swipeBackTarget('MUST', ctx)).toBe('IMMERSION');
    expect(swipeBackTarget('CANDIDATES', ctx)).toBe('MUST');
  });
  it('일행 화면은 들어온 곳으로 돌아간다', () => {
    expect(swipeBackTarget('PARTY', ctx)).toBe('EVENTS');
    expect(swipeBackTarget('PARTY', { partyBack: 'PARTY_LIST' })).toBe('PARTY_LIST');
  });
  it('글을 쓰거나 손으로 그리는 화면, 첫 화면들은 밀어서 나가지 않는다', () => {
    for (const s of ['REPORT', 'EVENT_REPORT', 'TICKET_MASK', 'WELCOME', 'VERIFY', 'PROFILE', 'HOME'] as const) {
      expect(swipeBackTarget(s, ctx)).toBeNull();
    }
  });
});
