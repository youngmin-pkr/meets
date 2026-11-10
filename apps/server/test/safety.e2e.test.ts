/**
 * 8단계: 만남 중 안전 — 도움 요청, 안전 확인(묻기·다시 묻기·알리기), 믿는 사람 링크
 *
 * 기준 약속: 12-12 '공연' 구간 18:00~20:30 (안전 확인은 19:00, 20:00)
 * 전날 확인 12-11 18:00 열림, 도착 버튼은 17:00부터
 */
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { appoint2, kst } from './safety-fixtures';
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

/** 두 사람이 공연 구간 약속을 만들고 둘 다 전날 확인 → 지정한 시각으로 */
async function started(at = '2026-12-12T18:00:00') {
  const s = await appoint2(app, clock);
  clock.current = kst(at);
  await http(app).get(`/appointments/${s.id}`).set(auth(s.a.token)).expect(200);
  return s;
}
const view = async (s: { id: string }, who: { token: string }) => (await http(app).get(`/appointments/${s.id}`).set(auth(who.token)).expect(200)).body;

describe('도움 요청', () => {
  it('도착 버튼이 열리기 전에는 쓸 수 없다', async () => {
    const s = await started('2026-12-12T12:00:00');
    expect((await view(s, s.a)).safety.canRequestHelp).toBe(false);
    const res = await http(app).post(`/appointments/${s.id}/help`).set(auth(s.a.token)).send({}).expect(409);
    expect(res.body.code).toBe('SAFETY_NOT_NOW');
  });

  it('열린 뒤에는 약속을 끝내고 운영팀에 가장 높은 우선순위로 접수한다', async () => {
    const s = await started('2026-12-12T17:10:00'); // 확정 상태(만남 시작 전)
    expect((await view(s, s.a)).safety.canRequestHelp).toBe(true);
    const res = await http(app).post(`/appointments/${s.id}/help`).set(auth(s.a.token)).send({}).expect(200);
    expect(res.body).toEqual({ ended: true, reported: true, trustedNotified: false });
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.status).toBe('ENDED_EARLY');
    expect(row.endReason).toBe('SAFETY');
    const report = await prisma.report.findFirstOrThrow({ where: { appointmentId: s.id } });
    expect(report).toMatchObject({ category: 'HELP_REQUEST', priority: 'HELP', status: 'QUEUED', reporterId: s.a.userId, targetId: s.b.userId });
  });

  it('상대에게는 이유 없이 취소로만 보이고, 알림에도 도움 요청이라는 말이 없다', async () => {
    const s = await started('2026-12-12T18:30:00');
    await http(app).post(`/appointments/${s.id}/help`).set(auth(s.a.token)).send({}).expect(200);
    const mine = await view(s, s.a);
    const theirs = await view(s, s.b);
    expect(theirs.end).toMatchObject({ reason: 'CANCELLED', byMe: false, late: false });
    expect(mine.end).toMatchObject({ reason: 'CANCELLED', byMe: true, late: false });
    const notes = await prisma.notification.findMany({ where: { userId: s.b.userId, appointmentId: s.id } });
    const texts = JSON.stringify(notes);
    expect(notes.some((n) => n.kind === 'APPOINTMENT_CANCELLED')).toBe(true);
    expect(texts).not.toMatch(/도움|벗어|HELP|SAFETY|신고/);
    // 상대의 신뢰 단계에는 영향이 없다 (신고 처리 전)
    expect(await prisma.report.count({ where: { targetId: s.b.userId } })).toBe(1);
  });

  it('도움 요청으로 끝나면 채팅이 바로 닫힌다', async () => {
    const s = await started('2026-12-12T18:30:00');
    await http(app).post(`/appointments/${s.id}/help`).set(auth(s.a.token)).send({}).expect(200);
    const send = await http(app).post(`/appointments/${s.id}/messages`).set(auth(s.b.token)).send({ body: '어디예요?' });
    expect(send.status).toBeGreaterThanOrEqual(400);
  });

  it('남의 약속이나 끝난 약속에는 쓸 수 없다', async () => {
    const s = await started('2026-12-12T18:30:00');
    const outsider = await appoint2(app, clock, { people: ['c', 'd'], skipClock: true, ev: s.ev });
    await http(app).post(`/appointments/${s.id}/help`).set(auth(outsider.a.token)).send({}).expect(404);
    await http(app).post(`/appointments/${s.id}/help`).set(auth(s.a.token)).send({}).expect(200);
    await http(app).post(`/appointments/${s.id}/help`).set(auth(s.b.token)).send({}).expect(409);
  });
});

