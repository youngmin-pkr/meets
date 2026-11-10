/**
 * 10-2단계: 즉석 제안(10분)과 즉석 약속(수락하는 순간 확정)
 * 기준 행사: 2026-12-12(토) 15:00~21:00, 시계는 16:00
 */
import type { INestApplication } from '@nestjs/common';
import { AppointmentsService } from '../src/appointments/appointments.service';
import { ProposalsService } from '../src/proposals/proposals.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { fixtures, kst } from './appointment-fixtures';
import { auth, http, resetDb, startApp, TestClock } from './helpers';

let app: INestApplication;
let prisma: PrismaService;
let fx: ReturnType<typeof fixtures>;
const clock = new TestClock();

beforeAll(async () => {
  app = await startApp(clock, false, () => 0.99);
  prisma = app.get(PrismaService);
  fx = fixtures(app);
});
beforeEach(async () => {
  clock.current = kst('2026-11-07T12:00:00');
  await resetDb(app);
  await prisma.policyValue.create({ data: { key: 'SESSION_TTL_DAYS', value: 365, effectiveFrom: kst('2026-01-01T00:00:00') } });
});
afterAll(async () => {
  await app.close();
});

type M = Awaited<ReturnType<typeof fx.member>>;
type Ev = Awaited<ReturnType<typeof fx.createEvent>>;
const get = (m: M, path: string) => http(app).get(path).set(auth(m.token));
const post = (m: M, path: string, body: object = {}) => http(app).post(path).set(auth(m.token)).send(body);
const kinds = async (m: M, kind: string) => (await prisma.notification.findMany({ where: { userId: m.userId, kind: kind as never } })).length;

/** 행사와, 모두 켠 사람 n명 (후보가 열리려면 나를 뺀 5명 → 6명) */
async function world(n = 6) {
  const { ev, members } = await fx.setup(Array.from({ length: n }, (_, i) => `i${i + 1}`));
  clock.current = kst('2026-12-12T16:00:00');
  for (const m of members) await http(app).put(`/events/${ev.id}/instant`).set(auth(m.token)).send({}).expect(200);
  return { ev, members };
}
/** 이미 있는 행사에서 모두 켠 사람 n명을 더 만든다 (한 테스트에서 약속을 여러 개 만들 때) */
async function moreOn(ev: Ev, tag: string, n = 6) {
  const out: M[] = [];
  for (let i = 0; i < n; i++) {
    const m = await fx.member(`${tag}${i}`);
    await fx.ready(m, ev);
    await http(app).put(`/events/${ev.id}/instant`).set(auth(m.token)).send({}).expect(200);
    out.push(m);
  }
  return out;
}
const body = (ev: Ev, receiver: M, minutes = 60) => ({ receiverId: receiver.userId, meetingSpotId: ev.meetingSpots[0].id, minutes });
const send = (s: M, ev: Ev, r: M, minutes = 60) => post(s, `/events/${ev.id}/instant/proposals`, body(ev, r, minutes));

