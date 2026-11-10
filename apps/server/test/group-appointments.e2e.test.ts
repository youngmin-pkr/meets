/**
 * 9-2a단계: 여러 명이 만나는 약속 (일행 2~4명 + 상대)
 * 전날 확인, 취소·빠지기, 도착·노쇼, 단체 채팅, 후기, 신고, 차단, 도움 요청, 안전 확인
 * 쪽(side): A = 제안을 보낸 쪽, B = 받은 쪽. 한 쪽이 비면 약속이 끝나고, 아니면 남은 사람끼리 계속합니다.
 */
import type { INestApplication } from '@nestjs/common';
import { AppointmentsService } from '../src/appointments/appointments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { fixtures } from './appointment-fixtures';
import { groupAppointment, kst } from './group-fixtures';

const cached = new WeakMap<object, ReturnType<typeof fixtures>>();
const fixturesFor = (a: INestApplication) => cached.get(a) ?? (cached.set(a, fixtures(a)), cached.get(a)!);
import { auth, http, resetDb, startApp, TestClock } from './helpers';

let app: INestApplication;
let prisma: PrismaService;
const clock = new TestClock();

beforeAll(async () => {
  app = await startApp(clock, false, () => 0.99);
  prisma = app.get(PrismaService);
});
beforeEach(async () => {
  clock.current = kst('2026-11-07T12:00:00');
  await resetDb(app);
  await prisma.policyValue.create({ data: { key: 'SESSION_TTL_DAYS', value: 365, effectiveFrom: kst('2026-01-01T00:00:00') } });
});
afterAll(async () => {
  await app.close();
});

type M = { token: string; userId: string };
const view = async (m: M, id: string) => (await http(app).get(`/appointments/${id}`).set(auth(m.token)).expect(200)).body;
const kinds = async (m: M, kind?: string) =>
  (await prisma.notification.findMany({ where: { userId: m.userId, ...(kind ? { kind: kind as never } : {}) } })).map((n) => n.kind);
const post = (m: M, path: string, body: object = {}) => http(app).post(path).set(auth(m.token)).send(body);
const row = (id: string) => prisma.appointment.findUniqueOrThrow({ where: { id } });
const left = (id: string, m: M) => prisma.appointmentParticipant.findUniqueOrThrow({ where: { appointmentId_userId: { appointmentId: id, userId: m.userId } } });

/** a1·a2 (A쪽 일행) + b (B쪽) */
const trio = (o: { confirm?: 'ALL' | 'NONE'; at?: string } = {}) => groupAppointment(app, clock, { a: ['a1', 'a2'], b: ['b'] }, o);

const fx = () => fixturesFor(app);
describe('보기', () => {
  it('함께하는 사람들이 보이고, 같은 쪽이 구분된다', async () => {
    const { id, A, B } = await trio();
    const a1 = await view(A[0], id);
    // 내가 만나는 상대 쪽이 먼저, 그다음 같은 일행
    expect(a1.companions.map((c: { userId: string; sameSide: boolean }) => [c.userId, c.sameSide])).toEqual([[B[0].userId, false], [A[1].userId, true]]);
    expect(a1.counterpart.userId).toBe(B[0].userId);
    const b = await view(B[0], id);
    expect(b.companions.map((c: { userId: string }) => c.userId).sort()).toEqual([A[0].userId, A[1].userId].sort());
    expect(b.companions.every((c: { sameSide: boolean }) => !c.sameSide)).toBe(true);
  });

  it('약속에 없는 사람은 볼 수 없다', async () => {
    const { id } = await trio();
    const outsider = await fx().member('x1');
    await http(app).get(`/appointments/${id}`).set(auth(outsider.token)).expect(404);
  });
});

