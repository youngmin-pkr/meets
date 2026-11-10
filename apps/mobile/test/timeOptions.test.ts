import { timeOptions } from '../src/timeOptions';

describe('시간 고르기 목록', () => {
  it('30분 단위로 처음부터 끝까지 만든다', () => {
    expect(timeOptions('18:00', '20:00', '19:00')).toEqual(['18:00', '18:30', '19:00', '19:30', '20:00']);
  });
  it('지금 값이 30분 단위가 아니어도 목록에 들어 있다', () => {
    const list = timeOptions('18:00', '19:00', '18:45');
    expect(list).toContain('18:45');
    expect([...list].sort()).toEqual(list);
  });
});
