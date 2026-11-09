/**
 * 7-1단계: 후기 · 신뢰 단계 · 차단 · 신고 접수
 * 기준 행사: 2026-12-12(토)·12-13(일), 구간 '굿즈 줄' 15:00~17:00, '공연' 18:00~20:30
 */
import { Logger, type INestApplication } from '@nestjs/common';
import { adminToken, auth, http, resetDb, startApp, TestClock } from './helpers';
import { finishAppointment, fixtures, kst } from './appointment-fixtures';

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
  // 시계를 한 달 넘게 돌리므로 이 테스트에서만 로그인 유지 기간을 늘립니다.
  await f.prisma.policyValue.create({ data: { key: 'SESSION_TTL_DAYS', value: 365, effectiveFrom: kst('2026-01-01T00:00:00') } });
});

afterAll(async () => {
  await app.close();
});

type M = { token: string; userId: string };
const review = (m: M, id: string, body: Record<string, unknown> = {}) =>
  http(app)
    .post(`/appointments/${id}/review`)
    .set(auth(m.token))
    .send({ overall: 'GREAT', goodTags: ['TEMPO_MATCH'], badTags: [], again: 'YES', hideTarget: false, ...body });
const appt = (m: M, id: string) => http(app).get(`/appointments/${id}`).set(auth(m.token));
const kinds = async (m: M) => ((await http(app).get('/me/notifications').set(auth(m.token)).expect(200)).body.items as Array<{ kind: string }>).map((n) => n.kind);
const candidates = async (m: M, evId: string) =>
  (await http(app).get(`/events/${evId}/candidates?shortTime=true&immersionPlus=true`).set(auth(m.token)).expect(200)).body.candidates as Array<{ userId: string; trusted: boolean; reunion: boolean }>;

/** a·b가 만나서 끝난 약속 */
async function ended(people = ['a', 'b']) {
  const { ev, members } = await f.setup(people);
  const [a, b] = members;
  const id = await f.appoint(a, b, ev);
  await finishAppointment(app, clock, id, [a, b]);
  return { ev, members, a, b, id };
}

