import {
  APPOINTMENT_STATUSES,
  appointmentActions,
  appointmentWindow,
  canTransitionAppointment,
  confirmSchedule,
  dDayLabel,
  dueAppointmentSteps,
  formatSeoulShort,
  freeCancelUntil,
  notificationText,
  POLICY_DEFAULTS,
  pushAvailableAt,
  rangeOf,
  rangesOverlap,
  rescheduleDeadline,
  type AppointmentFacts,
  type AppointmentPolicy,
  type AppointmentStatus,
  type NotificationKind,
  type ParticipantFacts,
} from '../src';

const policy: AppointmentPolicy = {
  dayBeforeHour: POLICY_DEFAULTS.APPOINTMENT_DAY_BEFORE_HOUR,
  confirmDeadlineHours: POLICY_DEFAULTS.APPOINTMENT_CONFIRM_DEADLINE_HOURS,
  confirmReminderHours: POLICY_DEFAULTS.APPOINTMENT_CONFIRM_REMINDER_HOURS,
  freeCancelHours: POLICY_DEFAULTS.APPOINTMENT_FREE_CANCEL_HOURS,
  noShowWaitMinutes: POLICY_DEFAULTS.APPOINTMENT_NO_SHOW_WAIT_MINUTES,
  soonMinutes: POLICY_DEFAULTS.APPOINTMENT_SOON_MINUTES,
  arrivalOpenMinutes: POLICY_DEFAULTS.APPOINTMENT_ARRIVAL_OPEN_MINUTES,
};

/** 한국 시간 → Date */
const kst = (s: string) => new Date(`${s}+09:00`);

const person = (userId: string, o: Partial<ParticipantFacts> = {}): ParticipantFacts => ({
  userId,
  confirmedAt: null,
  rescheduleConfirmedAt: null,
  arrivedAt: null,
  dayBeforeNotifiedAt: null,
  reminderNotifiedAt: null,
  soonNotifiedAt: null,
  ...o,
});

const facts = (o: Partial<AppointmentFacts> = {}): AppointmentFacts => ({
  status: 'PENDING_CONFIRM',
  date: '2026-12-13',
  startTime: '14:00',
  endTime: '17:00',
  policy,
  rescheduleDeadline: null,
  participants: [person('a'), person('b')],
  ...o,
});

describe('약속 상태 전이 표 (정리문서 5장)', () => {
  const allowed: Array<[AppointmentStatus, AppointmentStatus]> = [
    ['PENDING_CONFIRM', 'CONFIRMED'],
    ['PENDING_CONFIRM', 'CANCELLED'],
    ['CONFIRMED', 'CANCELLED'],
    ['CONFIRMED', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'ENDED'],
    ['IN_PROGRESS', 'ENDED_EARLY'],
    ['CONFIRMED', 'RESCHEDULING'],
    ['PENDING_CONFIRM', 'RESCHEDULING'],
    ['RESCHEDULING', 'CONFIRMED'],
    ['RESCHEDULING', 'ON_HOLD'],
    ['PENDING_CONFIRM', 'AUTO_ENDED'],
    ['CONFIRMED', 'AUTO_ENDED'],
    ['IN_PROGRESS', 'AUTO_ENDED'],
    ['RESCHEDULING', 'AUTO_ENDED'],
    ['ON_HOLD', 'AUTO_ENDED'],
  ];
  test.each(APPOINTMENT_STATUSES.flatMap((a) => APPOINTMENT_STATUSES.map((b) => [a, b] as const)))('%s → %s', (from, to) => {
    expect(canTransitionAppointment(from, to)).toBe(allowed.some(([x, y]) => x === from && y === to));
  });
});