describe('전날 확인', () => {
  it('전원이 확인해야 확정되고, 확정되면 나머지 모두에게 알림이 간다', async () => {
    const { id, A, B } = await trio({ at: '2026-12-11T18:00:00' });
    await post(A[0], `/appointments/${id}/confirm`).expect(200);
    await post(B[0], `/appointments/${id}/confirm`).expect(200);
    expect((await row(id)).status).toBe('PENDING_CONFIRM');
    expect((await view(A[1], id)).confirm).toMatchObject({ mine: false, theirs: true }); // 나만 남음
    await post(A[1], `/appointments/${id}/confirm`).expect(200);
    expect((await row(id)).status).toBe('CONFIRMED');
    expect(await kinds(A[0], 'APPOINTMENT_CONFIRMED')).toHaveLength(1);
    expect(await kinds(B[0], 'APPOINTMENT_CONFIRMED')).toHaveLength(1);
    expect((await view(A[0], id)).confirm.theirs).toBe(true);
  });

  it('마감까지 확인하지 않은 사람만 빠지고, 양쪽에 확인한 사람이 남으면 확정된다', async () => {
    const { id, A, B } = await trio({ at: '2026-12-11T18:00:00' });
    await post(A[0], `/appointments/${id}/confirm`).expect(200);
    await post(B[0], `/appointments/${id}/confirm`).expect(200);
    clock.current = kst('2026-12-12T15:00:00');
    const a1 = await view(A[0], id);
    expect(a1.status).toBe('CONFIRMED');
    expect(a1.companions.map((c: { userId: string }) => c.userId)).toEqual([B[0].userId]); // a2는 빠짐
    expect(await left(id, A[1])).toMatchObject({ leftReason: 'NO_CONFIRM', noResponse: true });
    expect(await kinds(A[1], 'NO_CONFIRM_SELF')).toHaveLength(1);
    expect(await kinds(B[0], 'APPOINTMENT_MEMBER_LEFT')).toHaveLength(1);
    // 빠진 사람에게는 끝난 약속으로 보인다
    const gone = await view(A[1], id);
    expect(gone).toMatchObject({ status: 'CANCELLED', end: { reason: 'NO_CONFIRM', byMe: true }, actions: { confirm: false, cancel: false, arrive: false } });
    await post(A[1], `/appointments/${id}/confirm`).expect(409);
  });

  it('한 쪽에 확인한 사람이 한 명도 없으면 약속이 취소된다', async () => {
    const { id, A, B } = await trio({ at: '2026-12-11T18:00:00' });
    await post(A[0], `/appointments/${id}/confirm`).expect(200);
    await post(A[1], `/appointments/${id}/confirm`).expect(200);
    clock.current = kst('2026-12-12T15:00:00');
    expect((await view(A[0], id)).status).toBe('CANCELLED');
    expect((await row(id)).endReason).toBe('NO_CONFIRM');
    expect(await kinds(B[0], 'NO_CONFIRM_SELF')).toHaveLength(1);
    expect(await kinds(A[0], 'NO_CONFIRM_PARTNER')).toHaveLength(1);
  });
});

