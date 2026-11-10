/**
 * 10-1단계: 즉석 동행 — 행사장에 있다고 알리기, 대기(5명 기준), 후보
 * 기준 행사: 2026-12-12(토) 15:00~21:00. 시계는 행사 당일 오후로 둡니다.
 */
import type { INestApplication } from '@nestjs/common';
import { InstantService } from '../src/instant/instant.service';
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
const get = (m: M, path: string) => http(app).get(path).set(auth(m.token));
const put = (m: M, path: string, body: object = {}) => http(app).put(path).set(auth(m.token)).send(body);
const del = (m: M, path: string) => http(app).delete(path).set(auth(m.token));
const kinds = async (m: M, kind: string) => (await prisma.notification.findMany({ where: { userId: m.userId, kind: kind as never } })).length;
const NOW = '2026-12-12T16:00:00';

/** 행사와, 입력(스타일)을 마친 사람 n명 (기본 일정은 행사 당일 15:00~21:00) */
async function world(n: number) {
  const { ev, members } = await fx.setup(Array.from({ length: n }, (_, i) => `i${i + 1}`));
  clock.current = kst(NOW);
  return { ev, members };
}
const on = (m: M, ev: { id: string }) => put(m, `/events/${ev.id}/instant`);

describe('쓸 수 있는 때', () => {
  it('행사 당일 행사 시간 안에서만 켤 수 있고, 지금부터 60분의 시간대를 알려 준다', async () => {
    const { ev, members: [a] } = await world(1);
    const s = (await get(a, `/events/${ev.id}/instant`).expect(200)).body;
    expect(s).toMatchObject({ available: true, closedReason: null, window: { from: '16:00', to: '17:00', minutes: 60 }, mine: { active: false }, waiting: { count: 0, min: 5, open: false } });
    clock.current = kst('2026-12-11T16:00:00');
    expect((await get(a, `/events/${ev.id}/instant`).expect(200)).body).toMatchObject({ available: false, closedReason: 'NOT_TODAY' });
    expect((await on(a, ev).expect(409)).body.code).toBe('INSTANT_NOT_NOW');
    clock.current = kst('2026-12-12T14:59:00');
    expect((await get(a, `/events/${ev.id}/instant`)).body.closedReason).toBe('NOT_STARTED');
    clock.current = kst('2026-12-12T20:40:00');
    expect((await get(a, `/events/${ev.id}/instant`)).body.closedReason).toBe('ENDED');
  });

  it('로그인이 없으면 쓸 수 없다. 없는 행사는 찾을 수 없다', async () => {
    const { ev, members: [a] } = await world(1);
    await http(app).get(`/events/${ev.id}/instant`).expect(401);
    await get(a, '/events/00000000-0000-4000-8000-000000000000/instant').expect(404);
  });

  it('청소년·이용 정지·최근 확인된 노쇼·이용 제한이 있으면 쓸 수 없다', async () => {
    const { ev, members: [a, b, c] } = await world(3);
    await prisma.user.update({ where: { id: a.userId }, data: { ageClass: 'TEEN' } });
    expect((await get(a, `/events/${ev.id}/instant`)).body).toMatchObject({ available: false, closedReason: 'NOT_ALLOWED' });
    expect((await on(a, ev).expect(409)).body.code).toBe('INSTANT_NOT_NOW');
    // 최근 확인된 노쇼
    const g = await prisma.appointment.create({
      data: {
        proposal: { create: { senderId: b.userId, receiverId: c.userId, eventId: ev.id, eventDayId: ev.days[0].id, segmentIds: [], meetingSpotId: ev.meetingSpots[0].id, date: ev.days[0].date, segmentsSnapshot: [], meetingSpotName: '정문', status: 'ACCEPTED', expiresAt: kst('2026-11-08T00:00:00') } },
        event: { connect: { id: ev.id } },
        eventDay: { connect: { id: ev.days[0].id } },
        segmentIds: [], date: ev.days[0].date, startTime: '15:00', endTime: '17:00', segmentsSnapshot: [], meetingSpotName: '정문', policy: {}, status: 'ENDED', endedAt: kst('2026-12-05T17:00:00'),
        participants: { create: [{ userId: b.userId, noShowConfirmed: true }, { userId: c.userId }] },
      },
    });
    expect(g.id).toBeTruthy();
    expect((await get(b, `/events/${ev.id}/instant`)).body.closedReason).toBe('NOT_ALLOWED');
    expect((await get(c, `/events/${ev.id}/instant`)).body.available).toBe(true); // 상대 쪽은 영향 없음
  });
});