describe('약속 시간', () => {
  test('고른 구간의 처음~끝, 구간이 없으면 행사 시간 전체', () => {
    const day = { startTime: '12:00', endTime: '22:00' };
    expect(appointmentWindow(day, [])).toEqual({ startTime: '12:00', endTime: '22:00' });
    expect(
      appointmentWindow(day, [
        { startTime: '19:30', endTime: '21:30' },
        { startTime: '12:00', endTime: '17:00' },
      ]),
    ).toEqual({ startTime: '12:00', endTime: '21:30' });
  });

  test('겹침: 끝나는 순간 시작하면 겹치지 않음', () => {
    const a = rangeOf('2026-12-13', '15:00', '18:00');
    expect(rangesOverlap(a, rangeOf('2026-12-13', '16:00', '19:00'))).toBe(true);
    expect(rangesOverlap(a, rangeOf('2026-12-13', '18:00', '19:00'))).toBe(false);
    expect(rangesOverlap(a, rangeOf('2026-12-14', '15:00', '18:00'))).toBe(false);
  });

  test('전날 18시에 열리고, 약속 3시간 전 마감, 재촉은 마감 3시간 전', () => {
    const c = confirmSchedule('2026-12-13', '14:00', policy);
    expect(c.opensAt).toEqual(kst('2026-12-12T18:00:00'));
    expect(c.deadline).toEqual(kst('2026-12-13T11:00:00'));
    expect(c.reminderAt).toEqual(kst('2026-12-13T08:00:00'));
  });

  test('달이 바뀌는 날도 전날을 맞게 계산', () => {
    expect(confirmSchedule('2027-01-01', '10:00', policy).opensAt).toEqual(kst('2026-12-31T18:00:00'));
  });

  test('무료 취소는 약속 24시간 전까지', () => {
    expect(freeCancelUntil('2026-12-13', '14:00', policy)).toEqual(kst('2026-12-12T14:00:00'));
  });

  test('다시 정하기 기한: 48시간, 행사가 가까우면 행사 12시간 전', () => {
    const p = { hours: 48, eventCutoffHours: 12 };
    expect(rescheduleDeadline(kst('2026-12-01T12:00:00'), kst('2026-12-13T14:00:00'), p)).toEqual(kst('2026-12-03T12:00:00'));
    expect(rescheduleDeadline(kst('2026-12-12T12:00:00'), kst('2026-12-13T14:00:00'), p)).toEqual(kst('2026-12-13T02:00:00'));
    // 이미 12시간 안이면 바로 기한
    expect(rescheduleDeadline(kst('2026-12-13T10:00:00'), kst('2026-12-13T14:00:00'), p)).toEqual(kst('2026-12-13T10:00:00'));
  });

  test('D-day', () => {
    expect(dDayLabel('2026-12-13', '2026-12-06')).toBe('D-7');
    expect(dDayLabel('2026-12-13', '2026-12-13')).toBe('D-DAY');
  });
});

describe('시간이 되면 저절로 일어나는 일', () => {
  test('전날 18시 전에는 아무 일도 없다', () => {
    expect(dueAppointmentSteps(facts(), kst('2026-12-12T17:59:00'))).toEqual([]);
  });

  test('전날 18시: 둘 다에게 확인 요청 (재촉은 아직)', () => {
    expect(dueAppointmentSteps(facts(), kst('2026-12-12T18:00:00'))).toEqual([{ kind: 'NOTIFY_DAY_BEFORE', userIds: ['a', 'b'] }]);
  });

  test('재촉은 확인하지 않은 사람에게 1번만', () => {
    const notified = kst('2026-12-12T18:00:00');
    const f = facts({
      participants: [
        person('a', { dayBeforeNotifiedAt: notified, confirmedAt: kst('2026-12-12T19:00:00') }),
        person('b', { dayBeforeNotifiedAt: notified }),
      ],
    });
    expect(dueAppointmentSteps(f, kst('2026-12-13T08:00:00'))).toEqual([{ kind: 'NOTIFY_REMINDER', userIds: ['b'] }]);
    f.participants[1].reminderNotifiedAt = kst('2026-12-13T08:00:00');
    expect(dueAppointmentSteps(f, kst('2026-12-13T09:00:00'))).toEqual([]);
  });

  test('재촉 시각이 지나서 처음 확인 요청을 받으면 재촉은 보내지 않는다', () => {
    expect(dueAppointmentSteps(facts(), kst('2026-12-13T09:00:00'))).toEqual([{ kind: 'NOTIFY_DAY_BEFORE', userIds: ['a', 'b'] }]);
  });

  test('마감까지 확인하지 않은 사람이 있으면 취소 (무응답 기록)', () => {
    const f = facts({ participants: [person('a', { confirmedAt: kst('2026-12-12T19:00:00') }), person('b')] });
    expect(dueAppointmentSteps(f, kst('2026-12-13T11:00:00'))).toEqual([{ kind: 'CANCEL_NO_CONFIRM', noResponseUserIds: ['b'] }]);
  });

  test('확정된 약속: 1시간 전 알림 → 시작 → 끝', () => {
    const f = facts({ status: 'CONFIRMED' });
    expect(dueAppointmentSteps(f, kst('2026-12-13T12:59:00'))).toEqual([]);
    expect(dueAppointmentSteps(f, kst('2026-12-13T13:00:00'))).toEqual([{ kind: 'NOTIFY_SOON', userIds: ['a', 'b'] }]);
    expect(dueAppointmentSteps(f, kst('2026-12-13T14:00:00'))).toEqual([{ kind: 'START' }]);
    expect(dueAppointmentSteps(f, kst('2026-12-13T17:00:00'))).toEqual([{ kind: 'START' }, { kind: 'END' }]);
    expect(dueAppointmentSteps(facts({ status: 'IN_PROGRESS' }), kst('2026-12-13T17:00:00'))).toEqual([{ kind: 'END' }]);
  });

  test('다시 정하기 기한이 지나면 보류', () => {
    const f = facts({ status: 'RESCHEDULING', rescheduleDeadline: kst('2026-12-05T12:00:00') });
    expect(dueAppointmentSteps(f, kst('2026-12-05T11:59:00'))).toEqual([]);
    expect(dueAppointmentSteps(f, kst('2026-12-05T12:00:00'))).toEqual([{ kind: 'HOLD' }]);
  });

  test('끝난 약속은 더 바뀌지 않는다', () => {
    for (const status of ['ENDED', 'ENDED_EARLY', 'CANCELLED', 'AUTO_ENDED', 'ON_HOLD'] as const) {
      expect(dueAppointmentSteps(facts({ status }), kst('2027-01-01T00:00:00'))).toEqual([]);
    }
  });
});

