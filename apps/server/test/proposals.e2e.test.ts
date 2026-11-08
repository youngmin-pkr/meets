/**
 * 3-2단계: 제안 보내기·받기·수락·거절·취소·만료와 약속 만들기
 */
import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertProposalTransition, PROPOSAL_STATUSES } from '../src/proposals/proposal-transitions';
import { adminToken, ALL_TERMS, auth, eventInput, fakeToken, http, resetDb, startApp, TestClock } from './helpers';

let app: INestApplication;
let prisma: PrismaService;
const clock = new TestClock(); // 2026-11-07 12:00 (한국)

beforeAll(async () => {
  app = await startApp(clock, false, () => 0.99); // 무작위 검수 없음
  prisma = app.get(PrismaService);
});

beforeEach(async () => {
  clock.current = new Date('2026-11-07T03:00:00Z');
  await resetDb(app);
});

afterAll(async () => {
  await app.close();
});

async function createEvent(overrides: Record<string, unknown> = {}) {
  const admin = await adminToken(app, 'EVENT_MANAGER', `m${Math.random().toString(36).slice(2, 8)}`);
  const day = (date: string) => ({
    date,
    startTime: '15:00',
    endTime: '21:00',
    segments: [
      { label: '굿즈 줄', startTime: '15:00', endTime: '17:00' },
      { label: '공연', startTime: '18:00', endTime: '20:30' },
    ],
  });
  const res = await http(app).post('/admin/events').set(auth(admin)).send(eventInput({ days: [day('2026-12-12'), day('2026-12-13')], ...overrides })).expect(201);
  return prisma.event.findUniqueOrThrow({
    where: { id: res.body.id },
    include: { days: { orderBy: { date: 'asc' }, include: { segments: { orderBy: { sortOrder: 'asc' } } } }, meetingSpots: true },
  });
}
type Ev = Awaited<ReturnType<typeof createEvent>>;

async function member(person: string, gender: 'M' | 'F' = 'F') {
  const res = await http(app).post('/auth/identity').send({ verificationToken: fakeToken(person, '2000-01-01', gender), agreedTerms: ALL_TERMS }).expect(200);
  const token = res.body.sessionToken as string;
  await http(app).put('/me/profile').set(auth(token)).send({ nickname: `테스트${person}`, avatarColor: 'ink' }).expect(200);
  await http(app).put('/me/fandoms').set(auth(token)).send({ fandomIds: [] }).expect(200);
  await http(app).post('/me/notification-choice').set(auth(token)).send({ granted: false }).expect(200);
  const user = await prisma.user.findFirstOrThrow({ where: { nickname: `테스트${person}` } });
  return { token, userId: user.id };
}

async function pref(token: string, ev: Ev, must = { gender: 'ANY', age: 'ANY', promises: [] as string[] }) {
  await http(app)
    .put(`/events/${ev.id}/preference`)
    .set(auth(token))
    .send({
      days: ev.days.map((d) => ({ eventDayId: d.id, arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: d.segments.map((s) => s.id) })),
      tempoAnswers: [2, 2, 2],
      immersionAnswers: [2, 2],
      must,
    })
    .expect(200);
}

async function verifyTicket(token: string, ev: Ev, number: string) {
  const start = await http(app).post(`/events/${ev.id}/tickets`).set(auth(token)).send({ kind: 'TICKET' }).expect(201);
  const img = (await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } }).jpeg().toBuffer()).toString('base64');
  await http(app).post(`/tickets/${start.body.id}/image`).set(auth(token)).send({ imageBase64: img, mimeType: 'image/jpeg', masks: [] }).expect(200);
  await http(app).post(`/tickets/${start.body.id}/confirm`).set(auth(token)).send({ reservationNumber: number, admissibleDayIds: ev.days.map((d) => d.id) }).expect(200);
}

