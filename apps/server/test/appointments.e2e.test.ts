/**
 * 4단계: 약속 확정·전날 확인·취소·도착·노쇼, 행사 변경·취소에 따른 변경, 겹치는 약속 막기, 알림함
 *
 * 기준 행사: 2026-12-12(토)·12-13(일), 구간 '굿즈 줄' 15:00~17:00, '공연' 18:00~20:30
 * 첫 날 '굿즈 줄' 약속 → 전날 확인 12-11 18:00 열림, 재촉 12-12 09:00, 마감 12-12 12:00,
 *                       무료 취소 12-11 15:00까지, 1시간 전 알림 14:00, 시작 15:00, 끝 17:00
 */
import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import { assertAppointmentTransition, APPOINTMENT_STATUSES } from '../src/appointments/appointment-transitions';
import { PrismaService } from '../src/prisma/prisma.service';
import { adminToken, ALL_TERMS, auth, eventInput, fakeToken, http, resetDb, startApp, TestClock } from './helpers';

let app: INestApplication;
let prisma: PrismaService;
const clock = new TestClock();

/** 한국 시간 → Date */
const kst = (s: string) => new Date(`${s}+09:00`);

beforeAll(async () => {
  app = await startApp(clock, false, () => 0.99); // 무작위 검수 없음
  prisma = app.get(PrismaService);
});

beforeEach(async () => {
  clock.current = kst('2026-11-07T12:00:00');
  await resetDb(app);
  // 테스트에서 시계를 한 달 넘게 앞으로 돌리므로, 로그인이 풀리지 않게 이 테스트에서만 로그인 유지 기간을 늘립니다.
  await prisma.policyValue.create({ data: { key: 'SESSION_TTL_DAYS', value: 365, effectiveFrom: kst('2026-01-01T00:00:00') } });
});

afterAll(async () => {
  await app.close();
});

const dayInput = (date: string, goods = ['15:00', '17:00']) => ({
  date,
  startTime: '15:00',
  endTime: '21:00',
  segments: [
    { label: '굿즈 줄', startTime: goods[0], endTime: goods[1] },
    { label: '공연', startTime: '18:00', endTime: '20:30' },
  ],
});
const spots = [
  { name: '정문 안내판 앞', isPublicPlace: true },
  { name: '관계자 통로', isPublicPlace: false },
];
const fullInput = (o: Record<string, unknown> = {}) => eventInput({ days: [dayInput('2026-12-12'), dayInput('2026-12-13')], meetingSpots: spots, ...o });

let managerSeq = 0;
async function manager() {
  return adminToken(app, 'EVENT_MANAGER', `manager${++managerSeq}`);
}

async function createEvent() {
  const res = await http(app).post('/admin/events').set(auth(await manager())).send(fullInput()).expect(201);
  return loadEvent(res.body.id);
}
function loadEvent(id: string) {
  return prisma.event.findUniqueOrThrow({
    where: { id },
    include: { days: { orderBy: { date: 'asc' }, include: { segments: { orderBy: { sortOrder: 'asc' } } } }, meetingSpots: true },
  });
}
type Ev = Awaited<ReturnType<typeof createEvent>>;

async function member(person: string) {
  const res = await http(app).post('/auth/identity').send({ verificationToken: fakeToken(person, '2000-01-01'), agreedTerms: ALL_TERMS }).expect(200);
  const token = res.body.sessionToken as string;
  await http(app).put('/me/profile').set(auth(token)).send({ nickname: `테스트${person}`, avatarColor: 'ink' }).expect(200);
  await http(app).put('/me/fandoms').set(auth(token)).send({ fandomIds: [] }).expect(200);
  await http(app).post('/me/notification-choice').set(auth(token)).send({ granted: false }).expect(200);
  const user = await prisma.user.findFirstOrThrow({ where: { nickname: `테스트${person}` } });
  return { token, userId: user.id };
}
type Member = Awaited<ReturnType<typeof member>>;