describe('후기', () => {
  test('만남이 끝나면 양쪽에 후기 요청이 가고, 약속에는 후기를 남길 수 있다고 보인다', async () => {
    const { a, b, id } = await ended();
    expect(await kinds(a)).toContain('REVIEW_REQUEST');
    expect(await kinds(b)).toContain('REVIEW_REQUEST');
    const body = (await appt(a, id).expect(200)).body;
    expect(body.status).toBe('ENDED');
    expect(body.review).toEqual({ canWrite: true, done: false, deadline: kst('2026-12-19T17:00:00').toISOString() });
    const note = (await http(app).get('/me/notifications').set(auth(a.token))).body.items.find((n: { kind: string }) => n.kind === 'REVIEW_REQUEST');
    expect(note.body).toContain('12.19 (토) 17:00까지 후기를 남겨 주세요');
  });

  test('행사가 취소됐거나 중간에 끝난 약속에는 후기 요청이 가지 않고 남길 수도 없다', async () => {
    const { ev, members } = await f.setup(['a', 'b', 'c', 'd']);
    const [a, b, c, d] = members;
    // 중간 종료(노쇼): c·d
    const early = await f.appoint(c, d, ev, 0, 0);
    clock.current = kst('2026-12-11T18:00:00');
    for (const m of [c, d]) await http(app).post(`/appointments/${early}/confirm`).set(auth(m.token)).send({}).expect(200);
    clock.current = kst('2026-12-12T14:50:00');
    await http(app).post(`/appointments/${early}/arrive`).set(auth(c.token)).send({}).expect(200);
    clock.current = kst('2026-12-12T15:15:00');
    await http(app).post(`/appointments/${early}/no-show`).set(auth(c.token)).send({}).expect(200);
    expect(await kinds(c)).not.toContain('REVIEW_REQUEST');
    expect((await appt(c, early)).body.review.canWrite).toBe(false);
    const res = await review(c, early).expect(409);
    expect(res.body.code).toBe('REVIEW_NOT_ALLOWED');

    // 행사 취소: a·b
    clock.current = kst('2026-11-07T12:00:00');
    const auto = await f.appoint(a, b, ev, 1, 0);
    const manager = await adminToken(app, 'EVENT_MANAGER', 'trustmanager');
    const p = await http(app).post(`/admin/events/${ev.id}/cancel-proposals`).set(auth(manager)).send({ reason: '취소 공지' }).expect(201);
    await http(app).post(`/admin/event-cancellations/${p.body.id}/confirm`).set(auth(await adminToken(app, 'ADMIN', 'trustadmin'))).expect(200);
    expect(await kinds(a)).not.toContain('REVIEW_REQUEST');
    expect((await review(a, auto).expect(409)).body.code).toBe('REVIEW_NOT_ALLOWED');
  });

  test('약속이 끝나기 전에는 남길 수 없다', async () => {
    const { ev, members: [a, b] } = await f.setup();
    const id = await f.appoint(a, b, ev);
    expect((await review(a, id).expect(409)).body.code).toBe('REVIEW_NOT_ALLOWED');
  });

  test('약속 당사자만, 한 번만, 끝나고 7일 안에만 남길 수 있다', async () => {
    const { ev, members } = await f.setup(['a', 'b', 'c']);
    const [a, b, c] = members;
    const id = await f.appoint(a, b, ev);
    await finishAppointment(app, clock, id, [a, b]);
    await review(c, id).expect(404);
    await http(app).post(`/appointments/${id}/review`).send({}).expect(401);

    await review(a, id).expect(201);
    expect((await review(a, id).expect(409)).body.code).toBe('REVIEW_EXISTS');
    expect((await appt(a, id)).body.review).toMatchObject({ canWrite: false, done: true });
    expect((await appt(b, id)).body.review).toMatchObject({ canWrite: true, done: false });

    clock.current = kst('2026-12-19T17:00:00');
    const late = await review(b, id).expect(409);
    expect(late.body).toMatchObject({ code: 'REVIEW_NOT_ALLOWED', detail: { days: 7 } });
    expect((await appt(b, id)).body.review.canWrite).toBe(false);
  });

  test('모르는 칩이나 같은 칩 두 번은 받지 않는다', async () => {
    const { a, id } = await ended();
    expect((await review(a, id, { goodTags: ['TEMPO_MATCH', 'TEMPO_MATCH'] }).expect(400)).body.code).toBe('REVIEW_INVALID');
    expect((await review(a, id, { badTags: ['PUNCTUAL'] }).expect(400)).body.code).toBe('REVIEW_INVALID');
    await review(a, id, { overall: 'AWESOME' }).expect(400);
    // 칩은 건너뛰어도 된다
    await review(a, id, { goodTags: [], badTags: [] }).expect(201);
  });

  test('후기 내용은 상대에게 어떤 길로도 보이지 않는다', async () => {
    const { a, b, id } = await ended();
    await review(a, id, { overall: 'POOR', goodTags: [], badTags: ['LATE', 'HARD_TO_REACH'], again: 'NO' }).expect(201);
    // 읽는 주소가 없다
    await http(app).get(`/appointments/${id}/review`).set(auth(b.token)).expect(404);
    await http(app).get('/me/reviews').set(auth(b.token)).expect(404);
    // 약속·알림·채팅·후보·신뢰 응답 어디에도 후기 내용이 없다
    const seen = JSON.stringify([
      (await appt(b, id)).body,
      (await http(app).get('/me/notifications').set(auth(b.token))).body,
      (await http(app).get(`/appointments/${id}/chat`).set(auth(b.token))).body,
      (await http(app).get('/me/trust').set(auth(b.token))).body,
    ]);
    for (const secret of ['LATE', 'HARD_TO_REACH', '연락이 잘 안 됐어요', '약속에 늦었어요', 'POOR', '아쉬웠어요']) expect(seen).not.toContain(secret);
  });

  test("서로 '또 같이 가고 싶어요'를 골랐을 때만 둘 다에게 알리고 채팅이 계속 열려 있다", async () => {
    const { a, b, id } = await ended();
    await review(a, id, { again: 'YES' }).expect(201);
    // 한쪽만 고르면 상대에게 아무것도 알려지지 않는다
    expect(await kinds(b)).not.toContain('REVIEW_MUTUAL_AGAIN');
    expect((await review(b, id, { again: 'YES' }).expect(201)).body).toEqual({ done: true, mutual: true });
    expect(await kinds(a)).toContain('REVIEW_MUTUAL_AGAIN');
    expect(await kinds(b)).toContain('REVIEW_MUTUAL_AGAIN');
    // 만남이 끝나고 24시간이 지나도 닫히지 않는다
    clock.current = kst('2026-12-15T12:00:00');
    const chat = (await http(app).get(`/appointments/${id}/chat`).set(auth(a.token)).expect(200)).body;
    expect(chat).toMatchObject({ open: true, closesAt: null });
    expect(chat.messages.map((m: { body: string }) => m.body)).toContain('서로 또 같이 가고 싶어 해서 채팅이 계속 열려 있어요.');
    await http(app).post(`/appointments/${id}/chat`).set(auth(a.token)).send({ body: '또 봬요!' }).expect(201);
  });

  test('한쪽이 YES가 아니면 연결되지 않고, 채팅은 24시간 뒤 닫힌다', async () => {
    const { a, b, id } = await ended();
    await review(a, id, { again: 'YES' }).expect(201);
    expect((await review(b, id, { again: 'MAYBE' }).expect(201)).body.mutual).toBe(false);
    expect(await kinds(a)).not.toContain('REVIEW_MUTUAL_AGAIN');
    clock.current = kst('2026-12-14T17:00:00');
    expect((await http(app).get(`/appointments/${id}/chat`).set(auth(a.token))).body.open).toBe(false);
  });

  test("서로 '또 같이 가고 싶어요'를 고른 사람은 다음 행사 후보 목록 맨 위에 보인다", async () => {
    const { ev, members } = await f.setup(['a', 'b', 'c']);
    const [a, b, c] = members;
    const id = await f.appoint(a, b, ev);
    await finishAppointment(app, clock, id, [a, b]);
    await review(a, id).expect(201);
    await review(b, id).expect(201);
    clock.current = kst('2026-12-12T18:00:00');
    const list = await candidates(c, ev.id);
    expect(list.every((x) => x.reunion === false)).toBe(true);
    const mine = await candidates(a, ev.id);
    const first = mine[0];
    expect(first).toMatchObject({ userId: b.userId, reunion: true });
    expect(mine.filter((x) => x.reunion).map((x) => x.userId)).toEqual([b.userId]);
  });

  test("'앞으로 추천에 나오지 않게'를 고르면 서로 보이지 않고 알림도 없다", async () => {
    const { ev, a, b, id } = await ended();
    await review(a, id, { again: 'YES', hideTarget: true }).expect(201);
    expect((await http(app).get('/me/blocks').set(auth(a.token))).body).toEqual([expect.objectContaining({ userId: b.userId, sourceLabel: '후기에서 차단' })]);
    expect((await candidates(a, ev.id)).map((x) => x.userId)).not.toContain(b.userId);
    expect((await candidates(b, ev.id)).map((x) => x.userId)).not.toContain(a.userId);
    expect(await kinds(b)).not.toContain('REVIEW_MUTUAL_AGAIN');
    // 상대가 YES여도 연결되지 않는다
    expect((await review(b, id, { again: 'YES' }).expect(201)).body.mutual).toBe(false);
  });
});