describe('취소와 빠지기', () => {
  it('확정 대기에서 한 명이 빠지고 남은 사람이 모두 이미 확인했으면 바로 확정된다', async () => {
    const { id, A, B } = await trio({ at: '2026-12-11T18:00:00' });
    await post(A[0], `/appointments/${id}/confirm`).expect(200);
    await post(B[0], `/appointments/${id}/confirm`).expect(200);
    await post(A[1], `/appointments/${id}/cancel`).expect(200);
    expect((await row(id)).status).toBe('CONFIRMED');
    expect(await kinds(B[0], 'APPOINTMENT_MEMBER_LEFT')).toHaveLength(1);
    expect(await kinds(A[0], 'APPOINTMENT_MEMBER_LEFT')).toHaveLength(1);
  });

  it('확정된 약속에서 일행이 빠지면 상대 쪽이 다시 확인한다 (다시 정하기, 사유: 인원 변경)', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-11T20:00:00' });
    await post(A[1], `/appointments/${id}/cancel`, { reason: 'SICK' }).expect(200);
    const r = await row(id);
    expect(r).toMatchObject({ status: 'RESCHEDULING', rescheduleReason: 'MEMBERS_CHANGED' });
    const b = await view(B[0], id);
    expect(b.reschedule).toMatchObject({ reason: 'MEMBERS_CHANGED', mine: false, theirs: true });
    expect(b.reschedule.newSchedule).toMatchObject({ date: '2026-12-12', startTime: '18:00' });
    expect(b.actions.reconfirm).toBe(true);
    // 빠진 사람과 같은 쪽 사람은 이미 아는 일이라 다시 확인할 필요가 없다
    expect((await view(A[0], id)).actions.reconfirm).toBe(false);
    const ask = (await prisma.notification.findMany({ where: { userId: B[0].userId, kind: 'APPOINTMENT_MEMBER_LEFT' } }))[0];
    expect(ask.body).toContain('다시 확인');
    const note = (await prisma.notification.findMany({ where: { userId: A[0].userId, kind: 'APPOINTMENT_MEMBER_LEFT' } }))[0];
    expect(note.body).not.toContain('다시 확인');
    await post(B[0], `/appointments/${id}/confirm`).expect(200);
    expect((await row(id)).status).toBe('CONFIRMED');
  });

  it('상대가 다시 확인하지 않으면 보류된다 (취소가 아니고 신뢰에 영향 없음)', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-11T20:00:00' });
    await post(A[1], `/appointments/${id}/cancel`).expect(200);
    clock.current = kst('2026-12-12T18:00:00'); // 약속 시작까지 다시 확인하지 않음
    expect((await view(B[0], id)).status).toBe('ON_HOLD');
    expect(await left(id, B[0])).toMatchObject({ noResponse: false });
  });

  it('약속 24시간 안에 빠지면 임박 취소로 기록된다', async () => {
    const { id, A } = await trio({ confirm: 'ALL', at: '2026-12-11T20:00:00' }); // 12-12 18:00의 24시간 전은 12-11 18:00 → 이미 지남
    await post(A[1], `/appointments/${id}/cancel`).expect(200);
    expect(await left(id, A[1])).toMatchObject({ lateCancel: true, leftReason: 'CANCEL' });
  });

  it('약속 24시간보다 일찍 빠지면 임박 취소가 아니다', async () => {
    const g = await trio({ confirm: 'NONE', at: '2026-11-10T12:00:00' });
    await post(g.A[1], `/appointments/${g.id}/cancel`).expect(200);
    expect(await left(g.id, g.A[1])).toMatchObject({ lateCancel: false });
  });

  it('받는 쪽이 한 명뿐이라 그 사람이 빠지면 약속이 취소되고 일행 모두에게 알린다', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-11T20:00:00' });
    await post(B[0], `/appointments/${id}/cancel`, { reason: 'SICK' }).expect(200);
    expect((await row(id)).status).toBe('CANCELLED');
    expect(await kinds(A[0], 'APPOINTMENT_CANCELLED')).toHaveLength(1);
    expect(await kinds(A[1], 'APPOINTMENT_CANCELLED')).toHaveLength(1);
    expect((await view(A[0], id)).end).toMatchObject({ reason: 'CANCELLED', byMe: false, cancelReason: '몸이 안 좋아요' });
  });

  it('일행이 모두 빠지면 약속이 취소된다', async () => {
    const { id, A, B } = await trio({ confirm: 'NONE', at: '2026-11-10T12:00:00' });
    await post(A[1], `/appointments/${id}/cancel`).expect(200);
    await post(A[0], `/appointments/${id}/cancel`).expect(200);
    expect((await row(id)).status).toBe('CANCELLED');
    expect(await kinds(B[0], 'APPOINTMENT_CANCELLED')).toHaveLength(1);
  });

  it('빠진 사람은 다시 빠지거나 확인할 수 없고, 빠진 뒤에는 시간이 겹치는 약속을 새로 만들 수 있다', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-11T20:00:00' });
    const service = app.get(AppointmentsService);
    const range = { startsAt: kst('2026-12-12T18:00:00'), endsAt: kst('2026-12-12T20:30:00') };
    expect(await service.findOverlap(A[1].userId, range)).not.toBeNull();
    await post(A[1], `/appointments/${id}/cancel`).expect(200);
    await post(A[1], `/appointments/${id}/cancel`).expect(409);
    expect(await service.findOverlap(A[1].userId, range)).toBeNull();
    expect(await service.findOverlap(A[0].userId, range)).not.toBeNull();
    void B;
  });

  it('1:1 약속은 한 명이 취소하면 그대로 취소된다', async () => {
    const g = await groupAppointment(app, clock, { a: ['p1'], b: ['p2'] }, { confirm: 'ALL', at: '2026-12-11T20:00:00' });
    await post(g.A[0], `/appointments/${g.id}/cancel`).expect(200);
    expect((await row(g.id)).status).toBe('CANCELLED');
    expect((await view(g.B[0], g.id)).end).toMatchObject({ reason: 'CANCELLED', byMe: false });
  });
});