describe('안전 확인', () => {
  it('시작 60분 뒤 묻고, 10분 뒤 다시 묻고, 믿는 사람 알림을 켠 경우에만 링크에 알린다', async () => {
    const s = await started('2026-12-12T18:30:00');
    await http(app).put('/me/safety-settings').set(auth(s.a.token)).send({ alertTrusted: true }).expect(200);
    await http(app).put('/me/safety-settings').set(auth(s.b.token)).send({ checkEnabled: false }).expect(200); // 상대는 끔
    const link = (await http(app).post(`/appointments/${s.id}/share-links`).set(auth(s.a.token)).send({ showStatus: true }).expect(201)).body;
    const token = link.url.split('/share/')[1];

    expect((await view(s, s.a)).safety.pendingCheck).toBeNull();

    clock.current = kst('2026-12-12T19:00:00');
    const v1 = await view(s, s.a);
    expect(v1.safety.pendingCheck).toMatchObject({ minutesSinceStart: 60 });
    expect(v1.needsAction).toBe(true);
    // 상대에게는 보이지 않는다
    expect((await view(s, s.b)).safety.pendingCheck).toBeNull();
    expect(await prisma.notification.count({ where: { userId: s.b.userId, kind: 'SAFETY_CHECK' } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: s.a.userId, kind: 'SAFETY_CHECK' } })).toBe(1);

    clock.current = kst('2026-12-12T19:10:00');
    await view(s, s.a);
    expect(await prisma.notification.count({ where: { userId: s.a.userId, kind: 'SAFETY_CHECK_REMIND' } })).toBe(1);
    expect((await http(app).get(`/share/${token}`).expect(200)).body.alert).toBeNull();

    clock.current = kst('2026-12-12T19:20:00');
    await view(s, s.a);
    const shared = (await http(app).get(`/share/${token}`).expect(200)).body;
    expect(shared.alert).toMatchObject({ kind: 'NO_RESPONSE' });

    // 여러 번 봐도 중복으로 알리거나 묻지 않는다
    await view(s, s.a);
    await view(s, s.a);
    expect(await prisma.notification.count({ where: { userId: s.a.userId, kind: { in: ['SAFETY_CHECK', 'SAFETY_CHECK_REMIND'] } } })).toBe(2);
  });

  it('믿는 사람 알림이 꺼져 있으면 답이 없어도 링크에 알리지 않는다', async () => {
    const s = await started('2026-12-12T18:30:00');
    const link = (await http(app).post(`/appointments/${s.id}/share-links`).set(auth(s.a.token)).send({ showStatus: true }).expect(201)).body;
    clock.current = kst('2026-12-12T19:30:00');
    await view(s, s.a);
    const shared = (await http(app).get(`/share/${link.url.split('/share/')[1]}`).expect(200)).body;
    expect(shared.alert).toBeNull();
  });

  it("'네, 괜찮아요'로 답하면 다시 묻지 않는다. 다음 확인은 60분 뒤", async () => {
    const s = await started('2026-12-12T19:00:00');
    const check = (await view(s, s.a)).safety.pendingCheck;
    await http(app).post(`/appointments/${s.id}/safety-checks/${check.id}/answer`).set(auth(s.a.token)).send({ answer: 'OK' }).expect(200);
    expect((await view(s, s.a)).safety.pendingCheck).toBeNull();
    clock.current = kst('2026-12-12T19:30:00');
    await view(s, s.a);
    expect(await prisma.notification.count({ where: { userId: s.a.userId, kind: 'SAFETY_CHECK_REMIND' } })).toBe(0);
    clock.current = kst('2026-12-12T20:00:00');
    expect((await view(s, s.a)).safety.pendingCheck).toMatchObject({ minutesSinceStart: 120 });
    expect(await prisma.safetyCheck.count({ where: { appointmentId: s.id, userId: s.a.userId } })).toBe(2);
  });

  it("'도움이 필요해요'로 답하면 도움 요청이 된다", async () => {
    const s = await started('2026-12-12T19:00:00');
    const check = (await view(s, s.a)).safety.pendingCheck;
    const res = await http(app).post(`/appointments/${s.id}/safety-checks/${check.id}/answer`).set(auth(s.a.token)).send({ answer: 'HELP' }).expect(200);
    expect(res.body.ended).toBe(true);
    expect((await prisma.report.findFirstOrThrow({ where: { appointmentId: s.id } })).priority).toBe('HELP');
  });

  it('안전 확인을 꺼 둔 사람에게는 묻지 않는다. 상대 것과 따로 센다', async () => {
    const s = await started('2026-12-12T18:30:00');
    await http(app).put('/me/safety-settings').set(auth(s.a.token)).send({ checkEnabled: false }).expect(200);
    clock.current = kst('2026-12-12T19:05:00');
    expect((await view(s, s.a)).safety.pendingCheck).toBeNull();
    expect((await view(s, s.b)).safety.pendingCheck).not.toBeNull();
  });

  it('남의 확인에는 답할 수 없다', async () => {
    const s = await started('2026-12-12T19:00:00');
    const check = (await view(s, s.a)).safety.pendingCheck;
    await http(app).post(`/appointments/${s.id}/safety-checks/${check.id}/answer`).set(auth(s.b.token)).send({ answer: 'OK' }).expect(404);
  });

  it('1시간보다 짧은 만남에는 묻지 않는다', async () => {
    const s = await appoint2(app, clock, { seg: 0 }); // 굿즈 줄 15:00~17:00 (2시간) → 16:00 한 번만
    clock.current = kst('2026-12-12T16:00:00');
    await http(app).get(`/appointments/${s.id}`).set(auth(s.a.token)).expect(200);
    clock.current = kst('2026-12-12T17:00:00');
    await http(app).get(`/appointments/${s.id}`).set(auth(s.a.token)).expect(200);
    expect(await prisma.safetyCheck.count({ where: { appointmentId: s.id, userId: s.a.userId } })).toBe(1);
  });
});