let ticketSeq = 0;
async function ready(token: string, ev: Ev) {
  await http(app)
    .put(`/events/${ev.id}/preference`)
    .set(auth(token))
    .send({
      days: ev.days.map((d) => ({ eventDayId: d.id, arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: d.segments.map((s) => s.id) })),
      tempoAnswers: [2, 2, 2],
      immersionAnswers: [2, 2],
      must: { gender: 'ANY', age: 'ANY', promises: [] },
    })
    .expect(200);
  const start = await http(app).post(`/events/${ev.id}/tickets`).set(auth(token)).send({ kind: 'TICKET' }).expect(201);
  const img = (await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } }).jpeg().toBuffer()).toString('base64');
  await http(app).post(`/tickets/${start.body.id}/image`).set(auth(token)).send({ imageBase64: img, mimeType: 'image/jpeg', masks: [] }).expect(200);
  await http(app)
    .post(`/tickets/${start.body.id}/confirm`)
    .set(auth(token))
    .send({ reservationNumber: `R${++ticketSeq}000`, admissibleDayIds: ev.days.map((d) => d.id) })
    .expect(200);
}

const proposal = (ev: Ev, receiverId: string, day = 0, seg = 0) => ({
  receiverId,
  eventDayId: ev.days[day].id,
  segmentIds: [ev.days[day].segments[seg].id],
  meetingSpotId: ev.meetingSpots.find((s) => s.isPublicPlace)!.id,
});
const send = (from: Member, ev: Ev, body: object) => http(app).post(`/events/${ev.id}/proposals`).set(auth(from.token)).send(body);

/** from이 to에게 제안하고 to가 수락 → 약속 id */
async function appoint(from: Member, to: Member, ev: Ev, day = 0, seg = 0) {
  const sent = await send(from, ev, proposal(ev, to.userId, day, seg)).expect(201);
  const accepted = await http(app).post(`/proposals/${sent.body.id}/accept`).set(auth(to.token)).expect(200);
  return accepted.body.id as string;
}

async function setup(people = ['a', 'b']) {
  const ev = await createEvent();
  const members: Member[] = [];
  for (const p of people) {
    const m = await member(p);
    await ready(m.token, ev);
    members.push(m);
  }
  return { ev, members };
}

const view = (m: Member, id: string) => http(app).get(`/appointments/${id}`).set(auth(m.token));
const act = (m: Member, id: string, action: string, body: object = {}) => http(app).post(`/appointments/${id}/${action}`).set(auth(m.token)).send(body);
const kinds = async (m: Member) => {
  const res = await http(app).get('/me/notifications').set(auth(m.token)).expect(200);
  return (res.body.items as Array<{ kind: string }>).map((n) => n.kind);
};

describe('약속 상태 전이 표 (정리문서 5장)', () => {
  const allowed = [
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
    if (allowed.some(([x, y]) => x === from && y === to)) expect(() => assertAppointmentTransition(from, to)).not.toThrow();
    else expect(() => assertAppointmentTransition(from, to)).toThrow(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
  });
});

describe('약속 만들기', () => {
  test('수락하면 확정 대기 약속이 생기고, 시간·전날 확인 일정이 함께 보인다', async () => {
    const { ev, members: [a, b] } = await setup();
    const id = await appoint(a, b, ev);
    const res = await view(a, id).expect(200);
    expect(res.body).toMatchObject({
      status: 'PENDING_CONFIRM',
      day: { date: '2026-12-12', startTime: '15:00' },
      segments: [{ label: '굿즈 줄' }],
      meetingSpot: { name: '정문 안내판 앞' },
      startsAt: kst('2026-12-12T15:00:00').toISOString(),
      endsAt: kst('2026-12-12T17:00:00').toISOString(),
      confirm: { opensAt: kst('2026-12-11T18:00:00').toISOString(), deadline: kst('2026-12-12T12:00:00').toISOString(), mine: false, theirs: false },
      freeCancelUntil: kst('2026-12-11T15:00:00').toISOString(),
      actions: { confirm: false, cancel: true, arrive: false, reportNoShow: false, reconfirm: false },
      needsAction: false,
    });
    const list = await http(app).get('/me/appointments').set(auth(b.token)).expect(200);
    expect(list.body).toEqual([expect.objectContaining({ id, counterpart: expect.objectContaining({ userId: a.userId }) })]);
  });

  test('약속에 없는 사람은 보거나 바꿀 수 없다 (서버에서 막음)', async () => {
    const { ev, members: [a, b, c] } = await setup(['a', 'b', 'c']);
    const id = await appoint(a, b, ev);
    await view(c, id).expect(404);
    await act(c, id, 'cancel').expect(404);
    await act(c, id, 'confirm').expect(404);
    await http(app).get(`/appointments/${id}`).expect(401);
  });

  test('정책 값이 바뀌어도 이미 만든 약속에는 소급하지 않는다', async () => {
    const { ev, members: [a, b] } = await setup();
    const id = await appoint(a, b, ev);
    await prisma.policyValue.create({ data: { key: 'APPOINTMENT_FREE_CANCEL_HOURS', value: 72, effectiveFrom: kst('2026-11-01T00:00:00') } });
    expect((await view(a, id)).body.freeCancelUntil).toBe(kst('2026-12-11T15:00:00').toISOString());
  });
});