describe('도착과 노쇼', () => {
  const arrive = (m: M, id: string) => post(m, `/appointments/${id}/arrive`).expect(200);

  it('도착하면 나머지 모두에게 알리고, 상대의 도착은 가장 먼저 도착한 사람 기준으로 보인다', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-12T17:30:00' });
    await arrive(A[0], id);
    expect(await kinds(A[1], 'PARTNER_ARRIVED')).toHaveLength(1);
    expect(await kinds(B[0], 'PARTNER_ARRIVED')).toHaveLength(1);
    expect((await view(B[0], id)).arrival.theirs).not.toBeNull();
    expect((await view(A[1], id)).arrival.theirs).not.toBeNull();
  });

  it('일부만 안 왔으면 안 온 사람만 신고되고 만남은 계속된다. 같은 사람이 다시 누를 수는 없다', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-12T17:30:00' });
    await arrive(A[0], id);
    await arrive(B[0], id);
    clock.current = kst('2026-12-12T18:20:00');
    const v = await view(A[0], id);
    expect(v).toMatchObject({ status: 'IN_PROGRESS', actions: { reportNoShow: true } });
    await post(A[0], `/appointments/${id}/no-show`).expect(200);
    expect((await row(id)).status).toBe('IN_PROGRESS');
    const reports = await prisma.report.findMany({ where: { appointmentId: id } });
    expect(reports.map((r) => [r.category, r.targetId, r.reporterId])).toEqual([['NO_SHOW', A[1].userId, A[0].userId]]);
    expect((await view(A[0], id)).actions.reportNoShow).toBe(false);
    await post(A[0], `/appointments/${id}/no-show`).expect(409);
    // 다른 도착한 사람도 따로 신고할 수 있다
    await post(B[0], `/appointments/${id}/no-show`).expect(200);
    expect(await prisma.report.count({ where: { appointmentId: id, targetId: A[1].userId } })).toBe(2);
  });

  it('다른 사람이 아무도 도착하지 않았으면 만남이 끝나고 안 온 사람 모두가 신고된다', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-12T17:30:00' });
    await arrive(A[0], id);
    clock.current = kst('2026-12-12T18:20:00');
    await post(A[0], `/appointments/${id}/no-show`).expect(200);
    expect(await row(id)).toMatchObject({ status: 'ENDED_EARLY', endReason: 'NO_SHOW' });
    const targets = (await prisma.report.findMany({ where: { appointmentId: id } })).map((r) => r.targetId).sort();
    expect(targets).toEqual([A[1].userId, B[0].userId].sort());
    expect(await kinds(B[0], 'APPOINTMENT_ENDED_EARLY')).toHaveLength(1);
  });

  it('모두 도착했으면 누를 수 없다', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-12T17:30:00' });
    for (const m of [A[0], A[1], B[0]]) await arrive(m, id);
    clock.current = kst('2026-12-12T18:20:00');
    expect((await view(A[0], id)).actions.reportNoShow).toBe(false);
    await post(A[0], `/appointments/${id}/no-show`).expect(409);
  });
});

