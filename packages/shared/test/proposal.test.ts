import { describeRemaining, proposalExpiresAt, seoulDateTime } from '../src';

const policy = { expireHours: 24, eventCutoffHours: 24 };

describe('제안 만료 시각', () => {
  test('한국 시간을 실제 시각으로 바꾼다', () => {
    expect(seoulDateTime('2026-12-12', '18:00').toISOString()).toBe('2026-12-12T09:00:00.000Z');
  });

  test('보통은 보낸 뒤 24시간', () => {
    const now = new Date('2026-11-07T03:00:00Z');
    expect(proposalExpiresAt(now, { date: '2026-12-12', startTime: '18:00' }, policy)?.toISOString()).toBe('2026-11-08T03:00:00.000Z');
  });

  test('행사 24시간 전이 더 빠르면 그때까지', () => {
    const now = new Date('2026-12-10T12:00:00Z'); // 행사 시작(12-12 09:00Z)까지 45시간
    expect(proposalExpiresAt(now, { date: '2026-12-12', startTime: '18:00' }, policy)?.toISOString()).toBe('2026-12-11T09:00:00.000Z');
  });

  test('이미 행사 24시간 전이 지났으면 보낼 수 없다', () => {
    const now = new Date('2026-12-11T09:00:00Z');
    expect(proposalExpiresAt(now, { date: '2026-12-12', startTime: '18:00' }, policy)).toBeNull();
  });

  test('남은 시간 글', () => {
    const now = new Date('2026-11-07T03:00:00Z');
    expect(describeRemaining('2026-11-08T02:00:00Z', now)).toBe('23시간 남음');
    expect(describeRemaining('2026-11-07T03:30:00Z', now)).toBe('30분 남음');
    expect(describeRemaining('2026-11-07T02:00:00Z', now)).toBe('만료됨');
  });
});