describe('누를 수 있는 버튼', () => {
  const opts = { newScheduleAvailable: true };

  test("'갈 수 있어요'는 전날 18시부터 마감 전까지, 한 번만", () => {
    expect(appointmentActions(facts(), 'a', kst('2026-12-12T17:00:00'), opts).confirm).toBe(false);
    expect(appointmentActions(facts(), 'a', kst('2026-12-12T18:00:00'), opts).confirm).toBe(true);
    expect(appointmentActions(facts(), 'a', kst('2026-12-13T11:00:00'), opts).confirm).toBe(false);
    const done = facts({ participants: [person('a', { confirmedAt: kst('2026-12-12T18:30:00') }), person('b')] });
    expect(appointmentActions(done, 'a', kst('2026-12-12T19:00:00'), opts).confirm).toBe(false);
    expect(appointmentActions(done, 'b', kst('2026-12-12T19:00:00'), opts).confirm).toBe(true);
  });

  test('데모: 전날 확인을 미리 열어 둘 수 있다', () => {
    const f = facts({ confirmOpensAt: kst('2026-12-01T00:00:00') });
    expect(appointmentActions(f, 'a', kst('2026-12-01T10:00:00'), opts).confirm).toBe(true);
  });

  test('취소는 확정 대기·확정일 때 약속 시작 전까지', () => {
    expect(appointmentActions(facts(), 'a', kst('2026-12-01T00:00:00'), opts).cancel).toBe(true);
    expect(appointmentActions(facts({ status: 'CONFIRMED' }), 'a', kst('2026-12-13T13:59:00'), opts).cancel).toBe(true);
    expect(appointmentActions(facts({ status: 'IN_PROGRESS' }), 'a', kst('2026-12-13T14:30:00'), opts).cancel).toBe(false);
    expect(appointmentActions(facts({ status: 'RESCHEDULING' }), 'a', kst('2026-12-01T00:00:00'), opts).cancel).toBe(false);
  });

  test("'도착했어요'는 약속 1시간 전부터 끝날 때까지", () => {
    const f = facts({ status: 'CONFIRMED' });
    expect(appointmentActions(f, 'a', kst('2026-12-13T12:59:00'), opts).arrive).toBe(false);
    expect(appointmentActions(f, 'a', kst('2026-12-13T13:00:00'), opts).arrive).toBe(true);
    expect(appointmentActions(facts({ status: 'IN_PROGRESS' }), 'a', kst('2026-12-13T17:00:00'), opts).arrive).toBe(false);
  });

  test("'안 나왔어요'는 내가 도착했고 상대 기록이 없을 때, 약속 15분 뒤부터", () => {
    const arrived = facts({ status: 'IN_PROGRESS', participants: [person('a', { arrivedAt: kst('2026-12-13T13:52:00') }), person('b')] });
    expect(appointmentActions(arrived, 'a', kst('2026-12-13T14:14:00'), opts).reportNoShow).toBe(false);
    expect(appointmentActions(arrived, 'a', kst('2026-12-13T14:15:00'), opts).reportNoShow).toBe(true);
    // 나는 도착 기록이 없으면 못 누름
    expect(appointmentActions(arrived, 'b', kst('2026-12-13T14:15:00'), opts).reportNoShow).toBe(false);
    // 상대도 도착했으면 못 누름
    const both = facts({
      status: 'IN_PROGRESS',
      participants: [person('a', { arrivedAt: kst('2026-12-13T13:52:00') }), person('b', { arrivedAt: kst('2026-12-13T14:10:00') })],
    });
    expect(appointmentActions(both, 'a', kst('2026-12-13T14:20:00'), opts).reportNoShow).toBe(false);
  });

  test('바뀐 일정 다시 확인은 기한 전, 바뀐 일정이 있을 때만', () => {
    const f = facts({ status: 'RESCHEDULING', rescheduleDeadline: kst('2026-12-05T12:00:00') });
    expect(appointmentActions(f, 'a', kst('2026-12-04T12:00:00'), opts).reconfirm).toBe(true);
    expect(appointmentActions(f, 'a', kst('2026-12-04T12:00:00'), { newScheduleAvailable: false }).reconfirm).toBe(false);
    expect(appointmentActions(f, 'a', kst('2026-12-05T12:00:00'), opts).reconfirm).toBe(false);
  });

  test('약속에 없는 사람은 아무것도 못 누른다', () => {
    expect(Object.values(appointmentActions(facts(), 'x', kst('2026-12-12T19:00:00'), opts)).some(Boolean)).toBe(false);
  });
});