describe('단체 채팅', () => {
  it('모두 같은 방에서 대화하고, 보낸 사람 별명이 보이며, 연락처는 보내기 전에 멈춘다', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-12T12:00:00' });
    await post(A[0], `/appointments/${id}/chat`, { body: '안녕하세요!' }).expect(201);
    const seen = (await http(app).get(`/appointments/${id}/chat`).set(auth(B[0].token)).expect(200)).body;
    expect(seen.companions.map((c: { userId: string }) => c.userId)).toEqual([A[0].userId, A[1].userId]);
    const text = seen.messages.find((m: { kind: string }) => m.kind === 'TEXT');
    expect(text).toMatchObject({ body: '안녕하세요!', mine: false, senderNickname: '테스트a1' });
    expect((await http(app).get(`/appointments/${id}/chat`).set(auth(A[1].token)).expect(200)).body.messages.some((m: { body: string }) => m.body === '안녕하세요!')).toBe(true);
    const stop = await post(B[0], `/appointments/${id}/chat`, { body: '카톡 아이디는 abc123 이에요 010-1234-5678' }).expect(409);
    expect(stop.body.code).toBe('CONTACT_DETECTED');
    // 안 읽은 메시지는 사람마다 따로 센다
    expect((await view(A[1], id)).unreadMessages).toBe(0); // 위에서 읽음
    await post(B[0], `/appointments/${id}/chat`, { body: '저 먼저 도착해요' }).expect(201);
    expect((await view(A[1], id)).unreadMessages).toBe(1);
    expect((await view(A[0], id)).unreadMessages).toBe(1);
  });

  it('약속에서 빠진 사람은 더 이상 채팅을 읽거나 보낼 수 없고, 목록에서도 사라진다', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-12T12:00:00' });
    await post(A[1], `/appointments/${id}/cancel`).expect(200);
    await http(app).get(`/appointments/${id}/chat`).set(auth(A[1].token)).expect(404);
    await post(A[1], `/appointments/${id}/chat`, { body: '안녕' }).expect(404);
    const list = (await http(app).get('/me/chats').set(auth(A[1].token)).expect(200)).body;
    expect(list.find((c: { appointmentId: string }) => c.appointmentId === id)).toBeUndefined();
    const mine = (await http(app).get('/me/chats').set(auth(B[0].token)).expect(200)).body.find((c: { appointmentId: string }) => c.appointmentId === id);
    expect(mine.companions.map((c: { userId: string }) => c.userId)).toEqual([A[0].userId]);
  });
});

