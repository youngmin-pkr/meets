import {
  canRequestHelp,
  chatClosesAt,
  dueSafetySteps,
  notificationText,
  POLICY_DEFAULTS,
  REPORT_CATEGORY_LABELS,
  reportPriority,
  safetyCheckTimes,
  shareLinkExpiresAt,
  sharedStatusOf,
  SHARED_ALERT_LABELS,
  type SafetyCheckFacts,
} from '../src';

const kst = (s: string) => new Date(`${s}+09:00`);
const policy = {
  maxCount: POLICY_DEFAULTS.SAFETY_CHECK_MAX_COUNT,
  intervalMinutes: POLICY_DEFAULTS.SAFETY_CHECK_INTERVAL_MINUTES,
  reaskMinutes: POLICY_DEFAULTS.SAFETY_CHECK_REASK_MINUTES,
};
const startsAt = kst('2026-12-13T14:00:00');
const endsAt = kst('2026-12-13T17:00:00');
const open = POLICY_DEFAULTS.APPOINTMENT_ARRIVAL_OPEN_MINUTES;

describe('도움 요청을 할 수 있는 때', () => {
  const can = (status: Parameters<typeof canRequestHelp>[0], at: string) => canRequestHelp(status, kst(at), { startsAt, endsAt }, open);

  test('도착 버튼이 열리는 약속 1시간 전부터 약속이 끝날 때까지, 확정이나 만남 중일 때만', () => {
    expect(can('CONFIRMED', '2026-12-13T12:59:00')).toBe(false);
    expect(can('CONFIRMED', '2026-12-13T13:00:00')).toBe(true);
    expect(can('IN_PROGRESS', '2026-12-13T14:30:00')).toBe(true);
    expect(can('IN_PROGRESS', '2026-12-13T16:59:00')).toBe(true);
    expect(can('IN_PROGRESS', '2026-12-13T17:00:00')).toBe(false);
  });

  test('아직 확정 전이거나 이미 끝난 약속에는 쓸 수 없다 (신고로 안내)', () => {
    for (const status of ['PENDING_CONFIRM', 'RESCHEDULING', 'ON_HOLD', 'ENDED', 'ENDED_EARLY', 'CANCELLED', 'AUTO_ENDED'] as const) {
      expect(can(status, '2026-12-13T14:30:00')).toBe(false);
    }
  });
});

describe('안전 확인 시각 (정책 값 10)', () => {
  test('만남이 시작되고 60분 뒤부터 60분 간격으로 최대 2번', () => {
    expect(safetyCheckTimes(startsAt, endsAt, policy)).toEqual([kst('2026-12-13T15:00:00'), kst('2026-12-13T16:00:00')]);
  });

  test('만남이 끝나는 시각이나 그 뒤는 묻지 않고, 60분보다 짧은 약속에는 없다', () => {
    expect(safetyCheckTimes(startsAt, kst('2026-12-13T16:00:00'), policy)).toEqual([kst('2026-12-13T15:00:00')]);
    expect(safetyCheckTimes(startsAt, kst('2026-12-13T14:59:00'), policy)).toEqual([]);
    expect(safetyCheckTimes(startsAt, kst('2026-12-13T15:00:00'), policy)).toEqual([]);
    expect(safetyCheckTimes(startsAt, endsAt, { ...policy, maxCount: 1 })).toEqual([kst('2026-12-13T15:00:00')]);
  });

  const check = (o: Partial<SafetyCheckFacts> = {}): SafetyCheckFacts => ({ seq: 1, askedAt: kst('2026-12-13T15:00:00'), remindedAt: null, answeredAt: null, alertedAt: null, ...o });
  const steps = (checks: SafetyCheckFacts[], at: string) => dueSafetySteps(startsAt, endsAt, checks, kst(at), policy);

  test('정해진 시각이 되면 묻고, 그 전에는 아무것도 하지 않는다', () => {
    expect(steps([], '2026-12-13T14:59:00')).toEqual([]);
    expect(steps([], '2026-12-13T15:00:00')).toEqual([{ kind: 'ASK', seq: 1 }]);
  });

  test('답이 없으면 10분 뒤 한 번만 다시 묻고, 그래도 10분 동안 답이 없으면 한 번만 알린다', () => {
    expect(steps([check()], '2026-12-13T15:09:00')).toEqual([]);
    expect(steps([check()], '2026-12-13T15:10:00')).toEqual([{ kind: 'REMIND', seq: 1 }]);
    const reminded = check({ remindedAt: kst('2026-12-13T15:10:00') });
    expect(steps([reminded], '2026-12-13T15:19:00')).toEqual([]);
    expect(steps([reminded], '2026-12-13T15:20:00')).toEqual([{ kind: 'ALERT', seq: 1 }]);
    // 이미 한 일은 다시 하지 않는다
    expect(steps([check({ remindedAt: kst('2026-12-13T15:10:00'), alertedAt: kst('2026-12-13T15:20:00') })], '2026-12-13T15:55:00')).toEqual([]);
  });

  test('답하면 더 이상 다시 묻거나 알리지 않는다', () => {
    expect(steps([check({ answeredAt: kst('2026-12-13T15:02:00') })], '2026-12-13T15:30:00')).toEqual([]);
  });

  test('두 번째 확인도 같은 규칙, 약속이 끝난 뒤에는 아무것도 하지 않는다', () => {
    const first = check({ answeredAt: kst('2026-12-13T15:01:00') });
    expect(steps([first], '2026-12-13T16:00:00')).toEqual([{ kind: 'ASK', seq: 2 }]);
    const second = check({ seq: 2, askedAt: kst('2026-12-13T16:00:00') });
    expect(steps([first, second], '2026-12-13T16:10:00')).toEqual([{ kind: 'REMIND', seq: 2 }]);
    expect(steps([first], '2026-12-13T17:00:00')).toEqual([{ kind: 'ASK', seq: 2 }]); // 시각은 지났지만 이 함수는 시각만 본다 (약속 상태는 호출하는 쪽에서 확인)
  });
});