describe('차단', () => {
  test('서로 후보에서 숨기고, 후보 상세로도 볼 수 없으며, 상대에게는 알림이 가지 않는다', async () => {
    const { ev, members } = await f.setup(['a', 'b', 'c']);
    const [a, b, c] = members;
    expect((await candidates(a, ev.id)).map((x) => x.userId)).toEqual(expect.arrayContaining([b.userId, c.userId]));
    await http(app).post('/blocks').set(auth(a.token)).send({ userId: b.userId }).expect(200);
    expect((await candidates(a, ev.id)).map((x) => x.userId)).toEqual([c.userId]);
    expect((await candidates(b, ev.id)).map((x) => x.userId)).toEqual([c.userId]);
    await http(app).get(`/events/${ev.id}/candidates/${b.userId}`).set(auth(a.token)).expect(404);
    await http(app).get(`/events/${ev.id}/candidates/${a.userId}`).set(auth(b.token)).expect(404);
    // 제안도 보낼 수 없다 (후보가 아니므로)
    await http(app).post(`/events/${ev.id}/proposals`).set(auth(b.token)).send(f_proposal(ev, a.userId)).expect(404);
    expect(await kinds(b)).toEqual([]);
  });

  test('차단은 여러 번 눌러도 한 번이고, 풀면 다시 보이며, 나 자신은 차단할 수 없다', async () => {
    const { ev, members: [a, b] } = await f.setup();
    await http(app).post('/blocks').set(auth(a.token)).send({ userId: b.userId }).expect(200);
    await http(app).post('/blocks').set(auth(a.token)).send({ userId: b.userId }).expect(200);
    expect((await http(app).get('/me/blocks').set(auth(a.token))).body).toHaveLength(1);
    expect((await http(app).post('/blocks').set(auth(a.token)).send({ userId: a.userId }).expect(400)).body.code).toBe('BLOCK_INVALID');
    await http(app).post('/blocks').set(auth(a.token)).send({ userId: '11111111-1111-4111-8111-111111111111' }).expect(404);
    await http(app).delete(`/blocks/${b.userId}`).set(auth(a.token)).expect(200);
    expect((await http(app).get('/me/blocks').set(auth(a.token))).body).toEqual([]);
    expect((await candidates(a, ev.id)).map((x) => x.userId)).toContain(b.userId);
  });

  test('목록에는 내가 차단한 사람만 보이고, 차단당한 사람은 알 수 없다', async () => {
    const { members: [a, b] } = await f.setup();
    await http(app).post('/blocks').set(auth(a.token)).send({ userId: b.userId }).expect(200);
    expect((await http(app).get('/me/blocks').set(auth(b.token))).body).toEqual([]);
  });

  test('답을 기다리는 제안은 조용히 취소되고 알림이 없다', async () => {
    const { ev, members: [a, b] } = await f.setup();
    const proposalId = await f.propose(a, b, ev);
    await http(app).post('/blocks').set(auth(b.token)).send({ userId: a.userId }).expect(200);
    expect((await f.prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } })).status).toBe('CANCELLED');
    expect((await http(app).post(`/proposals/${proposalId}/accept`).set(auth(b.token)).expect(409)).body.code).toBe('PROPOSAL_STATE');
    expect(await kinds(a)).not.toContain('PROPOSAL_REJECTED');
  });

  test('진행 중인 약속은 끝나고, 차단한 사람에게는 임박 취소가 기록되지 않으며, 상대에게는 이유 없이 취소로만 보인다', async () => {
    const { ev, members: [a, b] } = await f.setup();
    const id = await f.appoint(a, b, ev);
    // 약속 24시간 안: 직접 취소하면 임박 취소지만, 차단으로 끝나면 기록되지 않는다
    clock.current = kst('2026-12-12T10:00:00');
    await http(app).post('/blocks/from-chat').set(auth(a.token)).send({ appointmentId: id }).expect(200);
    const mine = (await appt(a, id)).body;
    expect(mine).toMatchObject({ status: 'CANCELLED', end: { reason: 'CANCELLED', byMe: true, late: false } });
    const theirs = (await appt(b, id)).body;
    expect(theirs).toMatchObject({ status: 'CANCELLED', end: { reason: 'CANCELLED', byMe: false, cancelReason: null } });
    expect(JSON.stringify(theirs)).not.toMatch(/BLOCK|차단/);
    const note = (await http(app).get('/me/notifications').set(auth(b.token))).body.items.find((n: { kind: string }) => n.kind === 'APPOINTMENT_CANCELLED');
    expect(note.body).not.toMatch(/차단/);
    const part = await f.prisma.appointmentParticipant.findUniqueOrThrow({ where: { appointmentId_userId: { appointmentId: id, userId: a.userId } } });
    expect(part).toMatchObject({ lateCancel: false });
    expect((await http(app).get('/me/blocks').set(auth(a.token))).body[0].sourceLabel).toBe('채팅에서 차단');
  });

  test('만남 중이면 중간 종료, 다시 정하는 중이거나 보류면 취소로 끝난다. 차단을 풀어도 되살아나지 않는다', async () => {
    const { ev, members } = await f.setup(['a', 'b', 'c', 'd']);
    const [a, b, c, d] = members;
    // a·b: 만남 중
    const meeting = await f.appoint(a, b, ev, 0, 0);
    clock.current = kst('2026-12-11T18:00:00');
    for (const m of [a, b]) await http(app).post(`/appointments/${meeting}/confirm`).set(auth(m.token)).send({}).expect(200);
    // c·d: 행사 일정이 바뀌어 다시 정하는 중 (다른 날)
    clock.current = kst('2026-11-07T12:00:00');
    const resched = await f.appoint(c, d, ev, 1, 1);
    const manager = await adminToken(app, 'EVENT_MANAGER', 'blockmanager');
    const changed = {
      name: '테스트 밴드 콘서트', type: 'CONCERT', venue: '테스트홀', officialUrl: 'https://example.com/concert', ticketRequired: true,
      days: [
        { date: '2026-12-12', startTime: '15:00', endTime: '21:00', segments: [{ label: '굿즈 줄', startTime: '15:00', endTime: '17:00' }, { label: '공연', startTime: '18:00', endTime: '20:30' }] },
        { date: '2026-12-13', startTime: '15:00', endTime: '21:00', segments: [{ label: '굿즈 줄', startTime: '15:00', endTime: '17:00' }, { label: '공연', startTime: '19:00', endTime: '21:00' }] },
      ],
      meetingSpots: [{ name: '정문 안내판 앞', isPublicPlace: true }],
      confirmed: true,
    };
    await http(app).put(`/admin/events/${ev.id}`).set(auth(manager)).send(changed).expect(200);
    expect((await appt(c, resched)).body.status).toBe('RESCHEDULING');

    clock.current = kst('2026-12-12T15:30:00');
    expect((await appt(a, meeting)).body.status).toBe('IN_PROGRESS');
    await http(app).post('/blocks').set(auth(a.token)).send({ userId: b.userId }).expect(200);
    await http(app).post('/blocks').set(auth(c.token)).send({ userId: d.userId }).expect(200);
    expect((await appt(a, meeting)).body).toMatchObject({ status: 'ENDED_EARLY', end: { reason: 'CANCELLED', byMe: true } });
    expect((await appt(c, resched)).body.status).toBe('CANCELLED');

    await http(app).delete(`/blocks/${b.userId}`).set(auth(a.token)).expect(200);
    expect((await appt(a, meeting)).body.status).toBe('ENDED_EARLY');
  });

  test('차단한 두 사람의 채팅은 닫히고, 이어지기로 한 채팅도 닫힌다 (지난 대화는 읽을 수 있음)', async () => {
    const { a, b, id } = await ended();
    await review(a, id).expect(201);
    await review(b, id).expect(201);
    clock.current = kst('2026-12-15T12:00:00');
    expect((await http(app).get(`/appointments/${id}/chat`).set(auth(a.token))).body.open).toBe(true);
    await http(app).post('/blocks').set(auth(b.token)).send({ userId: a.userId }).expect(200);
    for (const m of [a, b]) {
      const chat = (await http(app).get(`/appointments/${id}/chat`).set(auth(m.token)).expect(200)).body;
      expect(chat.open).toBe(false);
      expect(chat.messages.length).toBeGreaterThan(0);
      expect((await http(app).post(`/appointments/${id}/chat`).set(auth(m.token)).send({ body: '안녕' }).expect(409)).body.code).toBe('CHAT_CLOSED');
    }
    // 차단한 사이에는 다시 같이 가고 싶은 사람으로도 보이지 않는다
    expect((await http(app).get('/me/chats').set(auth(a.token))).body[0].open).toBe(false);
  });
});