describe('즉석 제안 보내기', () => {
  it('지금 만날 수 있는 후보에게 10분짜리 제안을 보낸다. 받는 사람에게 바로 알림이 간다', async () => {
    const { ev, members: [a, b] } = await world();
    const res = await send(a, ev, b).expect(201);
    expect(res.body).toMatchObject({ status: 'SENT', direction: 'SENT', instant: { minutes: 60 }, party: null, counterpart: { userId: b.userId } });
    expect(res.body.expiresAt).toBe(kst('2026-12-12T16:10:00').toISOString());
    const got = (await get(b, '/me/proposals').expect(200)).body[0];
    expect(got).toMatchObject({ direction: 'RECEIVED', instant: { minutes: 60 }, status: 'SENT' });
    const note = (await prisma.notification.findMany({ where: { userId: b.userId, kind: 'PROPOSAL_RECEIVED' } }))[0];
    expect(note.pushAt.toISOString()).toBe(clock.current.toISOString()); // 방해 금지 시간과 상관없이 바로
  });

  it('티켓 인증은 필요 없다', async () => {
    const { ev, members: [a, b] } = await world();
    expect(await prisma.ticketVerification.count()).toBeGreaterThan(0); // 기본 도우미는 인증하지만, 아래처럼 지워도 보낼 수 있음
    await prisma.ticketVerification.deleteMany({});
    await prisma.attendancePlan.deleteMany({});
    await send(a, ev, b).expect(201);
  });

  it('켜지 않았거나, 후보가 열리지 않았거나, 받는 사람이 후보가 아니면 보낼 수 없다', async () => {
    const { ev, members: [a, b, c] } = await world();
    const off = await fx.member('off1');
    await send(off, ev, b).expect(409); // 켜지 않음
    await http(app).delete(`/events/${ev.id}/instant`).set(auth(c.token)).expect(200);
    await send(a, ev, c).expect(409); // 한 명이 빠져 나를 뺀 대기가 5명 미만 → 후보가 닫힘
  });

  it('후보가 5명 미만이면 보낼 수 없다', async () => {
    const { ev, members } = await world(5);
    // 나를 뺀 4명이라 후보가 닫혀 있음 (받는 사람이 켜 두었더라도 보낼 수 없다)
    const res = await send(members[0], ev, members[1]).expect(409);
    expect(res.body.code).toBe('INSTANT_NOT_NOW');
  });

  it('잘못된 시간·장소·자기 자신은 거절한다', async () => {
    const { ev, members: [a, b] } = await world();
    await send(a, ev, b, 45).expect(400);
    await post(a, `/events/${ev.id}/instant/proposals`, { ...body(ev, b), meetingSpotId: '00000000-0000-4000-8000-000000000000' }).expect(400);
    await send(a, ev, a).expect(400);
    await post(a, `/events/${ev.id}/instant/proposals`, { receiverId: b.userId }).expect(400);
    await http(app).post(`/events/${ev.id}/instant/proposals`).send(body(ev, b)).expect(401);
  });

  it('한 사람이 동시에 보낼 수 있는 즉석 제안은 하나이고, 같은 두 사람 사이에 오가는 제안도 하나다', async () => {
    const { ev, members: [a, b, c] } = await world();
    await send(a, ev, b).expect(201);
    expect((await send(a, ev, c).expect(409)).body.code).toBe('PROPOSAL_EXISTS');
    expect((await send(b, ev, a).expect(409)).body.code).toBe('PROPOSAL_EXISTS');
    // 답이 와서 끝나면 새로 보낼 수 있다
    const id = (await get(b, '/me/proposals')).body[0].id;
    await post(b, `/proposals/${id}/reject`).expect(200);
    await send(a, ev, c).expect(201);
  });

  it('행사가 곧 끝나 만날 시간이 30분 안 되면 보낼 수 없다', async () => {
    const { ev, members } = await world();
    const [a, b] = members;
    clock.current = kst('2026-12-12T20:20:00');
    for (const m of members) await http(app).put(`/events/${ev.id}/instant`).set(auth(m.token)).send({}).expect(200);
    expect((await send(a, ev, b).expect(409)).body.code).toBe('PROPOSAL_TOO_LATE'); // 20:35~21:00
  });

  it('겹치는 약속이 있거나 제안 제한 중이면 보낼 수 없다', async () => {
    const { ev, members: [a, b, c] } = await world();
    const day = ev.days[0];
    // c와 b가 같은 시간에 이미 약속이 있다고 만든다 (일반 약속)
    await prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.create({
        data: { senderId: a.userId, receiverId: c.userId, eventId: ev.id, eventDayId: day.id, segmentIds: [], meetingSpotId: ev.meetingSpots[0].id, date: day.date, segmentsSnapshot: [], meetingSpotName: '정문', status: 'ACCEPTED', expiresAt: kst('2026-11-08T00:00:00') },
      });
      await app.get(AppointmentsService).createFromProposal(tx, { id: proposal.id, eventId: ev.id, eventDayId: day.id, meetingSpotId: ev.meetingSpots[0].id, senderId: a.userId, receiverId: c.userId }, { date: day.date, startTime: '16:00', endTime: '19:00', segments: [] }, '정문');
    });
    expect((await send(c, ev, b).expect(409)).body.code).toBe('APPOINTMENT_OVERLAP');
  });
});