describe('전날 확인', () => {
  test('전날 18시 전에는 누를 수 없다', async () => {
    const { ev, members: [a, b] } = await setup();
    const id = await appoint(a, b, ev);
    clock.current = kst('2026-12-11T17:59:00');
    const res = await act(a, id, 'confirm').expect(409);
    expect(res.body.code).toBe('APPOINTMENT_NOT_NOW');
    expect(res.body.message).toContain('12.11 (금) 18:00부터');
  });

  test("전날 18시에 둘 다 확인 요청을 받고, 둘 다 '갈 수 있어요'를 누르면 확정", async () => {
    const { ev, members: [a, b] } = await setup();
    const id = await appoint(a, b, ev);
    clock.current = kst('2026-12-11T18:00:00');
    expect(await kinds(a)).toContain('DAY_BEFORE_CONFIRM');
    expect(await kinds(b)).toContain('DAY_BEFORE_CONFIRM');
    expect((await view(a, id)).body).toMatchObject({ actions: { confirm: true }, needsAction: true });

    const first = await act(a, id, 'confirm').expect(200);
    expect(first.body).toMatchObject({ status: 'PENDING_CONFIRM', confirm: { mine: true, theirs: false }, actions: { confirm: false } });
    expect((await view(b, id)).body.confirm).toMatchObject({ mine: false, theirs: true });
    await act(a, id, 'confirm').expect(409);

    const second = await act(b, id, 'confirm').expect(200);
    expect(second.body.status).toBe('CONFIRMED');
    expect(await kinds(a)).toContain('APPOINTMENT_CONFIRMED');
    // 확인 요청 알림은 다시 봐도 한 번만
    expect((await kinds(a)).filter((k) => k === 'DAY_BEFORE_CONFIRM')).toHaveLength(1);
  });

  test('둘이 동시에 눌러도 한 번만 확정된다', async () => {
    const { ev, members: [a, b] } = await setup();
    const id = await appoint(a, b, ev);
    clock.current = kst('2026-12-11T19:00:00');
    await Promise.all([act(a, id, 'confirm').expect(200), act(b, id, 'confirm').expect(200)]);
    expect((await view(a, id)).body.status).toBe('CONFIRMED');
  });

  test('한 명만 확인하면: 다른 사람에게 재촉 1번 → 마감에 취소되고 무응답으로 기록', async () => {
    const { ev, members: [a, b] } = await setup();
    const id = await appoint(a, b, ev);
    clock.current = kst('2026-12-11T18:00:00');
    await act(a, id, 'confirm').expect(200);
    await kinds(b); // 확인 요청 받음

    clock.current = kst('2026-12-12T09:00:00');
    await kinds(b);
    clock.current = kst('2026-12-12T10:00:00');
    expect((await kinds(b)).filter((k) => k === 'DAY_BEFORE_REMINDER')).toHaveLength(1);
    expect(await kinds(a)).not.toContain('DAY_BEFORE_REMINDER');

    clock.current = kst('2026-12-12T12:00:00');
    const res = await view(b, id).expect(200);
    expect(res.body).toMatchObject({ status: 'CANCELLED', end: { reason: 'NO_CONFIRM', byMe: true } });
    expect((await view(a, id)).body.end).toMatchObject({ reason: 'NO_CONFIRM', byMe: false });
    const parts = await prisma.appointmentParticipant.findMany({ where: { appointmentId: id } });
    expect(parts.find((p) => p.userId === b.userId)!.noResponse).toBe(true);
    expect(parts.find((p) => p.userId === a.userId)!.noResponse).toBe(false);
    expect(await kinds(a)).toContain('NO_CONFIRM_PARTNER');
    expect(await kinds(b)).toContain('NO_CONFIRM_SELF');
    await act(b, id, 'confirm').expect(409);
  });

  test('아무도 보지 않아도 1분마다 도는 작업(settle)이 확인 요청과 마감을 처리한다', async () => {
    const { ev, members: [a, b] } = await setup();
    const id = await appoint(a, b, ev);
    const { AppointmentsService } = await import('../src/appointments/appointments.service');
    clock.current = kst('2026-12-11T18:00:00');
    await app.get(AppointmentsService).settle();
    expect(await prisma.notification.count({ where: { appointmentId: id, kind: 'DAY_BEFORE_CONFIRM' } })).toBe(2);
    clock.current = kst('2026-12-12T12:00:00');
    await app.get(AppointmentsService).settle();
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id } })).status).toBe('CANCELLED');
  });
});