/** 후보에게 제안을 보내는 요청 본문 */
function f_proposal(ev: Awaited<ReturnType<ReturnType<typeof fixtures>['createEvent']>>, receiverId: string) {
  return { receiverId, eventDayId: ev.days[0].id, segmentIds: [ev.days[0].segments[0].id], meetingSpotId: ev.meetingSpots[0].id };
}

describe('신고 접수', () => {
  const report = (m: M, id: string, body: Record<string, unknown> = {}) =>
    http(app).post('/reports').set(auth(m.token)).send({ appointmentId: id, category: 'STALKING', detail: '계속 연락했어요', alsoBlock: false, ...body });

  test('접수하면 우선순위와 함께 저장되고, 상대에게는 아무것도 가지 않는다', async () => {
    const { a, b, id } = await ended();
    const res = await report(a, id).expect(201);
    expect(res.body).toMatchObject({ received: true, blocked: false });
    const row = await f.prisma.report.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({ reporterId: a.userId, targetId: b.userId, appointmentId: id, category: 'STALKING', status: 'RECEIVED', priority: 'GENERAL', upheld: null });
    expect(await kinds(b)).not.toContain('REPORT_RECEIVED');
    expect(JSON.stringify([(await appt(b, id)).body, (await http(app).get('/me/notifications').set(auth(b.token))).body])).not.toMatch(/신고|STALKING/);
    // 신고해도 나에게는 약속 정보가 그대로 보인다
    expect((await appt(a, id)).body.status).toBe('ENDED');
  });

  test('청소년이 걸려 있으면 우선순위가 청소년이다', async () => {
    const { a, b, id } = await ended();
    await f.prisma.user.update({ where: { id: b.userId }, data: { ageClass: 'TEEN' } });
    const res = await report(a, id).expect(201);
    expect((await f.prisma.report.findUniqueOrThrow({ where: { id: res.body.id } })).priority).toBe('TEEN');
  });

  test('같이 차단하면 서로 보이지 않는다. 약속 당사자만, 같은 약속은 한 번만 신고할 수 있다', async () => {
    const { ev, members } = await f.setup(['a', 'b', 'c']);
    const [a, b, c] = members;
    const id = await f.appoint(a, b, ev);
    await report(c, id).expect(404);
    await http(app).post('/reports').send({}).expect(401);
    const res = await report(a, id, { alsoBlock: true }).expect(201);
    expect(res.body.blocked).toBe(true);
    expect((await candidates(a, ev.id)).map((x) => x.userId)).not.toContain(b.userId);
    expect((await http(app).get('/me/blocks').set(auth(a.token))).body[0].sourceLabel).toBe('약속 중 불편');
    expect((await report(a, id).expect(409)).body.code).toBe('REPORT_EXISTS');
  });

  test('분류와 글자 수 규칙', async () => {
    const { a, id } = await ended();
    await report(a, id, { category: 'SOMETHING' }).expect(400);
    const long = await report(a, id, { detail: '가'.repeat(1001) }).expect(400);
    expect(long.body).toMatchObject({ code: 'REPORT_INVALID', detail: { max: 1000 } });
    // 자세한 내용은 선택
    await report(a, id, { detail: undefined, category: 'MONEY' }).expect(201);
  });

  test('신고 내용이 서버 로그와 오류 응답에 남지 않는다 (규칙 11)', async () => {
    const { a, id } = await ended();
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
      const secret = '01098765432 이 번호로 계속 전화해요';
      await report(a, id, { detail: `${secret}${'가'.repeat(1100)}` }).expect(400);
      const ok = await report(a, id, { detail: secret }).expect(201);
      expect(JSON.stringify(ok.body)).not.toContain('98765432');
      await report(a, id, { detail: secret }).expect(409);
      expect(lines.some((l) => l.includes('REPORT_EXISTS'))).toBe(true);
      expect(lines.join('\n')).not.toContain('98765432');
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });

  test('이번 단계에는 운영자가 신고를 볼 수 있는 주소가 없다 (처리는 7-2단계)', async () => {
    const { a, id } = await ended();
    await report(a, id).expect(201);
    const admin = await adminToken(app, 'REPORT_MANAGER', 'reportviewer');
    await http(app).get('/admin/reports').set(auth(admin)).expect(404);
  });
});