describe('후기', () => {
  const ended = async () => {
    const g = await trio({ confirm: 'ALL', at: '2026-12-12T20:30:00' });
    expect((await view(g.A[0], g.id)).status).toBe('ENDED');
    return g;
  };
  const review = (m: M, id: string, o: object = {}) =>
    post(m, `/appointments/${id}/review`, { overall: 'GREAT', goodTags: ['PUNCTUAL'], badTags: [], again: 'YES', hideTarget: false, ...o });

  it('후기 요청은 상대 쪽 사람들 이름으로 가고, 남길 상대가 사람마다 보인다', async () => {
    const { id, A, B } = await ended();
    const req = (await prisma.notification.findMany({ where: { userId: B[0].userId, kind: 'REVIEW_REQUEST' } }))[0];
    expect(req.body).toMatch(/테스트a\d님 외 1명/);
    expect((await view(B[0], id)).review.targets.map((t: { userId: string }) => t.userId).sort()).toEqual([A[0].userId, A[1].userId].sort());
    expect((await view(A[0], id)).review.targets.map((t: { userId: string }) => t.userId)).toEqual([B[0].userId]); // 같은 일행은 없음
  });

  it('받는 사람은 일행원 각각에게 따로 남기고, 누구인지 알려 주어야 한다. 다 남기면 완료', async () => {
    const { id, A, B } = await ended();
    const none = await review(B[0], id).expect(400);
    expect(none.body.code).toBe('REVIEW_INVALID');
    await review(B[0], id, { targetId: A[0].userId }).expect(201);
    expect((await view(B[0], id)).review).toMatchObject({ canWrite: true, done: false });
    await review(B[0], id, { targetId: A[0].userId }).expect(409); // 같은 사람에게 두 번은 안 됨
    await review(B[0], id, { targetId: A[1].userId, again: 'MAYBE' }).expect(201);
    expect((await view(B[0], id)).review).toMatchObject({ canWrite: false, done: true, targets: [] });
    expect(await prisma.review.count({ where: { appointmentId: id, authorId: B[0].userId } })).toBe(2);
  });

  it('일행원끼리·약속에서 빠진 사람과는 후기를 남길 수 없다', async () => {
    const g = await trio({ confirm: 'ALL', at: '2026-12-11T20:00:00' });
    await post(g.A[1], `/appointments/${g.id}/cancel`).expect(200);
    await post(g.B[0], `/appointments/${g.id}/confirm`).expect(200);
    clock.current = kst('2026-12-12T20:30:00');
    await view(g.A[0], g.id);
    await review(g.A[0], g.id, { targetId: g.A[1].userId }).expect(400); // 같은 쪽(빠진 일행)
    await review(g.B[0], g.id, { targetId: g.A[1].userId }).expect(400); // 빠진 사람
    await review(g.B[0], g.id, { targetId: g.A[0].userId }).expect(201);
    await review(g.A[1], g.id).expect(404); // 빠진 사람은 쓸 수 없음
  });

  it('서로 또 같이 가고 싶으면 알리지만, 여러 명이 만난 약속의 채팅은 연장되지 않는다. 다음에는 서로 먼저 보인다', async () => {
    const { id, ev, A, B } = await ended();
    await review(A[0], id).expect(201);
    const res = await review(B[0], id, { targetId: A[0].userId }).expect(201);
    expect(res.body.mutual).toBe(true);
    expect((await row(id)).chatExtended).toBe(false);
    const note = (await prisma.notification.findMany({ where: { userId: A[0].userId, kind: 'REVIEW_MUTUAL_AGAIN' } }))[0];
    expect(note.body).not.toContain('채팅도');
    expect(await kinds(A[1], 'REVIEW_MUTUAL_AGAIN')).toHaveLength(0); // 한 쌍에게만
    // 후보 목록에서 서로 먼저 보임
    const mine = (await http(app).get(`/events/${ev.id}/candidates`).set(auth(B[0].token)).expect(200)).body.candidates;
    expect(mine.find((c: { userId: string }) => c.userId === A[0].userId)?.reunion).toBe(true);
    expect(mine.find((c: { userId: string }) => c.userId === A[1].userId)?.reunion).toBe(false);
  });

  it('1:1 약속은 그대로: 서로 YES면 채팅이 계속 열린다', async () => {
    const g = await groupAppointment(app, clock, { a: ['p1'], b: ['p2'] }, { confirm: 'ALL', at: '2026-12-12T20:30:00' });
    await view(g.A[0], g.id);
    await review(g.A[0], g.id).expect(201);
    await review(g.B[0], g.id).expect(201);
    expect((await row(g.id)).chatExtended).toBe(true);
  });
});

