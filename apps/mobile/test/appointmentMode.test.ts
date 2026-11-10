import type { AppointmentView } from '@meets/shared';
import { appointmentHeadline, appointmentMode, todoText, upcomingAppointments } from '../src/appointmentMode';

const noActions = { confirm: false, reconfirm: false, cancel: false, arrive: false, reportNoShow: false };

function view(o: Partial<AppointmentView> = {}): AppointmentView {
  return {
    id: 'a1',
    status: 'PENDING_CONFIRM',
    counterpart: { userId: 'u2', nickname: '하늘', avatarInitial: '하', avatarColor: '#000' },
    event: { id: 'e1', name: '테스트 콘서트' },
    day: { id: 'd1', date: '2026-12-13', startTime: '14:00' },
    segments: [{ id: 's1', label: '굿즈 줄', startTime: '14:00', endTime: '17:00' }],
    meetingSpot: { id: 'm1', name: '정문 안내판 앞' },
    createdAt: '2026-11-07T03:00:00.000Z',
    startsAt: '2026-12-13T05:00:00.000Z',
    endsAt: '2026-12-13T08:00:00.000Z',
    confirm: { opensAt: '2026-12-12T09:00:00.000Z', deadline: '2026-12-13T02:00:00.000Z', mine: false, theirs: false },
    arrival: { mine: null, theirs: null },
    freeCancelUntil: '2026-12-12T05:00:00.000Z',
    reschedule: null,
    end: null,
    actions: { ...noActions, cancel: true },
    needsAction: false,
    unreadMessages: 0,
    review: { canWrite: false, done: false, deadline: '2026-12-20T08:00:00.000Z' },
    safety: { canRequestHelp: false, pendingCheck: null },
    ...o,
  };
}

describe('약속 화면 모양', () => {
  test('확정 대기: 전날 확인 전 → 지금 확인 → 상대 기다림', () => {
    expect(appointmentMode(view())).toBe('WAITING_DAY_BEFORE');
    expect(appointmentMode(view({ actions: { ...noActions, confirm: true, cancel: true } }))).toBe('CONFIRM_NOW');
    expect(appointmentMode(view({ confirm: { ...view().confirm, mine: true } }))).toBe('WAITING_PARTNER');
  });

  test('상태별', () => {
    expect(appointmentMode(view({ status: 'CONFIRMED' }))).toBe('CONFIRMED');
    expect(appointmentMode(view({ status: 'IN_PROGRESS' }))).toBe('MEETING');
    expect(appointmentMode(view({ status: 'RESCHEDULING' }))).toBe('RESCHEDULE');
    expect(appointmentMode(view({ status: 'ON_HOLD' }))).toBe('ON_HOLD');
    for (const status of ['ENDED', 'ENDED_EARLY', 'CANCELLED', 'AUTO_ENDED'] as const) expect(appointmentMode(view({ status }))).toBe('CLOSED');
  });

  test('전날 확인 제목은 내일/오늘에 맞게', () => {
    const v = view({ actions: { ...noActions, confirm: true } });
    expect(appointmentHeadline(v, { today: '2026-12-12' }).title).toBe('내일 약속,\n갈 수 있어요?');
    expect(appointmentHeadline(v, { today: '2026-12-13' }).title).toBe('오늘 약속,\n갈 수 있어요?');
  });

  test('끝난 이유에 따라 안내가 다르다 (내가 했는지, 임박 취소인지)', () => {
    const cancel = (byMe: boolean, late: boolean, cancelReason: string | null = null) =>
      appointmentHeadline(view({ status: 'CANCELLED', end: { reason: 'CANCELLED', byMe, late, cancelReason } }));
    expect(cancel(true, false).body).toContain('영향이 없어요');
    expect(cancel(true, true).body).toContain('임박 취소');
    expect(cancel(false, false, '몸이 안 좋아요')).toEqual({ title: '하늘님이 약속을 취소했어요', body: '사유: 몸이 안 좋아요' });
    expect(appointmentHeadline(view({ status: 'CANCELLED', end: { reason: 'NO_CONFIRM', byMe: false, late: false, cancelReason: null } })).title).toBe(
      '상대가 확인하지 않아 약속이 취소됐어요',
    );
    expect(appointmentHeadline(view({ status: 'AUTO_ENDED', end: { reason: 'EVENT_CANCELLED', byMe: false, late: false, cancelReason: null } })).title).toBe(
      '행사가 취소됐어요',
    );
    expect(appointmentHeadline(view({ status: 'ENDED_EARLY', end: { reason: 'NO_SHOW', byMe: false, late: false, cancelReason: null } })).body).toContain('도착 기록');
  });

  test('다시 정하기: 바뀐 일정이 없으면 다시 정할 수 없다고 안내', () => {
    const base = { deadline: '2026-11-09T03:00:00.000Z', mine: false, theirs: false };
    expect(appointmentHeadline(view({ status: 'RESCHEDULING', reschedule: { ...base, newSchedule: { date: '2026-12-13', startTime: '16:00', endTime: '17:30' } } })).title).toBe(
      '행사 일정이 바뀌었어요',
    );
    expect(appointmentHeadline(view({ status: 'RESCHEDULING', reschedule: { ...base, newSchedule: null } })).title).toBe('약속한 날이 행사에서 빠졌어요');
  });
});

describe('홈', () => {
  test("'오늘 할 일'은 지금 눌러야 하는 것이 있을 때만", () => {
    expect(todoText(view())).toBeNull();
    expect(todoText(view({ actions: { ...noActions, confirm: true } }), '2026-12-12')?.title).toBe('내일 약속, 갈 수 있는지 알려 주세요');
    expect(todoText(view({ status: 'CONFIRMED', actions: { ...noActions, arrive: true } }))?.title).toContain('도착했어요');
    expect(todoText(view({ status: 'IN_PROGRESS', actions: { ...noActions, reportNoShow: true } }))?.title).toContain('도착하지 않았어요');
  });

  test('다가오는 약속은 끝난 약속을 빼고 가까운 순서로', () => {
    const list = [
      view({ id: 'late', startsAt: '2026-12-20T05:00:00.000Z' }),
      view({ id: 'done', status: 'CANCELLED' }),
      view({ id: 'soon', status: 'CONFIRMED', startsAt: '2026-12-01T05:00:00.000Z' }),
    ];
    expect(upcomingAppointments(list).map((a) => a.id)).toEqual(['soon', 'late']);
  });
});

describe('만남 중에 내가 끝낸 약속', () => {
  test("도움 요청·차단으로 끝나면 '취소'가 아니라 '만남을 끝냈어요'", () => {
    const v = view({ status: 'ENDED_EARLY', end: { reason: 'CANCELLED', byMe: true, cancelReason: null, late: false } });
    expect(appointmentHeadline(v, { today: '2026-12-13' })).toEqual({ title: '만남을 끝냈어요', body: '내 신뢰 단계에는 영향이 없어요.' });
  });
});