describe('켜기와 끄기', () => {
  it('켜면 60분 동안 유지되고, 시간이 지나면 저절로 꺼지고, 끌 수 있다', async () => {
    const { ev, members: [a] } = await world(1);
    const s = (await on(a, ev).expect(200)).body;
    expect(s.mine).toEqual({ active: true, until: kst('2026-12-12T17:00:00').toISOString() });
    clock.current = kst('2026-12-12T16:59:00');
    expect((await get(a, `/events/${ev.id}/instant`)).body.mine.active).toBe(true);
    clock.current = kst('2026-12-12T17:00:00');
    expect((await get(a, `/events/${ev.id}/instant`)).body.mine.active).toBe(false);
    await on(a, ev).expect(200);
    expect((await del(a, `/events/${ev.id}/instant`).expect(200)).body.mine.active).toBe(false);
    expect(await prisma.instantPresence.count({ where: { userId: a.userId } })).toBe(1); // 한 행사에 한 줄
  });

  it('다시 켜면 시간이 다시 60분이 되고, 행사가 끝날 시각을 넘지 않는다', async () => {
    const { ev, members: [a] } = await world(1);
    await on(a, ev).expect(200);
    clock.current = kst('2026-12-12T16:30:00');
    expect((await on(a, ev).expect(200)).body.mine.until).toBe(kst('2026-12-12T17:30:00').toISOString());
    clock.current = kst('2026-12-12T20:30:00');
    expect((await on(a, ev).expect(200)).body.mine.until).toBe(kst('2026-12-12T21:00:00').toISOString()); // 행사 끝
  });

  it('저장된 입력이 없으면 간단한 스타일 질문에 답해야 켤 수 있다', async () => {
    const { ev } = await world(1);
    const n = await fx.member('nostyle');
    expect((await get(n, `/events/${ev.id}/instant`)).body.needsStyle).toBe(true);
    expect((await on(n, ev).expect(409)).body.code).toBe('INSTANT_NEEDS_STYLE');
    await put(n, `/events/${ev.id}/instant`, { style: { tempoAnswers: [2, 2, 2], immersionAnswers: [2, 2] } }).expect(200);
    expect((await get(n, `/events/${ev.id}/instant`)).body.mine.active).toBe(true);
    await put(n, `/events/${ev.id}/instant`, { style: { tempoAnswers: [9, 2, 2], immersionAnswers: [2, 2] } }).expect(400);
  });

  it('위치 같은 값은 받지 않고, 저장하지도 않는다', async () => {
    const { ev, members: [a] } = await world(1);
    await put(a, `/events/${ev.id}/instant`, { latitude: 37.5, longitude: 127.0 }).expect(400);
    const cols = (await prisma.$queryRaw<Array<{ column_name: string }>>`SELECT column_name FROM information_schema.columns WHERE table_name = 'InstantPresence'`).map((c) => c.column_name);
    expect(cols.some((c) => /lat|lng|lon|geo|location|coord/i.test(c))).toBe(false);
  });
});