describe('신고와 차단', () => {
  const report = (m: M, id: string, o: object = {}) => post(m, '/reports', { appointmentId: id, category: 'OTHER', alsoBlock: false, ...o });

  it('여러 명이 만난 약속에서는 누구를 신고하는지 알려야 하고, 사람마다 따로 신고한다', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-12T21:00:00' });
    expect((await report(B[0], id).expect(400)).body.code).toBe('REPORT_INVALID');
    await report(B[0], id, { targetId: A[0].userId }).expect(201);
    await report(B[0], id, { targetId: A[0].userId }).expect(409); // 같은 사람은 한 번만
    await report(B[0], id, { targetId: A[1].userId }).expect(201); // 다른 사람은 따로
    await report(B[0], id, { targetId: '00000000-0000-4000-8000-000000000000' }).expect(400);
    expect(await prisma.report.count({ where: { appointmentId: id, reporterId: B[0].userId } })).toBe(2);
  });

  it('신고하면서 차단하면 신고한 그 사람만 차단된다', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-12T21:00:00' });
    await report(B[0], id, { targetId: A[0].userId, alsoBlock: true }).expect(201);
    expect(await prisma.block.count({ where: { blockerId: B[0].userId } })).toBe(1);
    expect((await prisma.block.findFirstOrThrow({ where: { blockerId: B[0].userId } })).blockedId).toBe(A[0].userId);
  });

  it('차단하면 차단한 사람이 약속에서 빠진다. 일행이 남아 있으면 약속은 계속된다', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-12T18:30:00' }); // 만남 중
    await view(A[0], id); // 시간이 되어 만남 중으로 바뀜
    await post(A[0], '/blocks/from-chat', { appointmentId: id }).expect(400); // 누구인지 필요
    await post(A[0], '/blocks/from-chat', { appointmentId: id, targetId: B[0].userId }).expect(200);
    expect(await left(id, A[0])).toMatchObject({ leftReason: 'BLOCK', lateCancel: false });
    expect((await row(id)).status).toBe('IN_PROGRESS');
    expect(await kinds(B[0], 'APPOINTMENT_CANCELLED')).toHaveLength(0);
    expect(await kinds(B[0], 'APPOINTMENT_MEMBER_LEFT')).toHaveLength(1);
    await http(app).get(`/appointments/${id}/chat`).set(auth(A[0].token)).expect(404);
  });

  it('받는 쪽이 한 명뿐이라 그 사람이 차단하면 약속이 끝난다 (만남 중이면 중간 종료, 이유는 보이지 않음)', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-12T18:30:00' });
    await view(B[0], id);
    await post(B[0], '/blocks/from-chat', { appointmentId: id, targetId: A[0].userId }).expect(200);
    expect((await row(id)).status).toBe('ENDED_EARLY');
    expect((await view(A[1], id)).end).toMatchObject({ reason: 'CANCELLED', byMe: false });
    const note = (await prisma.notification.findMany({ where: { userId: A[1].userId, kind: 'APPOINTMENT_CANCELLED' } }))[0];
    expect(note.body).not.toMatch(/차단|신고|도움/);
  });
});

