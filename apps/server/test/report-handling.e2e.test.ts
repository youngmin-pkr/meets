/**
 * 7-2단계: 신고 처리 (대기열·담당자·대화 열람·조치·이용 정지·감사 기록)
 * 기준 행사: 2026-12-12(토)·12-13(일), 구간 '굿즈 줄' 15:00~17:00, '공연' 18:00~20:30
 */
import { Logger, type INestApplication } from '@nestjs/common';
import { assertReportTransition, REPORT_STATUSES } from '../src/reports/report-transitions';
import { AdminReportsService } from '../src/reports/admin-reports.service';
import { adminToken, ALL_TERMS, auth, fakeToken, http, resetDb, startApp, TestClock } from './helpers';
import { fixtures, kst } from './appointment-fixtures';

let app: INestApplication;
let f: ReturnType<typeof fixtures>;
const clock = new TestClock();

beforeAll(async () => {
  app = await startApp(clock, false, () => 0.99);
  f = fixtures(app);
});

beforeEach(async () => {
  clock.current = kst('2026-11-07T12:00:00');
  await resetDb(app);
  await f.prisma.policyValue.create({ data: { key: 'SESSION_TTL_DAYS', value: 365, effectiveFrom: kst('2026-01-01T00:00:00') } });
  await f.prisma.policyValue.create({ data: { key: 'ADMIN_SESSION_TTL_HOURS', value: 24 * 365, effectiveFrom: kst('2026-01-01T00:00:00') } });
});

afterAll(async () => {
  await app.close();
});

type M = { token: string; userId: string };
const GOOD = '직접 확인한 사유예요'; // 사유는 5자 이상

// ───── 도우미 ─────
async function admins() {
  return {
    rm1: await adminToken(app, 'REPORT_MANAGER', 'rm1'),
    rm2: await adminToken(app, 'REPORT_MANAGER', 'rm2'),
    admin: await adminToken(app, 'ADMIN', 'adm1'),
    reviewer: await adminToken(app, 'REVIEWER', 'rev1'),
    eventMgr: await adminToken(app, 'EVENT_MANAGER', 'evm1'),
  };
}
const adminId = async (loginId: string) => (await f.prisma.adminUser.findUniqueOrThrow({ where: { loginId } })).id;
const get = (t: string, path: string) => http(app).get(path).set(auth(t));
const post = (t: string, path: string, body: object = {}) => http(app).post(path).set(auth(t)).send(body);

/** a·b·c·d가 한 행사에 입력·인증을 마친 상태 */
async function four() {
  const { ev, members } = await f.setup(['a', 'b', 'c', 'd']);
  return { ev, a: members[0], b: members[1], c: members[2], d: members[3] };
}
const report = (m: M, appointmentId: string, o: Record<string, unknown> = {}) =>
  post(m.token, '/reports', { appointmentId, category: 'STALKING', detail: '계속 연락했어요', alsoBlock: false, ...o });
const kinds = async (m: M) => ((await get(m.token, '/me/notifications').expect(200)).body.items as Array<{ kind: string; body: string }>).map((n) => n.kind);
/** 신고 처리 기록만 (행사 등록 같은 준비 과정의 기록은 뺌) */
const reportAuditRows = async () =>
  (await f.prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).filter((r) => r.action.startsWith('REPORT_') || r.action.startsWith('USER_SUSPEND'));
const audit = async () => (await reportAuditRows()).map((r) => r.action);

/** from이 to를 신고한 접수 건 */
async function reported(from: M, to: M, ev: Awaited<ReturnType<typeof f.createEvent>>, day = 0, seg = 0, o: Record<string, unknown> = {}) {
  const appointmentId = await f.appoint(to, from, ev, day, seg);
  const res = await report(from, appointmentId, o).expect(201);
  return { appointmentId, reportId: res.body.id as string };
}

