import type { EventDetail } from '@meets/shared';
import { initialDraft, scheduleReady, selectableDays, setSegment, toggleDay, togglePromise, toInput, updateDay } from '../src/preferenceDraft';

const day = (id: string, date: string, segs = ['s1', 's2']) => ({
  id,
  date,
  startTime: '15:00',
  endTime: '21:00',
  segments: segs.map((s, i) => ({ id: `${id}-${s}`, label: s, startTime: `${15 + i * 2}:00`, endTime: `${17 + i * 2}:00` })),
});
const event = (days: ReturnType<typeof day>[]): EventDetail => ({
  id: 'e1',
  name: '테스트',
  category: 'PERFORMANCE',
  type: 'CONCERT',
  venue: 'v',
  officialUrl: 'https://example.com',
  ticketRequired: true,
  changed: false,
  days,
  meetingSpots: [],
});

describe('입력 흐름 상태', () => {
  test('하루짜리 행사는 그날이 미리 골라지고 모든 구간이 같이로 시작', () => {
    const ev = event([day('d1', '2026-12-12')]);
    const d = initialDraft(ev, null, '2026-11-07');
    expect(Object.keys(d.days)).toEqual(['d1']);
    expect(d.days.d1).toMatchObject({ arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['d1-s1', 'd1-s2'] });
    expect(scheduleReady(d, ev)).toBe(true);
  });

  test('여러 날 행사는 날을 직접 골라야 한다', () => {
    const ev = event([day('d1', '2026-12-12'), day('d2', '2026-12-13')]);
    let d = initialDraft(ev, null, '2026-11-07');
    expect(scheduleReady(d, ev)).toBe(false);
    d = toggleDay(d, ev.days[1]);
    expect(Object.keys(d.days)).toEqual(['d2']);
    d = toggleDay(d, ev.days[1]);
    expect(d.days).toEqual({});
  });

  test('지난 날짜는 고를 수 없다', () => {
    const ev = event([day('d1', '2026-11-06'), day('d2', '2026-11-08')]);
    expect(selectableDays(ev, '2026-11-07').map((d) => d.id)).toEqual(['d2']);
  });

  test('같이할 구간이 하나도 없으면 다음으로 갈 수 없다', () => {
    const ev = event([day('d1', '2026-12-12')]);
    let d = initialDraft(ev, null, '2026-11-07');
    d = setSegment(d, 'd1', 'd1-s1', false);
    d = setSegment(d, 'd1', 'd1-s2', false);
    expect(scheduleReady(d, ev)).toBe(false);
    d = setSegment(d, 'd1', 'd1-s2', true);
    expect(scheduleReady(d, ev)).toBe(true);
  });

  test('도착을 귀가 마감보다 늦게 하면 귀가 마감을 30분 뒤로 밀어 준다', () => {
    const ev = event([day('d1', '2026-12-12')]);
    const d = updateDay(initialDraft(ev, null, '2026-11-07'), 'd1', { arriveTime: '21:00' });
    expect(d.days.d1).toMatchObject({ arriveTime: '21:00', leaveTime: '21:30' });
  });

  test('질문에 다 답해야 보낼 값이 만들어진다', () => {
    const ev = event([day('d1', '2026-12-12')]);
    let d = initialDraft(ev, null, '2026-11-07');
    expect(toInput(d, ev)).toBeNull();
    d = { ...d, tempoAnswers: [2, 2, 2], immersionAnswers: [1, 3] };
    d = togglePromise(d, 'PUNCTUAL');
    expect(toInput(d, ev)).toMatchObject({ tempoAnswers: [2, 2, 2], must: { promises: ['PUNCTUAL'] } });
    expect(togglePromise(d, 'PUNCTUAL').must.promises).toEqual([]);
  });

  test('예전 방식(몰입도 답 3개)으로 저장된 답은 다시 고르게 한다', () => {
    const ev = event([day('d1', '2026-12-12')]);
    const saved = {
      days: [{ eventDayId: 'd1', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['d1-s1'] }],
      tempoAnswers: [1, 2, 3] as Array<1 | 2 | 3>,
      immersionAnswers: [3, 2, 1] as Array<1 | 2 | 3>,
      must: { gender: 'ANY' as const, age: 'ANY' as const, promises: [] },
      tempoLevel: 2 as const,
      immersionLevel: 3 as const,
    };
    expect(initialDraft(ev, saved, '2026-11-07').immersionAnswers).toEqual([null, null]);
  });

  test('저장된 값을 불러온다 (지난 날짜는 빼고)', () => {
    const ev = event([day('d1', '2026-11-06'), day('d2', '2026-12-13')]);
    const saved = {
      days: [
        { eventDayId: 'd1', arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ['d1-s1'] },
        { eventDayId: 'd2', arriveTime: '16:00', leaveTime: '20:00', togetherSegmentIds: ['d2-s2'] },
      ],
      tempoAnswers: [1, 2, 3] as Array<1 | 2 | 3>,
      immersionAnswers: [3, 1] as Array<1 | 2 | 3>,
      must: { gender: 'SAME' as const, age: 'WITHIN_3' as const, promises: ['PUNCTUAL' as const] },
      tempoLevel: 2 as const,
      immersionLevel: 3 as const,
    };
    const d = initialDraft(ev, saved, '2026-11-07');
    expect(Object.keys(d.days)).toEqual(['d2']);
    expect(d.must).toEqual(saved.must);
  });
});