describe('취소', () => {
  test('약속 24시간 전까지 취소하면 영향 없음, 상대에게 사유와 함께 알림', async () => {
    const { ev, members: [a, b] } = await setup();
    const id = await appoint(a, b, ev);
    const res = await act(a, id, 'cancel', { reason: 'SICK' }).expect(200);
    expect(res.body).toMatchObject({ status: 'CANCELLED', end: { reason: 'CANCELLED', byMe: true, cancelReason: '몸이 안 좋아요', late: false } });
    const part = await prisma.appointmentParticipant.findUniqueOrThrow({ where: { appointmentId_userId: { appointmentId: id, userId: a.userId } } });
    expect(part.lateCancel).toBe(false);
    const notes = await http(app).get('/me/notifications').set(auth(b.token)).expect(200);
    expect(notes.body.items[0]).toMatchObject({ kind: 'APPOINTMENT_CANCELLED', body: '테스트a님이 테스트 밴드 콘서트 약속을 취소했어요. 사유: 몸이 안 좋아요', appointmentId: id });
    expect((await view(b, id)).body.end).toMatchObject({ byMe: false, late: false });
    await act(b, id, 'cancel').expect(409);
  });

  test('24시간 안에 취소하면 임박 취소로 기록 (확정된 약속도 취소 가능)', async () => {
    const { ev, members: [a, b] } = await setup();
    const id = await appoint(a, b, ev);
    clock.current = kst('2026-12-11T18:00:00');
    await act(a, id, 'confirm').expect(200);
    await act(b, id, 'confirm').expect(200);
    clock.current = kst('2026-12-12T10:00:00');
    const res = await act(b, id, 'cancel').expect(200);
    expect(res.body.end).toMatchObject({ reason: 'CANCELLED', late: true, cancelReason: null });
    const part = await prisma.appointmentParticipant.findUniqueOrThrow({ where: { appointmentId_userId: { appointmentId: id, userId: b.userId } } });
    expect(part.lateCancel).toBe(true);
  });

  test('없는 사유는 받지 않는다', async () => {
    const { ev, members: [a, b] } = await setup();
    const id = await appoint(a, b, ev);
    await act(a, id, 'cancel', { reason: '010-1234-5678' }).expect(400);
  });
});