describe('신고 상태 전이 표 (정리문서 5장)', () => {
  const allowed = [
    ['RECEIVED', 'QUEUED'],
    ['QUEUED', 'IN_REVIEW'],
    ['IN_REVIEW', 'SUSPENSION_PROPOSED'],
    ['SUSPENSION_PROPOSED', 'CONFIRMED'],
    ['IN_REVIEW', 'CLOSED'],
    ['SUSPENSION_PROPOSED', 'IN_REVIEW'],
    ['CONFIRMED', 'CLOSED'],
  ];
  const approval = { proposedBy: 'p', confirmedBy: 'c' };
  test.each(REPORT_STATUSES.flatMap((a) => REPORT_STATUSES.map((b) => [a, b] as const)))('%s → %s', (from, to) => {
    if (allowed.some(([x, y]) => x === from && y === to)) expect(() => assertReportTransition(from, to, approval)).not.toThrow();
    else expect(() => assertReportTransition(from, to, approval)).toThrow(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
  });

  test('정지 확정은 제안한 사람과 확정한 사람이 달라야 한다 (두 명 확인)', () => {
    expect(() => assertReportTransition('SUSPENSION_PROPOSED', 'CONFIRMED')).toThrow(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
    expect(() => assertReportTransition('SUSPENSION_PROPOSED', 'CONFIRMED', { proposedBy: 'same', confirmedBy: 'same' })).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
    expect(() => assertReportTransition('SUSPENSION_PROPOSED', 'CONFIRMED', approval)).not.toThrow();
  });
});

describe('대기열과 권한 (서버에서 권한표로 검사)', () => {
  test('신고 목록·상세·담당 지정은 신고 담당과 관리자만, 로그인하지 않았거나 일반 사용자는 못 본다', async () => {
    const { ev, a, b } = await four();
    const t = await admins();
    const { reportId } = await reported(a, b, ev);
    for (const [token, ok] of [[t.rm1, true], [t.admin, true], [t.reviewer, false], [t.eventMgr, false]] as const) {
      await get(token, '/admin/reports').expect(ok ? 200 : 403);
      await get(token, `/admin/reports/${reportId}`).expect(ok ? 200 : 403);
    }
    await post(t.reviewer, `/admin/reports/${reportId}/claim`).expect(403);
    await http(app).get('/admin/reports').expect(401);
    await get(a.token, '/admin/reports').expect(401);
  });

  test('목록은 도움 요청 > 청소년 > 일반 순서, 같으면 오래된 것 먼저. 이름·내용은 상세에서만 보인다', async () => {
    const { ev, a, b, c, d } = await four();
    const t = await admins();
    // 약속 셋: (b,c) 일반, (c,d) 일반, (a,b) 나중에 a가 청소년이 됨
    const gen1 = await f.appoint(b, c, ev, 0, 0);
    const gen2 = await f.appoint(c, d, ev, 0, 1);
    const teen = await f.appoint(a, b, ev, 1, 0);
    const first = (await report(b, gen1).expect(201)).body.id as string; // 일반 (가장 먼저)
    const second = (await report(d, gen2).expect(201)).body.id as string; // 일반
    await f.prisma.user.update({ where: { id: a.userId }, data: { ageClass: 'TEEN' } });
    const third = (await report(b, teen).expect(201)).body.id as string; // 신고당한 사람이 청소년 → 청소년 신고 (가장 나중에 접수)
    const list = (await get(t.rm1, '/admin/reports').expect(200)).body as Array<{ id: string; priority: string }>;
    expect(list.map((x) => x.id)).toEqual([third, first, second]);
    expect(list.map((x) => x.priority)).toEqual(['TEEN', 'GENERAL', 'GENERAL']);
    expect(Object.keys(list[0]).sort()).toEqual(['assigned', 'assignedToMe', 'category', 'categoryLabel', 'createdAt', 'eventName', 'id', 'priority', 'status']);
    expect(JSON.stringify(list)).not.toMatch(/테스트[abcd]|계속 연락했어요/);
  });

  test('상세: 양쪽 별명·도착 기록·상대의 과거 신고 수가 보이고 대화 내용은 없다', async () => {
    const { ev, a, b } = await four();
    const t = await admins();
    const { reportId, appointmentId } = await reported(a, b, ev, 0, 0, { detail: '계속 연락했어요' });
    await f.prisma.appointmentParticipant.update({ where: { appointmentId_userId: { appointmentId, userId: a.userId } }, data: { arrivedAt: kst('2026-12-12T13:52:00') } });
    await http(app).post(`/appointments/${appointmentId}/chat`).set(auth(b.token)).send({ body: '비밀 대화 내용' }).expect(201);
    const d = (await get(t.admin, `/admin/reports/${reportId}`).expect(200)).body;
    expect(d).toMatchObject({
      status: 'QUEUED',
      detail: '계속 연락했어요',
      reporter: { nickname: '테스트a', ageClass: 'ADULT', arrivedAt: kst('2026-12-12T13:52:00').toISOString() },
      target: { nickname: '테스트b', ageClass: 'ADULT', arrivedAt: null },
      targetPastReports: { total: 0, upheld: 0 },
      pendingSuspension: null,
      outcome: null,
    });
    expect(JSON.stringify(d)).not.toContain('비밀 대화 내용');
    await get(t.admin, '/admin/reports/11111111-1111-4111-8111-111111111111').expect(404);
  });

  test('담당 지정: 대기 → 처리 중, 한 사람만. 이미 담당자가 있으면 거절', async () => {
    const { ev, a, b } = await four();
    const t = await admins();
    const { reportId } = await reported(a, b, ev);
    expect((await post(t.rm1, `/admin/reports/${reportId}/claim`).expect(200)).body).toEqual({ id: reportId, status: 'IN_REVIEW' });
    expect((await post(t.rm2, `/admin/reports/${reportId}/claim`).expect(409)).body.code).toBe('REPORT_STATE');
    expect((await post(t.rm1, `/admin/reports/${reportId}/claim`).expect(409)).body.code).toBe('REPORT_STATE');
    const row = await f.prisma.report.findUniqueOrThrow({ where: { id: reportId } });
    expect(row).toMatchObject({ status: 'IN_REVIEW', assigneeId: await adminId('rm1') });
    const mine = (await get(t.rm1, '/admin/reports').expect(200)).body[0];
    expect(mine).toMatchObject({ assigned: true, assignedToMe: true });
    expect((await get(t.rm2, '/admin/reports').expect(200)).body[0]).toMatchObject({ assigned: true, assignedToMe: false });
  });
});

describe('대화 기록 열람 (신고 건에서만, 사유를 적고, 기록이 남는다)', () => {
  async function claimed() {
    const { ev, a, b, c, d } = await four();
    const t = await admins();
    const { reportId, appointmentId } = await reported(a, b, ev);
    await http(app).post(`/appointments/${appointmentId}/chat`).set(auth(b.token)).send({ body: '안녕하세요' }).expect(201);
    await http(app).post(`/appointments/${appointmentId}/chat`).set(auth(a.token)).send({ body: '네 안녕하세요' }).expect(201);
    await post(t.rm1, `/admin/reports/${reportId}/claim`).expect(200);
    return { ev, a, b, c, d, t, reportId, appointmentId };
  }

  test('권한표대로 신고 담당만 열 수 있고, 관리자·검수자·행사 담당은 못 연다', async () => {
    const { t, reportId } = await claimed();
    await post(t.admin, `/admin/reports/${reportId}/chat`, { reason: GOOD }).expect(403);
    await post(t.reviewer, `/admin/reports/${reportId}/chat`, { reason: GOOD }).expect(403);
    await post(t.eventMgr, `/admin/reports/${reportId}/chat`, { reason: GOOD }).expect(403);
    await http(app).post(`/admin/reports/${reportId}/chat`).send({ reason: GOOD }).expect(401);
    expect(await audit()).not.toContain('REPORT_CHAT_VIEW');
  });

  test('담당자로 지정된 신고 담당만, 사유를 5자 이상 적어야 열린다', async () => {
    const { t, reportId, ev, a, b } = await claimed();
    // 사유가 짧거나 없으면 안 열린다 (기록도 남지 않는다)
    expect((await post(t.rm1, `/admin/reports/${reportId}/chat`, { reason: '짧음' }).expect(400)).body).toMatchObject({ code: 'REASON_REQUIRED', detail: { min: 5 } });
    expect((await post(t.rm1, `/admin/reports/${reportId}/chat`, { reason: '     ' }).expect(400)).body.code).toBe('REASON_REQUIRED');
    await post(t.rm1, `/admin/reports/${reportId}/chat`, {}).expect(400);
    // 다른 신고 담당은 담당자가 아니라서 못 연다
    expect((await post(t.rm2, `/admin/reports/${reportId}/chat`, { reason: GOOD }).expect(403)).body.code).toBe('FORBIDDEN');
    // 아직 담당자가 없는 신고도 못 연다
    const other = await reported(b, a, ev, 1, 0);
    expect((await post(t.rm1, `/admin/reports/${other.reportId}/chat`, { reason: GOOD }).expect(409)).body.code).toBe('REPORT_STATE');
    expect(await audit()).not.toContain('REPORT_CHAT_VIEW');
  });

  test('열리면 신고한 사람·신고당한 사람·시스템 구분과 함께 보이고, 열 때마다 사유와 함께 기록된다', async () => {
    const { t, reportId } = await claimed();
    const res = await post(t.rm1, `/admin/reports/${reportId}/chat`, { reason: '신고 내용을 대화로 확인' }).expect(200);
    expect(res.body.reportId).toBe(reportId);
    expect(res.body.messages.map((m: { side: string; body: string }) => [m.side, m.body])).toEqual([
      ['SYSTEM', '약속이 만들어졌어요. 연락처를 주고받지 않아도 만날 수 있어요.'],
      ['TARGET', '안녕하세요'],
      ['REPORTER', '네 안녕하세요'],
    ]);
    await post(t.rm1, `/admin/reports/${reportId}/chat`, { reason: '다시 한 번 확인합니다' }).expect(200);
    const rows = await f.prisma.auditLog.findMany({ where: { action: 'REPORT_CHAT_VIEW' }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => [r.actorId, r.targetType, r.targetId, r.reason])).toEqual([
      [await adminId('rm1'), 'Report', reportId, '신고 내용을 대화로 확인'],
      [await adminId('rm1'), 'Report', reportId, '다시 한 번 확인합니다'],
    ]);
  });

  test('다른 약속의 대화는 열 수 없다 (이 신고 건의 약속만)', async () => {
    const { t, reportId, ev, a, c } = await claimed();
    const second = await f.appoint(c, a, ev, 1, 0);
    await http(app).post(`/appointments/${second}/chat`).set(auth(c.token)).send({ body: '다른 약속의 비밀' }).expect(201);
    const res = await post(t.rm1, `/admin/reports/${reportId}/chat`, { reason: GOOD }).expect(200);
    expect(JSON.stringify(res.body)).not.toContain('다른 약속의 비밀');
  });

  test('연락처가 든 대화 내용은 기록(AuditLog)과 서버 로그에 남지 않는다 (규칙 11)', async () => {
    const { t, reportId, appointmentId, a } = await claimed();
    await http(app).post(`/appointments/${appointmentId}/chat`).set(auth(a.token)).send({ body: '제 번호는 01098765432예요', confirmContact: true }).expect(201);
    const lines: string[] = [];
    const capture = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    const spies = [
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture),
      jest.spyOn(Logger.prototype, 'error').mockImplementation(capture),
      jest.spyOn(Logger.prototype, 'log').mockImplementation(capture),
      jest.spyOn(console, 'log').mockImplementation(capture),
      jest.spyOn(console, 'error').mockImplementation(capture),
    ];
    try {
      const res = await post(t.rm1, `/admin/reports/${reportId}/chat`, { reason: GOOD }).expect(200);
      expect(res.body.messages.some((m: { body: string; contactDetected: boolean }) => m.body.includes('98765432') && m.contactDetected)).toBe(true);
      await post(t.rm1, `/admin/reports/${reportId}/chat`, { reason: '짧' }).expect(400);
      expect(lines.join('\n')).not.toContain('98765432');
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    expect(JSON.stringify(await f.prisma.auditLog.findMany())).not.toContain('98765432');
  });
});

describe('조치하고 종결', () => {
  async function inReview(o: { category?: string } = {}) {
    const { ev, a, b, c, d } = await four();
    const t = await admins();
    const { reportId, appointmentId } = await reported(a, b, ev, 0, 0, o.category ? { category: o.category } : {});
    await post(t.rm1, `/admin/reports/${reportId}/claim`).expect(200);
    return { ev, a, b, c, d, t, reportId, appointmentId };
  }
  const resolve = (t: string, id: string, action: string, reason = GOOD) => post(t, `/admin/reports/${id}/resolve`, { action, reason });

  test('조치 없음: 종결되고 사실 확인이 아니며, 신고한 사람에게만 결과가 가고, 신고당한 사람에게는 아무것도 가지 않는다', async () => {
    const { t, a, b, reportId } = await inReview();
    expect((await resolve(t.rm1, reportId, 'NO_ACTION').expect(200)).body).toEqual({ id: reportId, status: 'CLOSED', outcome: 'NO_ACTION' });
    expect(await f.prisma.report.findUniqueOrThrow({ where: { id: reportId } })).toMatchObject({ status: 'CLOSED', upheld: false, outcome: 'NO_ACTION', resolvedAt: expect.any(Date) });
    const note = (await get(a.token, '/me/notifications')).body.items.find((n: { kind: string }) => n.kind === 'REPORT_RESULT');
    expect(note.body).toContain('조치할 내용을 찾지 못했어요');
    expect(await kinds(b)).not.toEqual(expect.arrayContaining(['REPORT_RESULT', 'ADMIN_WARNING', 'ADMIN_RESTRICTION']));
  });

  test('기록만 남기기: 사실로 확인되고 신고한 사람에게 결과가 간다', async () => {
    const { t, a, b, reportId } = await inReview();
    await resolve(t.rm1, reportId, 'RECORD_ONLY').expect(200);
    expect(await f.prisma.report.findUniqueOrThrow({ where: { id: reportId } })).toMatchObject({ upheld: true, outcome: 'RECORD_ONLY' });
    expect(((await get(a.token, '/me/notifications')).body.items as Array<{ kind: string; body: string }>).find((n) => n.kind === 'REPORT_RESULT')!.body).toContain('필요한 조치를 했어요');
    expect((await kinds(b)).filter((k) => k === 'ADMIN_WARNING' || k === 'ADMIN_RESTRICTION')).toEqual([]);
  });

  test('경고: 신고당한 사람에게 정해진 문장의 운영 안내만 가고, 신고한 사람 정보는 없다', async () => {
    const { t, b, reportId } = await inReview();
    await resolve(t.rm1, reportId, 'WARN', '경고 사유를 적습니다').expect(200);
    const note = (await get(b.token, '/me/notifications')).body.items.find((n: { kind: string }) => n.kind === 'ADMIN_WARNING');
    expect(note).toMatchObject({ title: '운영 안내', body: expect.stringContaining('이용 규칙을 지켜 주세요') });
    expect(JSON.stringify(note)).not.toMatch(/테스트a|계속 연락|경고 사유|STALKING/);
  });

  test('기능 제한 7일: 제안 보내기·수락만 막히고 채팅은 되며, 기간이 지나면 풀린다', async () => {
    const { t, ev, a, b, c, reportId, appointmentId } = await inReview();
    await resolve(t.rm1, reportId, 'RESTRICT').expect(200);
    const r = await f.prisma.userRestriction.findFirstOrThrow({ where: { userId: b.userId } });
    expect(r).toMatchObject({ kind: 'PROPOSALS', reportId });
    expect(r.endsAt).toEqual(kst('2026-11-14T12:00:00'));
    const note = (await get(b.token, '/me/notifications')).body.items.find((n: { kind: string }) => n.kind === 'ADMIN_RESTRICTION');
    expect(note.body).toContain('11.14 (토) 12:00까지 제안 보내기와 수락이 제한돼요');

    // 제안 보내기: 막힘 (받는 사람은 제한이 없어도)
    const send = await http(app).post(`/events/${ev.id}/proposals`).set(auth(b.token)).send(f_body(ev, c.userId, 1, 0)).expect(403);
    expect(send.body).toMatchObject({ code: 'RESTRICTED', message: expect.stringContaining('11.14 (토) 12:00까지') });
    // 수락: 막힘
    const toB = await f.propose(c, b, ev, 1, 0);
    expect((await post(b.token, `/proposals/${toB}/accept`).expect(403)).body.code).toBe('RESTRICTED');
    // 채팅과 이미 만든 약속은 그대로
    await http(app).post(`/appointments/${appointmentId}/chat`).set(auth(b.token)).send({ body: '채팅은 돼요' }).expect(201);
    expect((await get(b.token, `/appointments/${appointmentId}`).expect(200)).body.status).toBe('PENDING_CONFIRM');
    expect((await get(a.token, '/me/proposals').expect(200)).status).toBe(200);
    // 제한이 끝나면 다시 할 수 있다
    clock.current = kst('2026-11-14T12:00:00');
    // 처음 받은 제안은 24시간이 지나 만료됐으므로, 새 제안을 받아 수락한다
    const again = await f.propose(c, b, ev, 1, 0);
    await post(b.token, `/proposals/${again}/accept`).expect(200);
  });

  test('사유 없이는 조치할 수 없고, 담당자만 조치할 수 있으며, 한 번 종결된 신고는 다시 조치할 수 없다', async () => {
    const { t, ev, a, b, reportId } = await inReview();
    expect((await resolve(t.rm1, reportId, 'WARN', '짧음').expect(400)).body.code).toBe('REASON_REQUIRED');
    await resolve(t.rm1, reportId, 'NOPE').expect(400);
    expect((await resolve(t.rm2, reportId, 'WARN').expect(403)).body.code).toBe('FORBIDDEN');
    // 권한표: 검수자·행사 담당은 조치 자체를 못 한다
    await resolve(t.reviewer, reportId, 'WARN').expect(403);
    await resolve(t.eventMgr, reportId, 'WARN').expect(403);
    // 담당 지정 전 신고는 조치할 수 없다
    const unclaimed = await reported(b, a, ev, 1, 0);
    expect((await resolve(t.rm1, unclaimed.reportId, 'WARN').expect(409)).body.code).toBe('REPORT_STATE');
    await resolve(t.rm1, reportId, 'WARN').expect(200);
    expect((await resolve(t.rm1, reportId, 'NO_ACTION').expect(409)).body.code).toBe('REPORT_STATE');
    expect(await f.prisma.userRestriction.count()).toBe(0);
  });

  test('관리자도 신고를 담당하고 조치할 수 있다 (신고 처리 권한), 대화는 못 연다', async () => {
    const { ev, a, b } = await four();
    const t = await admins();
    const { reportId } = await reported(a, b, ev);
    await post(t.admin, `/admin/reports/${reportId}/claim`).expect(200);
    await post(t.admin, `/admin/reports/${reportId}/chat`, { reason: GOOD }).expect(403);
    await resolve(t.admin, reportId, 'RECORD_ONLY').expect(200);
  });

  test('모든 조치는 누가·언제·왜 했는지 기록된다', async () => {
    const { t, reportId } = await inReview();
    await get(t.rm1, `/admin/reports/${reportId}`).expect(200);
    await resolve(t.rm1, reportId, 'WARN', '사유: 반복된 연락').expect(200);
    const rows = await reportAuditRows();
    expect(rows.map((r) => r.action)).toEqual(['REPORT_CLAIM', 'REPORT_VIEW', 'REPORT_WARN']);
    const warn = rows[2];
    expect(warn).toMatchObject({ actorId: await adminId('rm1'), targetType: 'Report', targetId: reportId, reason: '사유: 반복된 연락' });
    expect(warn.createdAt).toBeInstanceOf(Date);
  });

  test('목록·상세 열람과 담당 지정도 기록된다', async () => {
    const { ev, a, b } = await four();
    const t = await admins();
    const { reportId } = await reported(a, b, ev);
    await get(t.admin, '/admin/reports').expect(200);
    await get(t.admin, `/admin/reports/${reportId}`).expect(200);
    await post(t.admin, `/admin/reports/${reportId}/claim`).expect(200);
    expect(await audit()).toEqual(['REPORT_QUEUE_VIEW', 'REPORT_VIEW', 'REPORT_CLAIM']);
  });
});

/** 후보에게 보내는 제안 본문 */
function f_body(ev: Awaited<ReturnType<ReturnType<typeof fixtures>['createEvent']>>, receiverId: string, day = 0, seg = 0) {
  return { receiverId, eventDayId: ev.days[day].id, segmentIds: [ev.days[day].segments[seg].id], meetingSpotId: ev.meetingSpots[0].id };
}

describe('조치가 신뢰 단계에 반영된다 (정책 값 11·12)', () => {
  test("사실로 확인된 불편 신고가 있으면 쌓인 신뢰(4단계)에서 내려오고, 조치 없음이면 그대로다", async () => {
    const { ev, a, b, c, d } = await four();
    const t = await admins();
    // a가 좋은 후기를 3건 받은 상태를 만든다 (후기는 7-1에서 확인했으므로 여기서는 기록으로 바로 만든다)
    const ids = [await f.appoint(b, a, ev, 0, 0), await f.appoint(c, a, ev, 0, 1), await f.appoint(d, a, ev, 1, 0)];
    for (const [i, w] of [b, c, d].entries()) {
      await f.prisma.review.create({ data: { appointmentId: ids[i], authorId: w.userId, targetId: a.userId, overall: 'GREAT', goodTags: [], badTags: [], again: 'NO' } });
    }
    expect((await get(a.token, '/me/trust')).body.level).toBe(4);

    const first = (await report(b, ids[0]).expect(201)).body.id as string;
    await post(t.rm1, `/admin/reports/${first}/claim`).expect(200);
    await post(t.rm1, `/admin/reports/${first}/resolve`, { action: 'NO_ACTION', reason: GOOD }).expect(200);
    expect((await get(a.token, '/me/trust')).body.level).toBe(4);

    const second = (await report(c, ids[1]).expect(201)).body.id as string;
    await post(t.rm1, `/admin/reports/${second}/claim`).expect(200);
    await post(t.rm1, `/admin/reports/${second}/resolve`, { action: 'WARN', reason: GOOD }).expect(200);
    // 확인된 신고가 있으면 바로 반영된다 (조회하기 전에도 단계가 바뀌어 있다)
    expect((await f.prisma.user.findUniqueOrThrow({ where: { id: a.userId } })).trustLevel).toBe(3);
    expect((await f.prisma.trustChange.findMany({ where: { userId: a.userId }, orderBy: { createdAt: 'asc' } })).map((x) => x.reason)).toEqual(['ATTENDANCE_VERIFIED', 'REVIEWS', 'REPORT_UPHELD']);
  });
});

describe("'안 나왔어요' 판단 (양쪽 도착 기록을 운영팀이 함께 본다)", () => {
  /** 약속(day)을 확정하고, partner만 도착한 채 15분이 지나 '안 나왔어요'를 누른 상태. 신고 id를 돌려줍니다. */
  async function noShow(absent: M, partner: M, apptId: string, day: 0 | 1) {
    const date = day === 0 ? '2026-12-12' : '2026-12-13';
    const prev = day === 0 ? '2026-12-11' : '2026-12-12';
    clock.current = kst(`${prev}T18:00:00`);
    for (const m of [absent, partner]) await post(m.token, `/appointments/${apptId}/confirm`).expect(200);
    clock.current = kst(`${date}T14:50:00`);
    await post(partner.token, `/appointments/${apptId}/arrive`).expect(200);
    clock.current = kst(`${date}T15:15:00`);
    await post(partner.token, `/appointments/${apptId}/no-show`).expect(200);
    return (await f.prisma.report.findFirstOrThrow({ where: { appointmentId: apptId } })).id;
  }

  test("'안 나왔어요'를 누르면 신고 대기열에 올라가고, 바로 노쇼로 정해지지 않는다", async () => {
    const { ev, a, b } = await four();
    const t = await admins();
    const id = await f.appoint(a, b, ev, 0, 0);
    const reportId = await noShow(a, b, id, 0);
    const row = await f.prisma.report.findUniqueOrThrow({ where: { id: reportId } });
    expect(row).toMatchObject({ category: 'NO_SHOW', status: 'QUEUED', priority: 'GENERAL', reporterId: b.userId, targetId: a.userId, upheld: null });
    const detail = (await get(t.rm1, `/admin/reports/${reportId}`).expect(200)).body;
    expect(detail).toMatchObject({
      category: 'NO_SHOW',
      reporter: { nickname: '테스트b', arrivedAt: kst('2026-12-12T14:50:00').toISOString() },
      target: { nickname: '테스트a', arrivedAt: null },
    });
    expect((await f.prisma.appointmentParticipant.findUniqueOrThrow({ where: { appointmentId_userId: { appointmentId: id, userId: a.userId } } })).noShowConfirmed).toBe(false);
    // 사용자는 이 분류를 직접 고를 수 없다
    await report(b, id, { category: 'NO_SHOW' }).expect(400);
  });

  test('조치 없음이면 노쇼로 확인되지 않고, 사실로 확인되면 노쇼로 기록되어 두 번째부터 신뢰 단계가 내려간다', async () => {
    const { ev, a, b, c } = await four();
    const t = await admins();
    const first = await f.appoint(a, b, ev, 0, 0);
    const second = await f.appoint(a, c, ev, 1, 0);
    expect((await get(a.token, '/me/trust')).body.level).toBe(3);

    const r1 = await noShow(a, b, first, 0);
    await post(t.rm1, `/admin/reports/${r1}/claim`).expect(200);
    await post(t.rm1, `/admin/reports/${r1}/resolve`, { action: 'NO_ACTION', reason: '늦게 도착한 것으로 확인' }).expect(200);
    expect((await f.prisma.appointmentParticipant.findUniqueOrThrow({ where: { appointmentId_userId: { appointmentId: first, userId: a.userId } } })).noShowConfirmed).toBe(false);

    const r2 = await noShow(a, c, second, 1);
    await post(t.rm1, `/admin/reports/${r2}/claim`).expect(200);
    await post(t.rm1, `/admin/reports/${r2}/resolve`, { action: 'RECORD_ONLY', reason: '도착 기록이 없음을 확인' }).expect(200);
    const part = await f.prisma.appointmentParticipant.findUniqueOrThrow({ where: { appointmentId_userId: { appointmentId: second, userId: a.userId } } });
    expect(part.noShowConfirmed).toBe(true);
    // 확인된 노쇼 1번만으로는 내려가지 않고, 노쇼 확인은 '불편 신고'로 세지 않는다
    expect((await get(a.token, '/me/trust')).body.level).toBe(3);

    // 확인된 노쇼가 한 번 더 있으면 최근 90일 안에 2번이라 한 단계 내려간다
    await f.prisma.appointmentParticipant.update({ where: { appointmentId_userId: { appointmentId: first, userId: a.userId } }, data: { noShowConfirmed: true } });
    expect((await get(a.token, '/me/trust')).body.level).toBe(2);
    expect((await f.prisma.trustChange.findMany({ where: { userId: a.userId }, orderBy: { createdAt: 'asc' } })).map((x) => x.reason)).toEqual(['ATTENDANCE_VERIFIED', 'RECENT_RECORDS']);
  });
});

describe('이용 정지 (제안 + 확정, 두 명 확인)', () => {
  async function proposed() {
    const { ev, a, b, c, d } = await four();
    const t = await admins();
    const { reportId, appointmentId } = await reported(a, b, ev, 0, 0);
    await post(t.rm1, `/admin/reports/${reportId}/claim`).expect(200);
    const res = await post(t.rm1, `/admin/reports/${reportId}/suspension-proposals`, { reason: '반복적인 위협이 확인됨' }).expect(201);
    return { ev, a, b, c, d, t, reportId, appointmentId, approvalId: res.body.approvalId as string };
  }

  test('신고 담당이 제안하고, 관리자만 확정한다. 서로 권한이 바뀌면 안 된다', async () => {
    const { ev, a, b } = await four();
    const t = await admins();
    const { reportId } = await reported(a, b, ev);
    await post(t.rm1, `/admin/reports/${reportId}/claim`).expect(200);
    // 권한표: 제안은 신고 담당만 (관리자·검수자·행사 담당 불가)
    await post(t.admin, `/admin/reports/${reportId}/suspension-proposals`, { reason: GOOD }).expect(403);
    await post(t.reviewer, `/admin/reports/${reportId}/suspension-proposals`, { reason: GOOD }).expect(403);
    await post(t.eventMgr, `/admin/reports/${reportId}/suspension-proposals`, { reason: GOOD }).expect(403);
    // 담당자가 아닌 신고 담당도, 사유가 없어도 안 된다
    expect((await post(t.rm2, `/admin/reports/${reportId}/suspension-proposals`, { reason: GOOD }).expect(403)).body.code).toBe('FORBIDDEN');
    expect((await post(t.rm1, `/admin/reports/${reportId}/suspension-proposals`, { reason: '짧음' }).expect(400)).body.code).toBe('REASON_REQUIRED');
    const res = await post(t.rm1, `/admin/reports/${reportId}/suspension-proposals`, { reason: GOOD }).expect(201);
    expect(res.body.status).toBe('SUSPENSION_PROPOSED');
    // 확정은 관리자만: 신고 담당(제안한 사람 포함)·검수자·행사 담당은 불가
    for (const token of [t.rm1, t.rm2, t.reviewer, t.eventMgr]) await post(token, `/admin/user-suspensions/${res.body.approvalId}/confirm`).expect(403);
    expect((await f.prisma.user.findUniqueOrThrow({ where: { id: b.userId } })).status).toBe('ACTIVE');
  });

  test('제안한 사람이 직접 확정할 수 없다 (서버 규칙)', async () => {
    const { approvalId, b } = await proposed();
    // 권한표를 거치지 않고 서비스로 직접 확정을 시도해도, 제안한 사람이면 거절한다
    const service = app.get(AdminReportsService);
    await expect(service.confirmSuspension(await adminId('rm1'), approvalId)).rejects.toMatchObject({ code: 'APPROVAL_INVALID', message: '제안한 사람이 직접 확정할 수 없어요.' });
    expect((await f.prisma.user.findUniqueOrThrow({ where: { id: b.userId } })).status).toBe('ACTIVE');
    expect((await f.prisma.adminApproval.findUniqueOrThrow({ where: { id: approvalId } })).status).toBe('PENDING');
  });

  test('다른 관리자가 확정하면 정지되고, 신고가 종결되며, 신고한 사람에게 결과가 간다', async () => {
    const { t, a, b, reportId, approvalId } = await proposed();
    const res = await post(t.admin, `/admin/user-suspensions/${approvalId}/confirm`).expect(200);
    expect(res.body).toEqual({ id: reportId, status: 'CLOSED', outcome: 'SUSPEND' });
    expect((await f.prisma.user.findUniqueOrThrow({ where: { id: b.userId } })).status).toBe('SUSPENDED');
    expect(await f.prisma.report.findUniqueOrThrow({ where: { id: reportId } })).toMatchObject({ status: 'CLOSED', upheld: true, outcome: 'SUSPEND' });
    expect(await f.prisma.adminApproval.findUniqueOrThrow({ where: { id: approvalId } })).toMatchObject({ status: 'CONFIRMED', proposedById: await adminId('rm1'), confirmedById: await adminId('adm1') });
    expect(await kinds(a)).toContain('REPORT_RESULT');
    // 한 번 확정한 제안은 다시 확정할 수 없다
    expect((await post(t.admin, `/admin/user-suspensions/${approvalId}/confirm`).expect(409)).body.code).toBe('APPROVAL_INVALID');
  });

  test('정지된 사람은 로그인할 수 없고 가지고 있던 로그인도 풀리며, 제안은 취소되고 약속은 끝나고, 후보에서도 사라진다', async () => {
    const { ev, a, b, c, d, t, approvalId, appointmentId } = await proposed();
    const toB = await f.propose(c, b, ev, 1, 0); // b가 받을 제안
    const fromB = await f.propose(b, d, ev, 1, 1); // b가 보낸 제안
    await post(t.admin, `/admin/user-suspensions/${approvalId}/confirm`).expect(200);

    await get(b.token, '/me').expect(401); // 이미 가진 로그인이 풀림
    const relogin = await http(app).post('/auth/identity').send({ verificationToken: fakeToken('b', '2000-01-01'), agreedTerms: ALL_TERMS }).expect(200);
    expect(relogin.body.outcome).toBe('ACCOUNT_UNAVAILABLE');
    expect(relogin.body.sessionToken).toBeUndefined();
    await http(app).post(`/events/${ev.id}/proposals`).set(auth(b.token)).send(f_body(ev, c.userId, 1, 0)).expect(401);

    for (const id of [toB, fromB]) expect((await f.prisma.proposal.findUniqueOrThrow({ where: { id } })).status).toBe('CANCELLED');
    // 약속은 끝나고, 상대에게는 이유 없이 취소로만 보인다
    const view = (await get(a.token, `/appointments/${appointmentId}`).expect(200)).body;
    expect(view).toMatchObject({ status: 'CANCELLED', end: { reason: 'CANCELLED', byMe: false, cancelReason: null } });
    expect(JSON.stringify(view)).not.toMatch(/정지|신고|SUSPEND/);
    const note = (await get(a.token, '/me/notifications')).body.items.find((n: { kind: string }) => n.kind === 'APPOINTMENT_CANCELLED');
    expect(note.body).not.toMatch(/정지|신고/);
    // 정지된 사람은 다른 사람의 후보 목록에도 나오지 않는다
    const cands = (await get(c.token, `/events/${ev.id}/candidates?shortTime=true&immersionPlus=true`).expect(200)).body.candidates as Array<{ userId: string }>;
    expect(cands.map((x) => x.userId)).not.toContain(b.userId);
    // 정지된 사람에게 임박 취소 기록은 남지 않는다
    expect((await f.prisma.appointmentParticipant.findUniqueOrThrow({ where: { appointmentId_userId: { appointmentId, userId: b.userId } } })).lateCancel).toBe(false);
  });

  test('관리자가 확정하지 않고 되돌리면 정지되지 않고 처리 중으로 돌아가며, 다른 조치를 고를 수 있다', async () => {
    const { t, b, reportId, approvalId } = await proposed();
    expect((await post(t.admin, `/admin/user-suspensions/${approvalId}/decline`, { reason: '짧음' }).expect(400)).body.code).toBe('REASON_REQUIRED');
    await post(t.rm1, `/admin/user-suspensions/${approvalId}/decline`, { reason: GOOD }).expect(403);
    await post(t.admin, `/admin/user-suspensions/${approvalId}/decline`, { reason: '근거가 부족해요' }).expect(200);
    expect((await f.prisma.user.findUniqueOrThrow({ where: { id: b.userId } })).status).toBe('ACTIVE');
    expect(await f.prisma.adminApproval.findUniqueOrThrow({ where: { id: approvalId } })).toMatchObject({ status: 'REJECTED', confirmedById: await adminId('adm1') });
    expect((await f.prisma.report.findUniqueOrThrow({ where: { id: reportId } })).status).toBe('IN_REVIEW');
    // 같은 담당자가 다른 조치를 하거나 다시 제안할 수 있다
    await post(t.rm1, `/admin/reports/${reportId}/resolve`, { action: 'WARN', reason: GOOD }).expect(200);
  });

  test('이미 정지된 계정에 대한 정지 확정은 거절한다', async () => {
    const { ev, a, b, c } = await four();
    const t = await admins();
    const first = await reported(a, b, ev, 0, 0);
    const second = await reported(c, b, ev, 1, 0);
    const approvals: string[] = [];
    for (const r of [first, second]) {
      await post(t.rm1, `/admin/reports/${r.reportId}/claim`).expect(200);
      approvals.push((await post(t.rm1, `/admin/reports/${r.reportId}/suspension-proposals`, { reason: GOOD }).expect(201)).body.approvalId);
    }
    await post(t.admin, `/admin/user-suspensions/${approvals[0]}/confirm`).expect(200);
    expect((await post(t.admin, `/admin/user-suspensions/${approvals[1]}/confirm`).expect(409)).body.code).toBe('REPORT_STATE');
  });

  test('제안·확정·되돌림이 모두 기록된다 (사유와 함께)', async () => {
    const { t, approvalId } = await proposed();
    await post(t.admin, `/admin/user-suspensions/${approvalId}/confirm`).expect(200);
    const rows = await f.prisma.auditLog.findMany({ where: { action: { startsWith: 'USER_SUSPEND' } }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => [r.action, r.actorId, r.reason])).toEqual([
      ['USER_SUSPEND_PROPOSE', await adminId('rm1'), '반복적인 위협이 확인됨'],
      ['USER_SUSPEND_CONFIRM', await adminId('adm1'), '반복적인 위협이 확인됨'],
    ]);
  });
});