describe('신뢰 단계', () => {
  const trust = async (m: M) => (await http(app).get('/me/trust').set(auth(m.token)).expect(200)).body;
  const changes = (userId: string) => f.prisma.trustChange.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

  test('처음에는 1단계, 티켓 인증을 하면 3단계로 올라가고 이유와 함께 기록된다', async () => {
    const ev = await f.createEvent();
    const a = await f.member('a');
    expect(await trust(a)).toMatchObject({ level: 1, label: '기본', next: { label: '참석 예정', reviewsToGo: null } });
    await f.ready(a, ev);
    expect(await trust(a)).toMatchObject({ level: 3, label: '참석 인증', next: { label: '쌓인 신뢰', reviewsToGo: 3, progress: 0 } });
    expect((await changes(a.userId)).map((c) => [c.fromLevel, c.toLevel, c.reason])).toEqual([[1, 3, 'ATTENDANCE_VERIFIED']]);
    // 숫자 점수는 돌려주지 않는다
    expect(Object.keys(await trust(a)).sort()).toEqual(['description', 'label', 'level', 'next']);
  });

  test("티켓이 필요 없는 행사의 '참석 예정'은 2단계", async () => {
    const free = await http(app).post('/admin/events').set(auth(await adminToken(app, 'EVENT_MANAGER', 'freemanager'))).send({
      name: '무료 팝업', type: 'POPUP', venue: '테스트몰', officialUrl: 'https://example.com/free', ticketRequired: false,
      days: [{ date: '2026-12-12', startTime: '10:00', endTime: '20:00', segments: [] }],
      meetingSpots: [{ name: '정문', isPublicPlace: true }],
    }).expect(201);
    const a = await f.member('a');
    await http(app).post(`/events/${free.body.id}/attendance-plan`).set(auth(a.token)).expect(200);
    expect((await trust(a)).level).toBe(2);
  });

  test("받은 '좋았어요·괜찮았어요' 후기가 3건이 되면 4단계, 후보 카드에 쌓인 신뢰가 붙고 순서에는 영향이 없다", async () => {
    const { ev, members } = await f.setup(['a', 'b', 'c', 'd', 'e']);
    const [a, b, c, d, e] = members;
    const ab = await f.appoint(b, a, ev, 0, 0);
    const ac = await f.appoint(c, a, ev, 0, 1);
    const ad = await f.appoint(d, a, ev, 1, 0);
    await finishAppointment(app, clock, ab, [a, b]);
    await review(b, ab, { overall: 'GREAT', again: 'NO' }).expect(201);
    expect((await trust(a)).next).toMatchObject({ reviewsToGo: 2 });
    // 12-12 18:00 약속과 12-13 약속은 전날 확인 절차를 거치지 않고 끝난 상태로 만든다 (후기 규칙만 확인)
    clock.current = kst('2026-12-13T21:00:00');
    await f.prisma.appointment.updateMany({ where: { id: { in: [ac, ad] } }, data: { status: 'ENDED' } });
    await review(c, ac, { overall: 'OK', again: 'NO' }).expect(201);
    expect((await trust(a)).level).toBe(3);
    await review(d, ad, { overall: 'GREAT', again: 'NO' }).expect(201);
    expect(await trust(a)).toMatchObject({ level: 4, label: '쌓인 신뢰', next: null });
    expect((await changes(a.userId)).map((x) => [x.fromLevel, x.toLevel, x.reason])).toEqual([[1, 3, 'ATTENDANCE_VERIFIED'], [3, 4, 'REVIEWS']]);

    // 후보 카드: 표시만 있고 순서에는 영향이 없다
    const list = await candidates(e, ev.id);
    expect(list.find((x) => x.userId === a.userId)).toMatchObject({ trusted: true });
    expect(list.filter((x) => x.userId !== a.userId).every((x) => x.trusted === false)).toBe(true);
    expect(list.map((x) => x.userId)).toEqual([...list.map((x) => x.userId)].sort());
  });

  /** a가 세 사람(b·c·d)과 만나고 끝난 상태. 후기를 쓸 수 있는 때(12-13 21:00)로 시계를 옮깁니다. */
  async function threeEnded() {
    const { ev, members } = await f.setup(['a', 'b', 'c', 'd']);
    const [a, b, c, d] = members;
    const ids = [await f.appoint(b, a, ev, 0, 0), await f.appoint(c, a, ev, 0, 1), await f.appoint(d, a, ev, 1, 0)];
    clock.current = kst('2026-12-13T21:00:00');
    await f.prisma.appointment.updateMany({ where: { id: { in: ids } }, data: { status: 'ENDED' } });
    return { ev, a, writers: [b, c, d], ids };
  }

  test("'아쉬웠어요·불편했어요' 후기는 4단계로 올라가는 데 세지 않는다", async () => {
    const { a, writers, ids } = await threeEnded();
    await review(writers[0], ids[0], { overall: 'POOR', again: 'NO' }).expect(201);
    await review(writers[1], ids[1], { overall: 'UNCOMFORTABLE', again: 'NO', goodTags: [] }).expect(201);
    await review(writers[2], ids[2], { overall: 'GREAT', again: 'NO' }).expect(201);
    expect(await trust(a)).toMatchObject({ level: 3, next: { reviewsToGo: 2 } });
  });

  test('좋은 후기가 3건이어도, 운영팀이 사실로 확인한 불편 신고가 있으면 쌓인 신뢰에서 내려온다', async () => {
    const { a, writers, ids } = await threeEnded();
    for (const [i, w] of writers.entries()) await review(w, ids[i], { overall: i === 1 ? 'OK' : 'GREAT', again: 'NO' }).expect(201);
    expect((await trust(a)).level).toBe(4);
    // 운영팀의 확인은 7-2단계에서 만듭니다. 여기서는 확인된 신고가 있는 상태만 만들어 규칙을 확인합니다.
    await f.prisma.report.create({
      data: { reporterId: writers[0].userId, targetId: a.userId, appointmentId: ids[0], category: 'OTHER', priority: 'GENERAL', status: 'CLOSED', upheld: true },
    });
    expect((await trust(a)).level).toBe(3);
    expect((await changes(a.userId)).map((x) => x.reason)).toEqual(['ATTENDANCE_VERIFIED', 'REVIEWS', 'REPORT_UPHELD']);
  });

  test('최근 90일 안에 임박 취소가 2번 이상이면 한 단계 내려가고, 기간이 지나면 다시 올라간다', async () => {
    const { ev, members } = await f.setup(['a', 'b', 'c']);
    const [a, b, c] = members;
    expect((await trust(a)).level).toBe(3);
    // 약속 24시간 안에 직접 취소 두 번
    const first = await f.appoint(a, b, ev, 0, 0);
    const second = await f.appoint(a, c, ev, 1, 0);
    clock.current = kst('2026-12-12T10:00:00');
    await http(app).post(`/appointments/${first}/cancel`).set(auth(a.token)).send({}).expect(200);
    expect((await trust(a)).level).toBe(3);
    clock.current = kst('2026-12-13T10:00:00');
    await http(app).post(`/appointments/${second}/cancel`).set(auth(a.token)).send({}).expect(200);
    expect((await trust(a)).level).toBe(2);
    expect((await changes(a.userId)).map((x) => [x.fromLevel, x.toLevel, x.reason])).toEqual([[1, 3, 'ATTENDANCE_VERIFIED'], [3, 2, 'RECENT_RECORDS']]);
    // 미리 취소한 것은 세지 않는다 (b는 영향 없음)
    expect((await trust(b)).level).toBe(3);
    // 91일 뒤에는 기록이 오래되어 다시 올라간다
    clock.current = kst('2027-03-15T12:00:00');
    expect((await trust(a)).level).toBe(3);
  });

  test('무응답으로 약속이 취소돼도 신뢰 단계에 반영된다 (두 번이면 내려감)', async () => {
    const { ev, members } = await f.setup(['a', 'b', 'c']);
    const [a, b, c] = members;
    const first = await f.appoint(b, a, ev, 0, 0);
    const second = await f.appoint(c, a, ev, 1, 0);
    // b·c만 확인하고 a는 확인하지 않음
    clock.current = kst('2026-12-11T18:00:00');
    await http(app).post(`/appointments/${first}/confirm`).set(auth(b.token)).send({}).expect(200);
    clock.current = kst('2026-12-12T12:00:00');
    await appt(a, first);
    clock.current = kst('2026-12-12T18:00:00');
    await http(app).post(`/appointments/${second}/confirm`).set(auth(c.token)).send({}).expect(200);
    clock.current = kst('2026-12-13T12:00:00');
    await appt(a, second);
    expect((await trust(a)).level).toBe(2);
    // 확인한 사람(b, c)에게는 영향이 없다
    expect((await trust(b)).level).toBe(3);
    expect((await trust(c)).level).toBe(3);
  });
});