describe('즉석 제안에 답하기', () => {
  async function sent(minutes = 60) {
    const w = await world();
    const [a, b] = w.members;
    const id = (await send(a, w.ev, b, minutes).expect(201)).body.id as string;
    return { ...w, a, b, id };
  }

  it('수락하면 바로 확정된 약속이 만들어지고, 15분 뒤 시작하며, 취소는 10분까지 영향이 없다', async () => {
    const { a, b, id } = await sent();
    clock.current = kst('2026-12-12T16:03:20');
    const appt = (await post(b, `/proposals/${id}/accept`).expect(200)).body;
    expect(appt).toMatchObject({ status: 'CONFIRMED', instant: true });
    expect(appt.startsAt).toBe(kst('2026-12-12T16:19:00').toISOString());
    expect(appt.endsAt).toBe(kst('2026-12-12T17:19:00').toISOString());
    expect(appt.freeCancelUntil).toBe(kst('2026-12-12T16:13:20').toISOString());
    expect(appt.confirm).toMatchObject({ mine: true, theirs: true });
    expect(appt.actions.confirm).toBe(false); // 전날 확인이 필요 없음
    const mine = (await get(a, `/appointments/${appt.id}`).expect(200)).body;
    expect(mine).toMatchObject({ status: 'CONFIRMED', instant: true });
    const note = (await prisma.notification.findMany({ where: { userId: a.userId, kind: 'PROPOSAL_ACCEPTED' } }))[0];
    expect(note.body).toContain('바로 만나요');
    expect(note.body).toContain('16:19');
    expect(note.pushAt.toISOString()).toBe(clock.current.toISOString());
    // 전날 확인·곧 약속 알림은 가지 않는다
    expect(await kinds(a, 'DAY_BEFORE_CONFIRM')).toBe(0);
    await app.get(AppointmentsService).settle();
    expect(await kinds(a, 'APPOINTMENT_SOON')).toBe(0);
  });

  it('수락하면 두 사람은 후보 풀에서 빠지고, 채팅이 열린다', async () => {
    const { ev, a, b, id, members } = await sent();
    const appt = (await post(b, `/proposals/${id}/accept`).expect(200)).body;
    expect((await get(a, `/events/${ev.id}/instant`)).body.mine.active).toBe(false);
    expect((await get(b, `/events/${ev.id}/instant`)).body.mine.active).toBe(false);
    expect((await get(members[2], `/events/${ev.id}/instant`)).body.waiting.count).toBe(3);
    await post(a, `/appointments/${appt.id}/chat`, { body: '정문 쪽이에요!' }).expect(201);
  });

  it('수락 후 10분 안에 취소하면 영향이 없고, 10분이 지나 시작 전에 취소하면 임박 취소다. 시작 뒤에는 취소할 수 없다', async () => {
    const { ev, a, b, id } = await sent();
    clock.current = kst('2026-12-12T16:00:00');
    const appt = (await post(b, `/proposals/${id}/accept`).expect(200)).body;
    clock.current = kst('2026-12-12T16:09:59');
    await post(a, `/appointments/${appt.id}/cancel`).expect(200);
    expect(await prisma.appointmentParticipant.findUniqueOrThrow({ where: { appointmentId_userId: { appointmentId: appt.id, userId: a.userId } } })).toMatchObject({ lateCancel: false });

    // 두 번째 약속 (16:00에 수락)
    clock.current = kst('2026-12-12T16:00:00');
    const [x, y] = await moreOn(ev, 'second');
    const w = { ev };
    const pid = (await send(x, w.ev, y).expect(201)).body.id;
    const second = (await post(y, `/proposals/${pid}/accept`).expect(200)).body;
    clock.current = kst('2026-12-12T16:11:00');
    await post(x, `/appointments/${second.id}/cancel`).expect(200);
    expect(await prisma.appointmentParticipant.findUniqueOrThrow({ where: { appointmentId_userId: { appointmentId: second.id, userId: x.userId } } })).toMatchObject({ lateCancel: true });

    clock.current = kst('2026-12-12T16:00:00');
    const [p0, p1] = await moreOn(ev, 'third');
    const pid3 = (await send(p0, ev, p1).expect(201)).body.id;
    const third = (await post(p1, `/proposals/${pid3}/accept`).expect(200)).body;
    clock.current = kst('2026-12-12T16:16:00'); // 시작(16:15) 뒤
    await post(p0, `/appointments/${third.id}/cancel`).expect(409);
  });

  it('10분이 지나면 만료되어 수락할 수 없다', async () => {
    const { b, id, a } = await sent();
    clock.current = kst('2026-12-12T16:10:00');
    expect((await post(b, `/proposals/${id}/accept`).expect(409)).body.code).toBe('PROPOSAL_STATE');
    expect((await get(a, '/me/proposals')).body[0].status).toBe('EXPIRED');
    await app.get(ProposalsService).expireDue();
  });

  it('거절하면 보낸 사람에게 알리고, 보낸 사람은 취소할 수 있다', async () => {
    const { ev, a, b, id } = await sent();
    await post(b, `/proposals/${id}/reject`).expect(200);
    expect(await kinds(a, 'PROPOSAL_REJECTED')).toBe(1);
    const [x, y] = await moreOn(ev, 'rej');
    const pid = (await send(x, ev, y).expect(201)).body.id;
    await post(x, `/proposals/${pid}/cancel`).expect(200);
    await post(y, `/proposals/${pid}/accept`).expect(409);
  });

  it('그사이 상대가 끄거나 차단하거나 제한이 생기면 수락할 수 없다', async () => {
    const { ev, a, b, id } = await sent();
    await http(app).delete(`/events/${ev.id}/instant`).set(auth(a.token)).expect(200);
    expect((await post(b, `/proposals/${id}/accept`).expect(400)).body.code).toBe('PROPOSAL_INVALID');

    const [x, y] = await moreOn(ev, 'blk');
    const pid = (await send(x, ev, y).expect(201)).body.id;
    await post(x, '/blocks', { userId: y.userId }).expect(200);
    expect((await post(y, `/proposals/${pid}/accept`).expect(409)).body.code).toBe('PROPOSAL_STATE'); // 차단하면 답을 기다리던 제안은 조용히 취소됨
  });

  it('받는 사람이 그 시간에 다른 약속이 생겼으면 수락할 수 없다', async () => {
    const { ev, a, b, id, members } = await sent();
    const day = ev.days[0];
    await prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.create({
        data: { senderId: members[2].userId, receiverId: b.userId, eventId: ev.id, eventDayId: day.id, segmentIds: [], meetingSpotId: ev.meetingSpots[0].id, date: day.date, segmentsSnapshot: [], meetingSpotName: '정문', status: 'ACCEPTED', expiresAt: kst('2026-11-08T00:00:00') },
      });
      await app.get(AppointmentsService).createFromProposal(tx, { id: proposal.id, eventId: ev.id, eventDayId: day.id, meetingSpotId: ev.meetingSpots[0].id, senderId: members[2].userId, receiverId: b.userId }, { date: day.date, startTime: '16:20', endTime: '18:00', segments: [] }, '정문');
    });
    expect((await post(b, `/proposals/${id}/accept`).expect(409)).body.code).toBe('APPOINTMENT_OVERLAP');
    void a;
  });

  it('받는 사람이 아니면 답할 수 없다', async () => {
    const { members: [, , c], id } = await sent();
    await post(c, `/proposals/${id}/accept`).expect(404);
  });
});