describe('약속 당일', () => {
  async function confirmed() {
    const { ev, members } = await setup();
    const [a, b] = members;
    const id = await appoint(a, b, ev);
    clock.current = kst('2026-12-11T18:00:00');
    await act(a, id, 'confirm').expect(200);
    await act(b, id, 'confirm').expect(200);
    return { ev, a, b, id };
  }

  test('1시간 전 알림, 도착 기록과 상대 도착 알림, 시작·끝', async () => {
    const { a, b, id } = await confirmed();
    clock.current = kst('2026-12-12T13:30:00');
    await act(a, id, 'arrive').expect(409);

    clock.current = kst('2026-12-12T14:00:00');
    expect(await kinds(a)).toContain('APPOINTMENT_SOON');
    const arrived = await act(a, id, 'arrive').expect(200);
    expect(arrived.body.arrival.mine).toBe(kst('2026-12-12T14:00:00').toISOString());
    expect(await kinds(b)).toContain('PARTNER_ARRIVED');
    expect((await view(b, id)).body.arrival.theirs).not.toBeNull();

    clock.current = kst('2026-12-12T15:00:00');
    expect((await view(a, id)).body.status).toBe('IN_PROGRESS');
    await act(b, id, 'arrive').expect(200);
    await act(a, id, 'cancel').expect(409);

    clock.current = kst('2026-12-12T17:00:00');
    expect((await view(a, id)).body).toMatchObject({ status: 'ENDED', end: null });
  });

  test("'안 나왔어요'는 내가 도착했고 상대 기록이 없을 때 15분 뒤부터 → 중간 종료", async () => {
    const { a, b, id } = await confirmed();
    clock.current = kst('2026-12-12T14:50:00');
    await act(a, id, 'arrive').expect(200);
    clock.current = kst('2026-12-12T15:14:00');
    await act(a, id, 'no-show').expect(409);
    // 도착 기록이 없는 사람은 누를 수 없음
    clock.current = kst('2026-12-12T15:15:00');
    await act(b, id, 'no-show').expect(409);

    const res = await act(a, id, 'no-show').expect(200);
    expect(res.body).toMatchObject({ status: 'ENDED_EARLY', end: { reason: 'NO_SHOW', byMe: true } });
    expect(await kinds(b)).toContain('APPOINTMENT_ENDED_EARLY');
    // 양쪽 도착 기록을 비교할 수 있도록 남아 있음
    const parts = await prisma.appointmentParticipant.findMany({ where: { appointmentId: id } });
    expect(parts.find((p) => p.userId === a.userId)).toMatchObject({ arrivedAt: expect.any(Date), noShowReportedAt: expect.any(Date) });
    expect(parts.find((p) => p.userId === b.userId)).toMatchObject({ arrivedAt: null });
  });

  test('보지 않는 사이 약속 시간이 다 지나도 시작 → 끝 순서로 처리된다', async () => {
    const { a, id } = await confirmed();
    clock.current = kst('2026-12-12T18:00:00');
    expect((await view(a, id)).body.status).toBe('ENDED');
  });
});