describe('믿는 사람 링크', () => {
  it('행사·시간·장소·동행 별명만 보이고, 계정·연락처 정보는 없다', async () => {
    const s = await started('2026-12-12T17:30:00');
    const link = (await http(app).post(`/appointments/${s.id}/share-links`).set(auth(s.a.token)).send({ showStatus: false }).expect(201)).body;
    expect(link.url).toMatch(/\/share\/[0-9a-f-]+\.[A-Za-z0-9_-]{22}$/);
    const shared = (await http(app).get(`/share/${link.url.split('/share/')[1]}`).expect(200)).body;
    expect(Object.keys(shared).sort()).toEqual(['alert', 'arrivedAt', 'companion', 'eventName', 'expiresAt', 'spotName', 'status', 'when']);
    expect(shared.companion).toBe(`테스트b`);
    expect(shared.status).toBeNull(); // 도착·종료 상태를 숨김
    const text = JSON.stringify(shared);
    expect(text).not.toContain(s.a.userId);
    expect(text).not.toContain(s.b.userId);
    expect(text).not.toContain(s.id);
  });

  it('도착·종료 상태를 켜면 도착하면 바뀐다', async () => {
    const s = await started('2026-12-12T17:30:00');
    const link = (await http(app).post(`/appointments/${s.id}/share-links`).set(auth(s.a.token)).send({ showStatus: true }).expect(201)).body;
    const token = link.url.split('/share/')[1];
    expect((await http(app).get(`/share/${token}`).expect(200)).body.status).toBe('UPCOMING');
    await http(app).post(`/appointments/${s.id}/arrive`).set(auth(s.a.token)).send({}).expect(200);
    expect((await http(app).get(`/share/${token}`).expect(200)).body.status).toBe('ARRIVED');
  });

  it('도움 요청으로 끝나도 링크에는 사유 없이 끝났다고만 보이고, 알림을 켠 경우에만 도움 안내가 뜬다', async () => {
    const s = await started('2026-12-12T18:30:00');
    await http(app).put('/me/safety-settings').set(auth(s.a.token)).send({ alertTrusted: true }).expect(200);
    const link = (await http(app).post(`/appointments/${s.id}/share-links`).set(auth(s.a.token)).send({ showStatus: true }).expect(201)).body;
    const res = await http(app).post(`/appointments/${s.id}/help`).set(auth(s.a.token)).send({}).expect(200);
    expect(res.body.trustedNotified).toBe(true);
    const shared = (await http(app).get(`/share/${link.url.split('/share/')[1]}`).expect(200)).body;
    expect(shared.status).toBe('ENDED');
    expect(shared.alert).toMatchObject({ kind: 'HELP' });
  });

  it('고친 주소·없는 주소·꺼진 링크·지난 링크는 모두 같은 답이다', async () => {
    const s = await started('2026-12-12T17:30:00');
    const link = (await http(app).post(`/appointments/${s.id}/share-links`).set(auth(s.a.token)).send({ showStatus: true }).expect(201)).body;
    const token = link.url.split('/share/')[1];
    const bodies: unknown[] = [];
    for (const t of [`${token.slice(0, -1)}x`, `${link.id}.AAAAAAAAAAAAAAAAAAAAAA`, 'nope', `${s.id}.${token.split('.')[1]}`]) {
      bodies.push((await http(app).get(`/share/${t}`).expect(404)).body);
    }
    await http(app).delete(`/share-links/${link.id}`).set(auth(s.a.token)).expect(200);
    bodies.push((await http(app).get(`/share/${token}`).expect(404)).body);
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  it('약속이 끝나고 6시간이 지나면 사라진다', async () => {
    const s = await started('2026-12-12T17:30:00');
    const link = (await http(app).post(`/appointments/${s.id}/share-links`).set(auth(s.a.token)).send({ showStatus: true }).expect(201)).body;
    const token = link.url.split('/share/')[1];
    clock.current = kst('2026-12-12T20:30:00');
    await http(app).get(`/share/${token}`).expect(200);
    clock.current = kst('2026-12-13T02:29:00');
    await http(app).get(`/share/${token}`).expect(200);
    clock.current = kst('2026-12-13T02:30:00');
    await http(app).get(`/share/${token}`).expect(404);
  });

  it('내 약속에만 만들 수 있고, 남의 링크는 끌 수 없고, 끝난 약속에는 만들 수 없다', async () => {
    const s = await started('2026-12-12T17:30:00');
    const other = await appoint2(app, clock, { people: ['c', 'd'], skipClock: true, ev: s.ev });
    await http(app).post(`/appointments/${s.id}/share-links`).set(auth(other.a.token)).send({ showStatus: true }).expect(404);
    const link = (await http(app).post(`/appointments/${s.id}/share-links`).set(auth(s.a.token)).send({ showStatus: true }).expect(201)).body;
    await http(app).delete(`/share-links/${link.id}`).set(auth(s.b.token)).expect(404);
    await http(app).delete(`/share-links/${link.id}`).set(auth(other.a.token)).expect(404);
    expect((await http(app).get(`/appointments/${s.id}/share-links`).set(auth(s.b.token)).expect(200)).body).toEqual([]);
    await http(app).post(`/appointments/${s.id}/help`).set(auth(s.a.token)).send({}).expect(200);
    await http(app).post(`/appointments/${s.id}/share-links`).set(auth(s.a.token)).send({ showStatus: true }).expect(409);
  });

  it('로그인 없이는 설정·링크 만들기를 쓸 수 없다', async () => {
    await http(app).get('/me/safety-settings').expect(401);
    await http(app).put('/me/safety-settings').send({ checkEnabled: false }).expect(401);
  });

  it('기본 설정은 안전 확인 켜짐, 믿는 사람 알림 꺼짐', async () => {
    const s = await started('2026-12-12T17:30:00');
    expect((await http(app).get('/me/safety-settings').set(auth(s.a.token)).expect(200)).body).toEqual({ checkEnabled: true, alertTrusted: false });
  });
});