describe('대기와 후보 (나를 뺀 5명 기준)', () => {
  it('5명 미만이면 사람 수만 알려 주고 후보는 볼 수 없다', async () => {
    const { ev, members } = await world(5); // 나 + 4명
    for (const m of members) await on(m, ev).expect(200);
    const s = (await get(members[0], `/events/${ev.id}/instant`)).body;
    expect(s.waiting).toEqual({ count: 4, min: 5, open: false });
    const res = await get(members[0], `/events/${ev.id}/instant/candidates`).expect(409);
    expect(res.body.code).toBe('INSTANT_NOT_NOW');
    expect(JSON.stringify(s)).not.toMatch(/테스트i2/); // 개인은 보이지 않음
  });

  it('나를 뺀 5명이 되면 열리고, 후보에는 나와 차단한 사람이 없다', async () => {
    const { ev, members } = await world(6);
    for (const m of members) await on(m, ev).expect(200);
    const mine = members[0];
    expect((await get(mine, `/events/${ev.id}/instant`)).body.waiting).toEqual({ count: 5, min: 5, open: true });
    const list = (await get(mine, `/events/${ev.id}/instant/candidates`).expect(200)).body;
    expect(list.total).toBe(5);
    expect(list.candidates.map((c: { userId: string }) => c.userId)).not.toContain(mine.userId);
    const first = list.candidates[0];
    expect(first.overlaps[0]).toMatchObject({ from: '16:00', to: '17:00', minutes: 60 });
    const detail = (await get(mine, `/events/${ev.id}/instant/candidates/${first.userId}`).expect(200)).body;
    expect(detail.userId).toBe(first.userId);
    // 차단하면 서로 숨고, 사람 수도 줄어 5명 미만이면 닫힌다
    await http(app).post('/blocks').set(auth(mine.token)).send({ userId: first.userId }).expect(200);
    expect((await get(mine, `/events/${ev.id}/instant`)).body.waiting).toMatchObject({ count: 4, open: false });
    expect((await get(members.find((m) => m.userId === first.userId)!, `/events/${ev.id}/instant`)).body.waiting.count).toBe(4);
  });

  it('켜지 않은 사람, 시간이 지난 사람은 세지 않는다', async () => {
    const { ev, members } = await world(7);
    for (const m of members.slice(0, 6)) await on(m, ev).expect(200);
    expect((await get(members[6], `/events/${ev.id}/instant`)).body.waiting.count).toBe(6); // 안 켠 나도 현황은 봄
    expect((await get(members[6], `/events/${ev.id}/instant/candidates`).expect(409)).body.code).toBe('INSTANT_NOT_NOW'); // 켜야 후보를 봄
    clock.current = kst('2026-12-12T17:00:00');
    expect((await get(members[6], `/events/${ev.id}/instant`)).body.waiting.count).toBe(0);
  });

  it('나와 시간이 30분 이상 겹쳐야 후보다 (켜 둔 시간이 끝나 가는 사람은 빠짐)', async () => {
    const { ev, members } = await world(7);
    clock.current = kst('2026-12-12T15:40:00');
    for (const m of members.slice(1)) await on(m, ev).expect(200); // 6명이 15:40~16:40
    clock.current = kst('2026-12-12T16:20:00');
    await on(members[0], ev).expect(200); // 나는 16:20~17:20 → 겹침 20분
    expect((await get(members[0], `/events/${ev.id}/instant`)).body.waiting.count).toBe(6);
    expect((await get(members[0], `/events/${ev.id}/instant/candidates`).expect(200)).body.total).toBe(0);
  });

  it('후보 조건(나이·성별)은 양쪽을 모두 확인한다', async () => {
    const { ev, members } = await world(6);
    for (const m of members) await on(m, ev).expect(200);
    const me = members[0];
    await prisma.preference.updateMany({ where: { userId: me.userId }, data: { mustGender: 'SAME' } });
    const myGender = (await prisma.identityVerification.findUniqueOrThrow({ where: { userId: me.userId } })).gender;
    await prisma.identityVerification.updateMany({ where: { userId: { in: members.slice(1, 3).map((m) => m.userId) } }, data: { gender: myGender === 'F' ? 'M' : 'F' } });
    const list = (await get(me, `/events/${ev.id}/instant/candidates`).expect(200)).body;
    expect(list.total).toBe(3);
  });
});

describe('대기 알림 (후보가 열릴 때 하루 한 번)', () => {
  it('대기 중에 켠 사람에게 후보가 열리면 한 번만 알린다', async () => {
    const { ev, members } = await world(6);
    const instant = app.get(InstantService);
    for (const m of members.slice(0, 5)) await on(m, ev).expect(200); // 나(0)는 4명을 보며 대기
    await instant.settleAll();
    expect(await kinds(members[0], 'INSTANT_READY')).toBe(0);
    await on(members[5], ev).expect(200); // 이제 나를 뺀 5명
    await instant.settleAll();
    await instant.settleAll();
    for (const m of members.slice(0, 5)) expect(await kinds(m, 'INSTANT_READY')).toBe(1);
    expect(await kinds(members[5], 'INSTANT_READY')).toBe(0); // 이미 열린 상태에서 켠 사람에게는 보내지 않음
  });

  it('같은 날 다시 켜도 다시 알리지 않는다', async () => {
    const { ev, members } = await world(6);
    const instant = app.get(InstantService);
    for (const m of members.slice(0, 5)) await on(m, ev).expect(200);
    await on(members[5], ev).expect(200);
    await instant.settleAll();
    await del(members[5], `/events/${ev.id}/instant`).expect(200);
    await on(members[0], ev).expect(200); // 다시 켬 (4명 → 대기)
    await on(members[5], ev).expect(200);
    await instant.settleAll();
    expect(await kinds(members[0], 'INSTANT_READY')).toBe(1);
  });

  it('하루가 지난 기록은 지워진다', async () => {
    const { ev, members: [a] } = await world(1);
    await on(a, ev).expect(200);
    clock.current = kst('2026-12-13T17:01:00');
    await app.get(InstantService).settleAll();
    expect(await prisma.instantPresence.count()).toBe(0);
  });
});

describe('오늘 쓸 수 있는 행사 (홈의 지금 갈래요)', () => {
  it('오늘 열리고 시간이 맞는 행사만 보이고, 켜면 표시된다', async () => {
    const { ev, members: [a] } = await world(1);
    let list = (await get(a, '/me/instant-events').expect(200)).body;
    expect(list).toEqual([{ event: { id: ev.id, name: expect.any(String), venue: expect.any(String) }, active: false }]);
    await on(a, ev).expect(200);
    list = (await get(a, '/me/instant-events').expect(200)).body;
    expect(list[0].active).toBe(true);
    clock.current = kst('2026-12-11T12:00:00');
    expect((await get(a, '/me/instant-events').expect(200)).body).toEqual([]);
  });
});