describe('행사 일정이 바뀔 때', () => {
  async function twoAppointments() {
    const { ev, members } = await setup();
    const [a, b] = members;
    const first = await appoint(a, b, ev, 0, 0); // 12-12 굿즈 줄
    const second = await appoint(b, a, ev, 1, 1); // 12-13 공연
    return { ev, a, b, first, second };
  }

  test("시간이 달라진 약속만 '다시 정하기'가 되고, 둘 다 다시 확인하면 바뀐 시간으로 확정", async () => {
    const { ev, a, b, first, second } = await twoAppointments();
    const token = await manager();
    const changed = fullInput({ days: [dayInput('2026-12-12', ['16:00', '17:30']), dayInput('2026-12-13')] });

    const ask = await http(app).put(`/admin/events/${ev.id}`).set(auth(token)).send(changed).expect(409);
    expect(ask.body).toMatchObject({ code: 'CONFIRM_REQUIRED', detail: { affectedAppointments: 1 } });
    await http(app).put(`/admin/events/${ev.id}`).set(auth(token)).send({ ...changed, confirmed: true }).expect(200);

    const res = await view(a, first).expect(200);
    expect(res.body).toMatchObject({
      status: 'RESCHEDULING',
      reschedule: {
        deadline: kst('2026-11-09T12:00:00').toISOString(),
        mine: false,
        theirs: false,
        newSchedule: { date: '2026-12-12', startTime: '16:00', endTime: '17:30' },
      },
      actions: { reconfirm: true, cancel: false },
    });
    expect((await view(a, second)).body.status).toBe('PENDING_CONFIRM');
    expect(await kinds(a)).toContain('EVENT_SCHEDULE_CHANGED');
    expect(await kinds(b)).toContain('EVENT_SCHEDULE_CHANGED');

    expect((await act(a, first, 'confirm').expect(200)).body.status).toBe('RESCHEDULING');
    const done = await act(b, first, 'confirm').expect(200);
    expect(done.body).toMatchObject({ status: 'CONFIRMED', day: { startTime: '16:00' }, segments: [{ label: '굿즈 줄', startTime: '16:00' }] });
  });

  test('기한 안에 정하지 못하면 보류 (취소가 아님)', async () => {
    const { ev, a, first } = await twoAppointments();
    const changed = fullInput({ days: [dayInput('2026-12-12', ['16:00', '17:30']), dayInput('2026-12-13')], confirmed: true });
    await http(app).put(`/admin/events/${ev.id}`).set(auth(await manager())).send(changed).expect(200);
    clock.current = kst('2026-11-09T12:00:00');
    expect((await view(a, first)).body).toMatchObject({ status: 'ON_HOLD', end: null, actions: { reconfirm: false } });
    expect(await kinds(a)).toContain('APPOINTMENT_ON_HOLD');
  });

  test('약속한 날이 없어지면: 날짜·구간·장소 이름은 남고, 다시 정할 수 없다. 사용자가 고른 다른 날은 그대로', async () => {
    const { ev, a, b, first, second } = await twoAppointments();
    const before = await loadEvent(ev.id);
    // 첫 날을 빼고 만날 장소 이름도 바꿈 (이전에는 제안·약속이 있으면 행사 수정이 실패했음)
    const changed = fullInput({ days: [dayInput('2026-12-13')], meetingSpots: [{ name: '새 안내판 앞', isPublicPlace: true }], confirmed: true });
    await http(app).put(`/admin/events/${ev.id}`).set(auth(await manager())).send(changed).expect(200);

    const res = await view(a, first).expect(200);
    expect(res.body).toMatchObject({
      status: 'RESCHEDULING',
      day: { id: null, date: '2026-12-12' },
      segments: [{ label: '굿즈 줄' }],
      meetingSpot: { id: null, name: '정문 안내판 앞' },
      reschedule: { newSchedule: null },
      actions: { reconfirm: false },
    });
    const no = await act(a, first, 'confirm').expect(409);
    expect(no.body.code).toBe('APPOINTMENT_NOT_NOW');
    // 남은 날은 같은 id 그대로 (사용자가 고른 날·티켓 입장일이 지워지지 않음)
    const after = await loadEvent(ev.id);
    expect(after.days.map((d) => d.id)).toEqual([before.days[1].id]);
    expect(after.days[0].segments.map((s) => s.id)).toEqual(before.days[1].segments.map((s) => s.id));
    expect((await view(b, second)).body).toMatchObject({ status: 'PENDING_CONFIRM', meetingSpot: { name: '정문 안내판 앞' } });
  });

  test('이름만 고치는 수정은 약속을 바꾸지 않는다', async () => {
    const { ev, a, first } = await twoAppointments();
    await http(app).put(`/admin/events/${ev.id}`).set(auth(await manager())).send(fullInput({ name: '이름 고침' })).expect(200);
    expect((await view(a, first)).body.status).toBe('PENDING_CONFIRM');
  });

  test('바뀐 시간이 내 다른 약속과 겹치면 다시 확인할 수 없다', async () => {
    const { ev, members } = await setup(['a', 'b', 'c']);
    const [a, b, c] = members;
    const first = await appoint(a, b, ev, 0, 0); // 15:00~17:00
    await appoint(c, a, ev, 0, 1); // 18:00~20:30
    const changed = fullInput({ days: [dayInput('2026-12-12', ['17:30', '19:00']), dayInput('2026-12-13')], confirmed: true });
    await http(app).put(`/admin/events/${ev.id}`).set(auth(await manager())).send(changed).expect(200);
    const res = await act(a, first, 'confirm').expect(409);
    expect(res.body.code).toBe('APPOINTMENT_OVERLAP');
  });
});

describe('행사가 취소될 때', () => {
  test('약속은 자동 종료되고 안내가 간다 (운영자 2명 확인)', async () => {
    const { ev, members: [a, b] } = await setup();
    const id = await appoint(a, b, ev);
    const p = await http(app).post(`/admin/events/${ev.id}/cancel-proposals`).set(auth(await manager())).send({ reason: '공연 취소 공지' }).expect(201);
    await http(app).post(`/admin/event-cancellations/${p.body.id}/confirm`).set(auth(await adminToken(app, 'ADMIN'))).expect(200);
    expect((await view(a, id)).body).toMatchObject({ status: 'AUTO_ENDED', end: { reason: 'EVENT_CANCELLED', byMe: false } });
    expect(await kinds(a)).toContain('EVENT_CANCELLED');
    expect(await kinds(b)).toContain('EVENT_CANCELLED');
  });
});