describe('도움 요청 (벗어나고 싶어요)', () => {
  it('일행이 있으면 누른 사람만 빠지고 약속은 계속된다. 신고는 상대 쪽 사람에게만 접수된다', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-12T18:30:00' });
    expect((await post(A[0], `/appointments/${id}/help`).expect(200)).body).toMatchObject({ ended: true, reported: true });
    expect(await left(id, A[0])).toMatchObject({ leftReason: 'SAFETY' });
    expect((await row(id)).status).toBe('IN_PROGRESS');
    const reports = await prisma.report.findMany({ where: { appointmentId: id } });
    expect(reports.map((r) => [r.category, r.priority, r.targetId])).toEqual([['HELP_REQUEST', 'HELP', B[0].userId]]);
    // 남은 사람에게는 이유 없이 빠졌다고만
    for (const m of [A[1], B[0]]) {
      const note = (await prisma.notification.findMany({ where: { userId: m.userId, kind: 'APPOINTMENT_MEMBER_LEFT' } }))[0];
      expect(note.body).not.toMatch(/도움|벗어|신고|HELP/);
    }
    await http(app).get(`/appointments/${id}/chat`).set(auth(A[0].token)).expect(404);
    await post(A[0], `/appointments/${id}/help`).expect(409);
    expect((await view(A[0], id)).status).toBe('ENDED_EARLY');
  });

  it('받는 쪽이 한 명뿐이라 그 사람이 누르면 약속이 끝나고 일행 모두가 신고 대상이 된다', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-12T18:30:00' });
    await post(B[0], `/appointments/${id}/help`).expect(200);
    expect(await row(id)).toMatchObject({ status: 'ENDED_EARLY', endReason: 'SAFETY' });
    const reports = await prisma.report.findMany({ where: { appointmentId: id } });
    expect(reports.map((r) => r.targetId).sort()).toEqual([A[0].userId, A[1].userId].sort());
    expect(reports.every((r) => r.priority === 'HELP')).toBe(true);
    expect((await view(A[0], id)).end).toMatchObject({ reason: 'CANCELLED', byMe: false });
  });

  it('1:1은 지금처럼 약속이 끝난다', async () => {
    const g = await groupAppointment(app, clock, { a: ['p1'], b: ['p2'] }, { confirm: 'ALL', at: '2026-12-12T18:30:00' });
    await post(g.A[0], `/appointments/${g.id}/help`).expect(200);
    expect((await row(g.id)).status).toBe('ENDED_EARLY');
  });

  it('도착 버튼이 열린 뒤 만남 시작 전에도 쓸 수 있고, 확정된 약속이면 상대가 다시 확인한다', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-12T17:30:00' });
    await post(A[1], `/appointments/${id}/help`).expect(200);
    expect(await row(id)).toMatchObject({ status: 'RESCHEDULING', rescheduleReason: 'MEMBERS_CHANGED' });
    expect((await view(B[0], id)).actions.reconfirm).toBe(true);
  });
});

describe('안전 확인', () => {
  it('약속에서 빠진 사람에게는 묻지 않고, 남은 사람에게는 각각 묻는다', async () => {
    const { id, A, B } = await trio({ confirm: 'ALL', at: '2026-12-12T18:30:00' });
    await post(A[1], `/appointments/${id}/cancel`).expect(409); // 시작 뒤에는 취소 불가
    await post(A[1], `/appointments/${id}/help`).expect(200); // 도움 요청으로 빠짐
    clock.current = kst('2026-12-12T19:05:00');
    expect((await view(A[0], id)).safety.pendingCheck).not.toBeNull();
    expect((await view(B[0], id)).safety.pendingCheck).not.toBeNull();
    expect(await prisma.safetyCheck.count({ where: { appointmentId: id, userId: A[1].userId, seq: 1 } })).toBe(0);
  });

  it('믿는 사람 링크에는 함께하는 사람들 별명이 모두 보인다', async () => {
    const { id, A } = await trio({ confirm: 'ALL', at: '2026-12-12T17:30:00' });
    const link = (await post(A[0], `/appointments/${id}/share-links`, { showStatus: true }).expect(201)).body;
    const shared = (await http(app).get(`/share/${link.url.split('/share/')[1]}`).expect(200)).body;
    expect(shared.companion).toBe('테스트b 외 1명');
  });
});

describe('행사 취소', () => {
  it('행사가 취소되면 약속은 모두 자동 종료되고 빠지지 않은 사람 모두에게 알린다', async () => {
    const { id, ev, A, B } = await trio({ confirm: 'ALL', at: '2026-12-12T10:00:00' });
    await post(A[1], `/appointments/${id}/cancel`).expect(200);
    await app.get(AppointmentsService).settle();
    await prisma.$transaction((tx) => app.get(AppointmentsService).onEventCancelled(tx, ev.id));
    expect((await row(id)).status).toBe('AUTO_ENDED');
    expect(await kinds(A[0], 'EVENT_CANCELLED')).toHaveLength(1);
    expect(await kinds(B[0], 'EVENT_CANCELLED')).toHaveLength(1);
    expect(await kinds(A[1], 'EVENT_CANCELLED')).toHaveLength(0); // 이미 빠진 사람
  });
});