describe('알림', () => {
  test('방해 금지 시간(22시~8시)이면 푸시는 아침 8시로 미룬다', () => {
    expect(pushAvailableAt(kst('2026-12-12T21:59:00'), 22, 8)).toEqual(kst('2026-12-12T21:59:00'));
    expect(pushAvailableAt(kst('2026-12-12T22:00:00'), 22, 8)).toEqual(kst('2026-12-13T08:00:00'));
    expect(pushAvailableAt(kst('2026-12-13T03:00:00'), 22, 8)).toEqual(kst('2026-12-13T08:00:00'));
    expect(pushAvailableAt(kst('2026-12-13T08:00:00'), 22, 8)).toEqual(kst('2026-12-13T08:00:00'));
  });

  test('한국 시간 짧은 글', () => {
    expect(formatSeoulShort(kst('2026-12-13T14:00:00'))).toBe('12.13 (일) 14:00');
  });

  test('모든 알림 종류에 제목과 내용이 있다', () => {
    const kinds: NotificationKind[] = [
      'PROPOSAL_RECEIVED',
      'PROPOSAL_ACCEPTED',
      'PROPOSAL_REJECTED',
      'DAY_BEFORE_CONFIRM',
      'DAY_BEFORE_REMINDER',
      'APPOINTMENT_CONFIRMED',
      'NO_CONFIRM_PARTNER',
      'NO_CONFIRM_SELF',
      'APPOINTMENT_CANCELLED',
      'APPOINTMENT_SOON',
      'PARTNER_ARRIVED',
      'APPOINTMENT_ENDED_EARLY',
      'EVENT_SCHEDULE_CHANGED',
      'APPOINTMENT_ON_HOLD',
      'EVENT_CANCELLED',
    ];
    for (const k of kinds) {
      const t = notificationText(k, { nickname: '하늘', eventName: '테스트 콘서트', when: '12.13 (일) 14:00', deadline: '12.13 (일) 11:00', spotName: '정문' });
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.body).not.toContain('undefined');
    }
    expect(notificationText('APPOINTMENT_CANCELLED', { nickname: '하늘', eventName: '콘서트', reason: '몸이 안 좋아요' }).body).toBe(
      '하늘님이 콘서트 약속을 취소했어요. 사유: 몸이 안 좋아요',
    );
  });
});