/** 둘 다 입력·인증을 마친 상태 */
async function pair(opts: { verifyA?: boolean; verifyB?: boolean } = {}) {
  const ev = await createEvent();
  const a = await member('a');
  const b = await member('b');
  await pref(a.token, ev);
  await pref(b.token, ev);
  if (opts.verifyA !== false) await verifyTicket(a.token, ev, 'A0001');
  if (opts.verifyB !== false) await verifyTicket(b.token, ev, 'B0001');
  return { ev, a, b };
}

const body = (ev: Ev, receiverId: string, o: { day?: number; segs?: number[]; spot?: string } = {}) => ({
  receiverId,
  eventDayId: ev.days[o.day ?? 0].id,
  segmentIds: (o.segs ?? [0]).map((i) => ev.days[o.day ?? 0].segments[i].id),
  meetingSpotId: o.spot ?? ev.meetingSpots.find((s) => s.isPublicPlace)!.id,
});

const send = (token: string, ev: Ev, b: object) => http(app).post(`/events/${ev.id}/proposals`).set(auth(token)).send(b);

describe('제안 상태 전이 표', () => {
  const allowed = [
    ['SENT', 'ACCEPTED'],
    ['SENT', 'REJECTED'],
    ['SENT', 'EXPIRED'],
    ['SENT', 'CANCELLED'],
  ];
  test.each(PROPOSAL_STATUSES.flatMap((a) => PROPOSAL_STATUSES.map((b) => [a, b] as const)))('%s → %s', (from, to) => {
    if (allowed.some(([x, y]) => x === from && y === to)) expect(() => assertProposalTransition(from, to)).not.toThrow();
    else expect(() => assertProposalTransition(from, to)).toThrow(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
  });
});

describe('제안 보내기', () => {
  test('인증한 사람은 후보에게 제안을 보낼 수 있고, 만료는 24시간 뒤', async () => {
    const { ev, a, b } = await pair();
    const res = await send(a.token, ev, body(ev, b.userId)).expect(201);
    expect(res.body).toMatchObject({
      direction: 'SENT',
      status: 'SENT',
      counterpart: { userId: b.userId, nickname: '테스트b' },
      day: { date: '2026-12-12' },
      segments: [{ label: '굿즈 줄' }],
      expiresAt: '2026-11-08T03:00:00.000Z',
    });
    const received = await http(app).get('/me/proposals').set(auth(b.token)).expect(200);
    expect(received.body).toEqual([expect.objectContaining({ direction: 'RECEIVED', counterpart: expect.objectContaining({ userId: a.userId }) })]);
  });

  test('티켓 인증 전에는 보낼 수 없다', async () => {
    const { ev, a, b } = await pair({ verifyA: false });
    const res = await send(a.token, ev, body(ev, b.userId)).expect(403);
    expect(res.body.code).toBe('PROPOSAL_NEEDS_TICKET');
  });

  test("티켓이 필요 없는 행사는 '참석 예정'도 보낼 수 있지만, 구간은 1개까지", async () => {
    const ev = await createEvent({ ticketRequired: false, officialUrl: 'https://example.com/free' });
    const a = await member('a');
    const b = await member('b');
    await pref(a.token, ev);
    await pref(b.token, ev);
    await http(app).post(`/events/${ev.id}/attendance-plan`).set(auth(a.token)).expect(200);
    const two = await send(a.token, ev, body(ev, b.userId, { segs: [0, 1] })).expect(400);
    expect(two.body).toMatchObject({ code: 'PROPOSAL_INVALID', detail: { field: 'segmentIds', max: 1 } });
    await send(a.token, ev, body(ev, b.userId, { segs: [1] })).expect(201);
  });

  test('후보가 아닌 사람(필수 조건이 안 맞는 사람)에게는 보낼 수 없다', async () => {
    const ev = await createEvent();
    const a = await member('a', 'F');
    const m = await member('m', 'M');
    await pref(a.token, ev);
    await pref(m.token, ev, { gender: 'SAME', age: 'ANY', promises: [] }); // 상대가 같은 성별만 원함
    await verifyTicket(a.token, ev, 'A0001');
    await send(a.token, ev, body(ev, m.userId)).expect(404);
  });

  test('후보 목록에 보이는 사람에게는 보낼 수 있다 (상대의 약속 조건은 받는 사람이 보고 판단)', async () => {
    const ev = await createEvent();
    const a = await member('a');
    const b = await member('b');
    await pref(a.token, ev);
    await pref(b.token, ev, { gender: 'ANY', age: 'ANY', promises: ['PUNCTUAL'] }); // b는 시간 약속을 고름, a는 안 고름
    await verifyTicket(a.token, ev, 'A0001');
    const list = await http(app).get(`/events/${ev.id}/candidates`).set(auth(a.token)).expect(200);
    expect(list.body.candidates.map((c: { userId: string }) => c.userId)).toContain(b.userId);
    await send(a.token, ev, body(ev, b.userId)).expect(201);
  });

  test.each([
    ['segmentIds', (ev: Ev, id: string) => ({ ...body(ev, id), segmentIds: [] })],
    ['segmentIds', (ev: Ev, id: string) => ({ ...body(ev, id), segmentIds: [ev.days[1].segments[0].id] })],
    ['meetingSpotId', (ev: Ev, id: string) => ({ ...body(ev, id), meetingSpotId: ev.meetingSpots.find((s) => !s.isPublicPlace)!.id })],
  ])('잘못된 %s는 거절', async (field, make) => {
    const { ev, a, b } = await pair();
    const res = await send(a.token, ev, make(ev, b.userId)).expect(400);
    expect(res.body).toMatchObject({ code: 'PROPOSAL_INVALID', detail: { field } });
  });

  test('행사 24시간 전부터는 보낼 수 없고, 그 직전에는 행사 24시간 전까지만 유효', async () => {
    const { ev, a, b } = await pair();
    clock.current = new Date('2026-12-10T12:00:00Z');
    // 로그인 유지 기간(30일)이 지나 다시 로그인
    const login = await http(app).post('/auth/identity').send({ verificationToken: fakeToken('a', '2000-01-01') }).expect(200);
    const ok = await send(login.body.sessionToken, ev, body(ev, b.userId)).expect(201);
    expect(ok.body.expiresAt).toBe('2026-12-11T06:00:00.000Z'); // 12-12 15:00(한국) - 24시간
    clock.current = new Date('2026-12-11T07:00:00Z');
    const late = await send(login.body.sessionToken, ev, body(ev, b.userId, { day: 0 })).expect(409);
    expect(late.body.code).toBe('PROPOSAL_TOO_LATE');
  });

  test('같은 두 사람 사이에 답을 기다리는 제안이 있으면 또 보낼 수 없다 (양쪽 모두)', async () => {
    const { ev, a, b } = await pair();
    await send(a.token, ev, body(ev, b.userId)).expect(201);
    expect((await send(a.token, ev, body(ev, b.userId, { day: 1 })).expect(409)).body.code).toBe('PROPOSAL_EXISTS');
    expect((await send(b.token, ev, body(ev, a.userId)).expect(409)).body.message).toContain('받은 제안');
  });

  test('나에게는 보낼 수 없다', async () => {
    const { ev, a } = await pair();
    await send(a.token, ev, body(ev, a.userId)).expect(400);
  });
});

describe('받은 제안에 답하기', () => {
  test('수락하면 약속이 확정 대기로 만들어지고 두 사람 모두에게 보인다', async () => {
    const { ev, a, b } = await pair();
    const sent = await send(a.token, ev, body(ev, b.userId, { segs: [0, 1] })).expect(201);
    const accepted = await http(app).post(`/proposals/${sent.body.id}/accept`).set(auth(b.token)).expect(200);
    expect(accepted.body).toMatchObject({
      status: 'PENDING_CONFIRM',
      counterpart: { userId: a.userId },
      day: { date: '2026-12-12', startTime: '15:00' },
      segments: [{ label: '굿즈 줄' }, { label: '공연' }],
    });
    const forA = await http(app).get('/me/appointments').set(auth(a.token)).expect(200);
    expect(forA.body).toEqual([expect.objectContaining({ status: 'PENDING_CONFIRM', counterpart: expect.objectContaining({ userId: b.userId }) })]);
    expect((await prisma.proposal.findUniqueOrThrow({ where: { id: sent.body.id } })).status).toBe('ACCEPTED');
    // 같은 날 이미 약속이 있으면 새 제안을 보낼 수 없음
    expect((await send(a.token, ev, body(ev, b.userId)).expect(409)).body.code).toBe('PROPOSAL_EXISTS');
  });

  test('받는 사람도 인증을 마쳐야 수락할 수 있다', async () => {
    const { ev, a, b } = await pair({ verifyB: false });
    const sent = await send(a.token, ev, body(ev, b.userId)).expect(201);
    const res = await http(app).post(`/proposals/${sent.body.id}/accept`).set(auth(b.token)).expect(403);
    expect(res.body.code).toBe('PROPOSAL_NEEDS_TICKET');
    // 거절은 인증 없이도 할 수 있음
    await http(app).post(`/proposals/${sent.body.id}/reject`).set(auth(b.token)).expect(200);
  });

  test('거절·취소 후에는 다시 답할 수 없다', async () => {
    const { ev, a, b } = await pair();
    const s1 = await send(a.token, ev, body(ev, b.userId)).expect(201);
    await http(app).post(`/proposals/${s1.body.id}/reject`).set(auth(b.token)).expect(200);
    expect((await http(app).post(`/proposals/${s1.body.id}/accept`).set(auth(b.token)).expect(409)).body.code).toBe('PROPOSAL_STATE');
    const s2 = await send(a.token, ev, body(ev, b.userId)).expect(201);
    await http(app).post(`/proposals/${s2.body.id}/cancel`).set(auth(a.token)).expect(200);
    await http(app).post(`/proposals/${s2.body.id}/accept`).set(auth(b.token)).expect(409);
  });

  test('보낸 사람만 취소하고, 받은 사람만 수락·거절한다', async () => {
    const { ev, a, b } = await pair();
    const s = await send(a.token, ev, body(ev, b.userId)).expect(201);
    await http(app).post(`/proposals/${s.body.id}/accept`).set(auth(a.token)).expect(404);
    await http(app).post(`/proposals/${s.body.id}/cancel`).set(auth(b.token)).expect(404);
    const c = await member('c');
    await http(app).post(`/proposals/${s.body.id}/reject`).set(auth(c.token)).expect(404);
  });

  test('24시간이 지나면 만료되어 수락할 수 없다', async () => {
    const { ev, a, b } = await pair();
    const s = await send(a.token, ev, body(ev, b.userId)).expect(201);
    clock.current = new Date('2026-11-08T03:00:01Z');
    const res = await http(app).post(`/proposals/${s.body.id}/accept`).set(auth(b.token)).expect(409);
    expect(res.body).toMatchObject({ code: 'PROPOSAL_STATE', detail: { status: 'EXPIRED' } });
    const list = await http(app).get('/me/proposals').set(auth(a.token)).expect(200);
    expect(list.body[0].status).toBe('EXPIRED');
    // 만료된 뒤에는 다시 보낼 수 있음
    await send(a.token, ev, body(ev, b.userId)).expect(201);
  });

  test('그사이 받는 사람이 일정을 바꿔 제안한 날에 함께할 수 없으면 수락할 수 없다', async () => {
    const { ev, a, b } = await pair();
    const s = await send(a.token, ev, body(ev, b.userId)).expect(201); // 첫째 날 제안
    await http(app)
      .put(`/events/${ev.id}/preference`)
      .set(auth(b.token))
      .send({
        days: [{ eventDayId: ev.days[1].id, arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ev.days[1].segments.map((x) => x.id) }],
        tempoAnswers: [2, 2, 2],
        immersionAnswers: [2, 2],
        must: { gender: 'ANY', age: 'ANY', promises: [] },
      })
      .expect(200);
    const res = await http(app).post(`/proposals/${s.body.id}/accept`).set(auth(b.token)).expect(400);
    expect(res.body.code).toBe('PROPOSAL_INVALID');
  });
});