describe('만남 규칙은 그대로', () => {
  it('즉석 약속에서도 도착 기록·노쇼·도움 요청을 쓸 수 있고, 1시간 이하라 안전 확인은 묻지 않는다', async () => {
    const { ev, members: [a, b] } = await world();
    const id = (await send(a, ev, b, 60).expect(201)).body.id;
    const appt = (await post(b, `/proposals/${id}/accept`).expect(200)).body;
    clock.current = kst('2026-12-12T16:20:00'); // 시작 16:16 뒤
    expect((await get(a, `/appointments/${appt.id}`)).body.status).toBe('IN_PROGRESS');
    await post(a, `/appointments/${appt.id}/arrive`).expect(200);
    clock.current = kst('2026-12-12T16:35:00');
    expect((await get(a, `/appointments/${appt.id}`)).body.actions.reportNoShow).toBe(true);
    expect(await prisma.safetyCheck.count()).toBe(0);
    await post(b, `/appointments/${appt.id}/help`).expect(200);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe('ENDED_EARLY');
  });

  it('일반 제안은 그대로 전날 확인을 거친다', async () => {
    const { ev, members } = await fx.setup(['n1', 'n2']);
    clock.current = kst('2026-11-07T12:00:00');
    const sentP = await post(members[0], `/events/${ev.id}/proposals`, { receiverId: members[1].userId, eventDayId: ev.days[0].id, segmentIds: [ev.days[0].segments[1].id], meetingSpotId: ev.meetingSpots[0].id }).expect(201);
    expect(sentP.body.instant).toBeNull();
    const appt = (await post(members[1], `/proposals/${sentP.body.id}/accept`).expect(200)).body;
    expect(appt).toMatchObject({ status: 'PENDING_CONFIRM', instant: false });
  });
});