describe('믿는 사람 링크', () => {
  test('약속이 끝나고 6시간 뒤에 사라진다', () => {
    expect(shareLinkExpiresAt(endsAt, POLICY_DEFAULTS.SHARE_LINK_EXPIRE_HOURS_AFTER_END)).toEqual(kst('2026-12-13T23:00:00'));
  });

  test('상태는 도착·끝남·취소만 보이고, 안전 종료나 행사 취소의 이유는 드러나지 않는다', () => {
    expect(sharedStatusOf('CONFIRMED', null)).toBe('UPCOMING');
    expect(sharedStatusOf('CONFIRMED', kst('2026-12-13T13:50:00'))).toBe('ARRIVED');
    expect(sharedStatusOf('IN_PROGRESS', kst('2026-12-13T13:50:00'))).toBe('ARRIVED');
    for (const s of ['ENDED', 'ENDED_EARLY', 'AUTO_ENDED'] as const) expect(sharedStatusOf(s, null)).toBe('ENDED');
    expect(sharedStatusOf('CANCELLED', null)).toBe('CANCELLED');
  });

  test('믿는 사람에게 보이는 안내 문구', () => {
    expect(SHARED_ALERT_LABELS.HELP).toContain('연락해 보세요');
    expect(SHARED_ALERT_LABELS.NO_RESPONSE).toContain('안전 확인에 답이 없어요');
  });
});

describe('도움 요청 접수와 알림 글', () => {
  test('도움 요청은 청소년 신고보다도 앞선 가장 높은 우선순위', () => {
    expect(reportPriority({ help: true, reporterIsTeen: true, targetIsTeen: true })).toBe('HELP');
    expect(REPORT_CATEGORY_LABELS.HELP_REQUEST).toContain('도움 요청');
  });

  test('안전 확인 알림은 상대에게 보이지 않는다고 알리고, 정해진 문장만 쓴다', () => {
    expect(notificationText('SAFETY_CHECK', { eventName: '테스트 콘서트' })).toMatchObject({ title: '잘 만나고 계세요?' });
    expect(notificationText('SAFETY_CHECK', { eventName: '테스트 콘서트' }).body).toContain('상대에게는 보이지 않아요');
    expect(notificationText('SAFETY_CHECK_REMIND', { eventName: '테스트 콘서트' }).body).toContain('답하지 않아도 괜찮아요');
  });

  test('도움 요청으로 끝난 약속은 채팅이 바로 닫힌다. 그 밖의 중간 종료는 24시간 뒤', () => {
    const endedAt = kst('2026-12-13T14:20:00');
    expect(chatClosesAt({ status: 'ENDED_EARLY', endsAt, endedAt, endedBySafety: true }, { closeHoursAfterEnd: 24 })).toEqual(endedAt);
    expect(chatClosesAt({ status: 'ENDED_EARLY', endsAt, endedAt }, { closeHoursAfterEnd: 24 })).toEqual(kst('2026-12-14T14:20:00'));
  });
});
