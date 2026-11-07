/**
 * 운영자 권한표 전체(역할 4 × 기능 10)와 행사 상태 전이 표 전체 테스트
 * (CLAUDE.md "반드시 테스트할 것")
 *
 * 기대값은 정리문서 7장 표를 그대로 옮겨 적은 것입니다. 코드의 표를 참고하지 않습니다.
 */
import { ADMIN_FUNCTIONS, ADMIN_ROLES, isAllowed, type AdminAction, type AdminFunction, type AdminRoleName } from '../src/admin/permissions';
import { assertEventTransition, EVENT_STATUS_STATES, type EventStatusState } from '../src/events/event-transitions';

// 정리문서 7장: 가능 = USE, 제안 = PROPOSE, 확정·승인 = CONFIRM
const DOC: Record<AdminFunction, Record<AdminRoleName, AdminAction[]>> = {
  VIEW_TODAY: { REVIEWER: ['USE'], REPORT_MANAGER: ['USE'], EVENT_MANAGER: ['USE'], ADMIN: ['USE'] },
  REVIEW_TICKET: { REVIEWER: ['USE'], REPORT_MANAGER: [], EVENT_MANAGER: [], ADMIN: ['USE'] },
  VIEW_TICKET_IMAGE: { REVIEWER: ['USE'], REPORT_MANAGER: [], EVENT_MANAGER: [], ADMIN: [] },
  HANDLE_REPORT: { REVIEWER: [], REPORT_MANAGER: ['USE'], EVENT_MANAGER: [], ADMIN: ['USE'] },
  VIEW_REPORT_CHAT: { REVIEWER: [], REPORT_MANAGER: ['USE'], EVENT_MANAGER: [], ADMIN: [] },
  SUSPEND_USER: { REVIEWER: [], REPORT_MANAGER: ['PROPOSE'], EVENT_MANAGER: [], ADMIN: ['CONFIRM'] },
  MANAGE_EVENT: { REVIEWER: [], REPORT_MANAGER: [], EVENT_MANAGER: ['USE'], ADMIN: ['USE'] },
  CANCEL_EVENT: { REVIEWER: [], REPORT_MANAGER: [], EVENT_MANAGER: ['PROPOSE'], ADMIN: ['CONFIRM'] },
  CHANGE_POLICY: { REVIEWER: [], REPORT_MANAGER: [], EVENT_MANAGER: [], ADMIN: ['PROPOSE', 'CONFIRM'] },
  MANAGE_ADMINS: { REVIEWER: [], REPORT_MANAGER: [], EVENT_MANAGER: [], ADMIN: ['USE'] },
};

const ACTIONS: AdminAction[] = ['USE', 'PROPOSE', 'CONFIRM'];

describe('운영자 권한표 (역할 4 × 기능 10 × 행동 3)', () => {
  test('기능 10개, 역할 4개가 모두 있다', () => {
    expect(ADMIN_FUNCTIONS).toHaveLength(10);
    expect(ADMIN_ROLES).toHaveLength(4);
  });

  const cases = ADMIN_FUNCTIONS.flatMap((fn) =>
    ADMIN_ROLES.flatMap((role) => ACTIONS.map((action) => [fn, role, action] as const)),
  );

  test.each(cases)('%s / %s / %s', (fn, role, action) => {
    expect(isAllowed(role, fn, action)).toBe(DOC[fn][role].includes(action));
  });

  test('관리자도 대화 기록과 인증 원본은 열 수 없다', () => {
    expect(isAllowed('ADMIN', 'VIEW_REPORT_CHAT', 'USE')).toBe(false);
    expect(isAllowed('ADMIN', 'VIEW_TICKET_IMAGE', 'USE')).toBe(false);
  });
});

describe('행사 상태 전이 표', () => {
  const ALLOWED: Array<[EventStatusState, EventStatusState]> = [
    ['REPORTED', 'REVIEWING'],
    ['REVIEWING', 'REGISTERED'],
    ['REVIEWING', 'REJECTED'],
    ['REGISTERED', 'CHANGED'],
    ['REGISTERED', 'CANCELLED'],
    // 사용자 결정(2026-11-07)으로 추가
    ['CHANGED', 'CHANGED'],
    ['CHANGED', 'CANCELLED'],
  ];
  const twoPeople = { proposedBy: 'event-manager', confirmedBy: 'admin' };
  const pairs = EVENT_STATUS_STATES.flatMap((from) => EVENT_STATUS_STATES.map((to) => [from, to] as const));

  test.each(pairs)('%s → %s', (from, to) => {
    const ok = ALLOWED.some(([a, b]) => a === from && b === to);
    if (ok) expect(() => assertEventTransition(from, to, twoPeople)).not.toThrow();
    else expect(() => assertEventTransition(from, to, twoPeople)).toThrow(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
  });

  test('행사 취소는 두 명 확인이 필요하다 (변경됨에서 취소할 때도)', () => {
    expect(() => assertEventTransition('REGISTERED', 'CANCELLED')).toThrow();
    expect(() => assertEventTransition('CHANGED', 'CANCELLED')).toThrow();
    expect(() =>
      assertEventTransition('CHANGED', 'CANCELLED', { proposedBy: 'a', confirmedBy: 'a' }),
    ).toThrow(/직접 확정/);
    expect(() =>
      assertEventTransition('REGISTERED', 'CANCELLED', { proposedBy: 'a', confirmedBy: 'a' }),
    ).toThrow(/직접 확정/);
  });
});