describe('겹치는 약속 막기', () => {
  test('내 약속과 시간이 겹치면 제안을 보낼 수 없고, 안 겹치는 구간은 보낼 수 있다', async () => {
    const { ev, members } = await setup(['a', 'b', 'c']);
    const [a, b, c] = members;
    await appoint(a, b, ev, 0, 0); // 12-12 15:00~17:00
    const res = await send(a, ev, proposal(ev, c.userId, 0, 0)).expect(409);
    expect(res.body).toMatchObject({ code: 'APPOINTMENT_OVERLAP', message: '그 시간에 이미 다른 약속이 있어요.' });
    await send(a, ev, proposal(ev, c.userId, 0, 1)).expect(201);
  });

  test('수락할 때 내 약속이나 보낸 사람의 약속과 겹치면 수락할 수 없다', async () => {
    const { ev, members } = await setup(['a', 'b', 'c', 'd']);
    const [a, b, c, d] = members;
    // 나(b)에게 이미 약속이 있음
    await appoint(a, b, ev, 0, 0);
    const toB = await send(c, ev, proposal(ev, b.userId, 0, 0)).expect(201);
    const mine = await http(app).post(`/proposals/${toB.body.id}/accept`).set(auth(b.token)).expect(409);
    expect(mine.body.message).toBe('그 시간에 이미 다른 약속이 있어요.');

    // 보낸 사람(c)이 그사이 다른 약속을 잡음
    const toD = await send(c, ev, proposal(ev, d.userId, 1, 0)).expect(201);
    await appoint(c, a, ev, 1, 0);
    const theirs = await http(app).post(`/proposals/${toD.body.id}/accept`).set(auth(d.token)).expect(409);
    expect(theirs.body.message).toContain('상대에게 그 시간에 다른 약속');
  });

  test('취소된 약속과는 겹쳐도 된다', async () => {
    const { ev, members } = await setup(['a', 'b', 'c']);
    const [a, b, c] = members;
    const id = await appoint(a, b, ev, 0, 0);
    await act(a, id, 'cancel').expect(200);
    await send(a, ev, proposal(ev, c.userId, 0, 0)).expect(201);
  });
});

describe('알림함과 홈 요약', () => {
  test('제안 도착·수락·거절 알림, 읽음 표시, 홈 요약', async () => {
    const { ev, members } = await setup(['a', 'b', 'c']);
    const [a, b, c] = members;
    const sent = await send(a, ev, proposal(ev, b.userId)).expect(201);
    const inbox = await http(app).get('/me/notifications').set(auth(b.token)).expect(200);
    expect(inbox.body).toMatchObject({
      unread: 1,
      items: [{ kind: 'PROPOSAL_RECEIVED', title: '새 제안이 왔어요', proposalId: sent.body.id, read: false, body: expect.stringContaining('11.8 (일) 12:00까지') }],
    });
    expect((await http(app).get('/me/home').set(auth(b.token)).expect(200)).body).toEqual({ unreadNotifications: 1, hasVerifiedTicket: true });

    await http(app).post(`/proposals/${sent.body.id}/accept`).set(auth(b.token)).expect(200);
    expect(await kinds(a)).toEqual(['PROPOSAL_ACCEPTED']);

    const toC = await send(a, ev, proposal(ev, c.userId, 1, 0)).expect(201);
    await http(app).post(`/proposals/${toC.body.id}/reject`).set(auth(c.token)).expect(200);
    expect((await kinds(a))[0]).toBe('PROPOSAL_REJECTED');

    await http(app).post('/me/notifications/read').set(auth(b.token)).expect(200);
    const after = await http(app).get('/me/notifications').set(auth(b.token)).expect(200);
    expect(after.body.unread).toBe(0);
    expect(after.body.items.every((n: { read: boolean }) => n.read)).toBe(true);
  });

  test('방해 금지 시간(22시~8시)에 생긴 알림은 푸시 시각을 아침 8시로 미룬다', async () => {
    const { ev, members: [a, b] } = await setup();
    clock.current = kst('2026-11-07T23:00:00');
    await send(a, ev, proposal(ev, b.userId)).expect(201);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: b.userId } });
    expect(n.pushAt).toEqual(kst('2026-11-08T08:00:00'));
  });

  test('다른 사람의 알림은 보이지 않는다', async () => {
    const { ev, members: [a, b] } = await setup();
    await send(a, ev, proposal(ev, b.userId)).expect(201);
    expect((await http(app).get('/me/notifications').set(auth(a.token)).expect(200)).body).toEqual({ items: [], unread: 0 });
  });
});
