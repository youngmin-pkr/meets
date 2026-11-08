/**
 * 6단계: 티켓 인증 (사용자 흐름, 운영자 검수, 이미지 삭제, 중복 예매번호, 매칭 반영)
 */
import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertTicketTransition, TICKET_STATUSES } from '../src/tickets/ticket-transitions';
import { adminToken, ALL_TERMS, auth, eventInput, fakeToken, http, resetDb, startApp, TestClock } from './helpers';

let app: INestApplication;
let prisma: PrismaService;
const clock = new TestClock();
let dice = 0.99; // 무작위 점검에 걸리지 않게 기본값을 크게 둠

beforeAll(async () => {
  app = await startApp(clock, false, () => dice);
  prisma = app.get(PrismaService);
});

beforeEach(async () => {
  dice = 0.99;
  clock.current = new Date('2026-11-07T03:00:00Z');
  await resetDb(app);
});

afterAll(async () => {
  await app.close();
});

async function createEvent(overrides: Record<string, unknown> = {}) {
  const admin = await adminToken(app, 'EVENT_MANAGER', `m${Math.random().toString(36).slice(2, 8)}`);
  const day = (date: string) => ({ date, startTime: '15:00', endTime: '21:00', segments: [{ label: '공연', startTime: '18:00', endTime: '20:30' }] });
  const res = await http(app)
    .post('/admin/events')
    .set(auth(admin))
    .send(eventInput({ days: [day('2026-12-12'), day('2026-12-13'), day('2026-12-14')], ...overrides }))
    .expect(201);
  const ev = await prisma.event.findUniqueOrThrow({ where: { id: res.body.id }, include: { days: { orderBy: { date: 'asc' }, include: { segments: true } } } });
  return ev;
}

async function member(person: string, gender: 'M' | 'F' = 'F') {
  const res = await http(app).post('/auth/identity').send({ verificationToken: fakeToken(person, '2000-01-01', gender), agreedTerms: ALL_TERMS }).expect(200);
  const token = res.body.sessionToken as string;
  await http(app).put('/me/profile').set(auth(token)).send({ nickname: `테스트${person}`, avatarColor: 'ink' }).expect(200);
  await http(app).put('/me/fandoms').set(auth(token)).send({ fandomIds: [] }).expect(200);
  await http(app).post('/me/notification-choice').set(auth(token)).send({ granted: false }).expect(200);
  const user = await prisma.user.findFirstOrThrow({ where: { nickname: `테스트${person}` } });
  return { token, userId: user.id };
}

/** 400×300 흰 바탕에 빨간 줄이 있는 PNG (위치 정보가 들어 있는 것처럼 EXIF를 넣음) */
async function sampleImage(): Promise<string> {
  const buf = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#ffffff' } })
    .composite([{ input: { create: { width: 400, height: 20, channels: 3, background: '#ff0000' } }, left: 0, top: 140 }])
    .jpeg()
    .withExif({ IFD0: { Copyright: 'SECRET-GPS-37.5665' } })
    .toBuffer();
  return buf.toString('base64');
}

type Ev = Awaited<ReturnType<typeof createEvent>>;

async function verify(token: string, ev: Ev, number = 'T1234-5678', days: number[] = [0]) {
  const start = await http(app).post(`/events/${ev.id}/tickets`).set(auth(token)).send({ kind: 'TICKET' }).expect(201);
  const id = start.body.id as string;
  await http(app)
    .post(`/tickets/${id}/image`)
    .set(auth(token))
    .send({ imageBase64: await sampleImage(), mimeType: 'image/jpeg', masks: [{ x: 0, y: 0, w: 0.5, h: 0.5 }] })
    .expect(200);
  const confirm = await http(app)
    .post(`/tickets/${id}/confirm`)
    .set(auth(token))
    .send({ reservationNumber: number, admissibleDayIds: days.map((i) => ev.days[i].id) })
    .expect(200);
  return { id, body: confirm.body };
}

describe('티켓 인증 상태 전이 표', () => {
  const allowed: Array<[string, string]> = [
    ['STARTED', 'UPLOADED'],
    ['UPLOADED', 'CONFIRMED'],
    ['CONFIRMED', 'REVIEW_PENDING'],
    ['CONFIRMED', 'VERIFIED'],
    ['REVIEW_PENDING', 'VERIFIED'],
    ['CONFIRMED', 'FAILED'],
    ['REVIEW_PENDING', 'FAILED'],
    ['VERIFIED', 'REVERIFYING'],
    ['REVERIFYING', 'VERIFIED'],
    ['REVERIFYING', 'FAILED'],
  ];
  const pairs = TICKET_STATUSES.flatMap((a) => TICKET_STATUSES.map((b) => [a, b] as const));
  test.each(pairs)('%s → %s', (from, to) => {
    const ok = allowed.some(([a, b]) => a === from && b === to);
    if (ok) expect(() => assertTicketTransition(from, to)).not.toThrow();
    else expect(() => assertTicketTransition(from, to)).toThrow(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
  });
});

describe('사용자: 티켓 인증 흐름', () => {
  test('올리고 확인하면 인증 완료, 이미지는 바로 지우고 예매번호는 해시로만 남긴다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    const { id, body } = await verify(a.token, ev);
    expect(body).toEqual({ status: 'VERIFIED', failReason: null, checks: { sameEvent: true, notPast: true, notUsedElsewhere: true } });
    expect(await prisma.ticketImage.count()).toBe(0);
    const row = await prisma.ticketVerification.findUniqueOrThrow({ where: { id } });
    expect(row.imageDeletedAt).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain('5678');
    expect(row.reservationHash).toMatch(/^[0-9a-f]{64}$/);
    const status = await http(app).get(`/events/${ev.id}/ticket`).set(auth(a.token)).expect(200);
    expect(status.body).toMatchObject({ grade: 'VERIFIED', verification: { status: 'VERIFIED', admissibleDayIds: [ev.days[0].id] } });
  });

  test('저장되는 이미지는 가린 곳이 검게 칠해지고, 사진 속 숨은 정보(EXIF)가 없다', async () => {
    dice = 0; // 검수 대기로 보내서 이미지가 남아 있게 함
    const ev = await createEvent();
    const a = await member('a');
    const { id } = await verify(a.token, ev);
    const img = await prisma.ticketImage.findUniqueOrThrow({ where: { verificationId: id } });
    const data = Buffer.from(img.data);
    expect(data.toString('latin1')).not.toContain('SECRET-GPS');
    const meta = await sharp(data).metadata();
    expect(meta.exif).toBeUndefined();
    const { data: raw, info } = await sharp(data).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => raw[(y * info.width + x) * info.channels];
    expect(px(10, 10)).toBeLessThan(30); // 가린 곳(왼쪽 위)은 검정
    expect(px(390, 10)).toBeGreaterThan(220); // 안 가린 곳은 흰색
  });

  test('같은 예매번호를 다른 계정이 쓰면 중복 의심으로 사람이 확인한다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    const b = await member('b');
    await verify(a.token, ev, 'T1234-5678');
    const second = await verify(b.token, ev, 't 1234 5678'); // 띄어쓰기·대소문자가 달라도 같은 번호
    expect(second.body).toMatchObject({ status: 'REVIEW_PENDING', checks: { notUsedElsewhere: false } });
    expect(await prisma.ticketVerification.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({
      reviewReason: 'DUPLICATE_SUSPECT',
    });
  });

  test('같은 번호라도 다른 행사면 문제없다', async () => {
    const ev1 = await createEvent();
    const ev2 = await createEvent({ officialUrl: 'https://example.com/other' });
    const a = await member('a');
    const b = await member('b');
    await verify(a.token, ev1);
    expect((await verify(b.token, ev2)).body.status).toBe('VERIFIED');
  });

  test('정책 값 비율만큼 무작위로 사람이 확인한다', async () => {
    dice = 0.1; // 10% < 20%
    const ev = await createEvent();
    const a = await member('a');
    const { id, body } = await verify(a.token, ev);
    expect(body.status).toBe('REVIEW_PENDING');
    expect((await prisma.ticketVerification.findUniqueOrThrow({ where: { id } })).reviewReason).toBe('RANDOM');
    expect(await prisma.ticketImage.count()).toBe(1); // 검수 중에는 가린 이미지가 남아 있음
  });

  test('하루짜리 행사는 그날이 자동으로 입장 가능한 날이 된다', async () => {
    const ev = await createEvent({ days: [{ date: '2026-12-12', startTime: '15:00', endTime: '21:00', segments: [] }] });
    const a = await member('a');
    const start = await http(app).post(`/events/${ev.id}/tickets`).set(auth(a.token)).send({ kind: 'TICKET' }).expect(201);
    await http(app).post(`/tickets/${start.body.id}/image`).set(auth(a.token)).send({ imageBase64: await sampleImage(), mimeType: 'image/jpeg', masks: [] }).expect(200);
    await http(app).post(`/tickets/${start.body.id}/confirm`).set(auth(a.token)).send({ reservationNumber: 'R0001', admissibleDayIds: [] }).expect(200);
    expect((await prisma.ticketVerification.findFirstOrThrow()).admissibleDayIds).toEqual([ev.days[0].id]);
  });

  test.each([
    [{ reservationNumber: '12' }, 'reservationNumber'],
    [{ reservationNumber: '예매번호' }, 'reservationNumber'],
    [{ admissibleDayIds: [] }, 'admissibleDayIds'],
  ])('%o → %s 오류', async (patch, field) => {
    const ev = await createEvent();
    const a = await member('a');
    const start = await http(app).post(`/events/${ev.id}/tickets`).set(auth(a.token)).send({ kind: 'TICKET' }).expect(201);
    await http(app).post(`/tickets/${start.body.id}/image`).set(auth(a.token)).send({ imageBase64: await sampleImage(), mimeType: 'image/jpeg', masks: [] }).expect(200);
    const res = await http(app)
      .post(`/tickets/${start.body.id}/confirm`)
      .set(auth(a.token))
      .send({ reservationNumber: 'T1234', admissibleDayIds: [ev.days[0].id], ...patch })
      .expect(400);
    expect(res.body).toMatchObject({ code: 'TICKET_INVALID', detail: { field } });
  });

  test('다른 행사의 날짜는 입장 가능한 날로 고를 수 없다', async () => {
    const ev = await createEvent();
    const other = await createEvent({ officialUrl: 'https://example.com/other' });
    const a = await member('a');
    const start = await http(app).post(`/events/${ev.id}/tickets`).set(auth(a.token)).send({ kind: 'TICKET' }).expect(201);
    await http(app).post(`/tickets/${start.body.id}/image`).set(auth(a.token)).send({ imageBase64: await sampleImage(), mimeType: 'image/jpeg', masks: [] }).expect(200);
    await http(app).post(`/tickets/${start.body.id}/confirm`).set(auth(a.token)).send({ reservationNumber: 'T1234', admissibleDayIds: [other.days[0].id] }).expect(400);
  });

  test('이미지 검사: 너무 크거나, 이미지가 아니거나, 가린 영역이 이미지 밖이면 거절', async () => {
    const ev = await createEvent();
    const a = await member('a');
    const start = await http(app).post(`/events/${ev.id}/tickets`).set(auth(a.token)).send({ kind: 'TICKET' }).expect(201);
    const url = `/tickets/${start.body.id}/image`;
    await http(app).post(url).set(auth(a.token)).send({ imageBase64: Buffer.from('not an image').toString('base64'), mimeType: 'image/png', masks: [] }).expect(400);
    await http(app).post(url).set(auth(a.token)).send({ imageBase64: await sampleImage(), mimeType: 'image/gif', masks: [] }).expect(400);
    await http(app).post(url).set(auth(a.token)).send({ imageBase64: await sampleImage(), mimeType: 'image/jpeg', masks: [{ x: 0.9, y: 0, w: 0.5, h: 0.1 }] }).expect(400);
    await prisma.policyValue.create({ data: { key: 'TICKET_IMAGE_MAX_MB', value: 0.001, effectiveFrom: new Date('2026-01-01T00:00:00Z') } });
    const big = await http(app).post(url).set(auth(a.token)).send({ imageBase64: await sampleImage(), mimeType: 'image/jpeg', masks: [] }).expect(413);
    expect(big.body.code).toBe('IMAGE_TOO_LARGE');
  });

  test('다른 사람의 인증에는 접근할 수 없다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    const b = await member('b');
    const start = await http(app).post(`/events/${ev.id}/tickets`).set(auth(a.token)).send({ kind: 'TICKET' }).expect(201);
    await http(app).post(`/tickets/${start.body.id}/image`).set(auth(b.token)).send({ imageBase64: await sampleImage(), mimeType: 'image/jpeg', masks: [] }).expect(404);
  });

  test('업로드 전에 확인할 수 없고, 인증을 마친 뒤에는 다시 시작할 수 없다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    const start = await http(app).post(`/events/${ev.id}/tickets`).set(auth(a.token)).send({ kind: 'TICKET' }).expect(201);
    await http(app).post(`/tickets/${start.body.id}/confirm`).set(auth(a.token)).send({ reservationNumber: 'T1234', admissibleDayIds: [ev.days[0].id] }).expect(409);
    await verify(a.token, ev, 'T9999');
    await http(app).post(`/events/${ev.id}/tickets`).set(auth(a.token)).send({ kind: 'TICKET' }).expect(409);
  });

  test("'참석 예정'은 티켓이 필요 없는 행사에서만", async () => {
    const paid = await createEvent();
    const free = await createEvent({ officialUrl: 'https://example.com/free', ticketRequired: false });
    const a = await member('a');
    const no = await http(app).post(`/events/${paid.id}/attendance-plan`).set(auth(a.token)).expect(409);
    expect(no.body.code).toBe('PLAN_NOT_ALLOWED');
    const ok = await http(app).post(`/events/${free.id}/attendance-plan`).set(auth(a.token)).expect(200);
    expect(ok.body).toMatchObject({ grade: 'PLANNED', canPlanWithoutTicket: true });
  });

  test('로그와 응답에 예매번호 원문이 남지 않는다', async () => {
    const lines: string[] = [];
    const spies = ['warn', 'error', 'log'].map((m) =>
      jest.spyOn(Logger.prototype, m as 'warn').mockImplementation((...x: unknown[]) => {
        lines.push(x.map(String).join(' '));
      }),
    );
    try {
      const ev = await createEvent();
      const a = await member('a');
      const { body } = await verify(a.token, ev, 'SECRET9876');
      expect(JSON.stringify(body)).not.toContain('SECRET9876');
      const start = await http(app).post(`/events/${ev.id}/tickets`).set(auth(a.token)).send({ kind: 'TICKET' }).expect(409);
      expect(JSON.stringify(start.body)).not.toContain('SECRET9876');
      expect(lines.join('\n')).not.toContain('SECRET9876');
      expect(JSON.stringify(await prisma.ticketVerification.findMany())).not.toContain('SECRET9876');
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});

describe('매칭에 반영', () => {
  async function pref(token: string, ev: Ev, days: number[]) {
    await http(app)
      .put(`/events/${ev.id}/preference`)
      .set(auth(token))
      .send({
        days: days.map((i) => ({ eventDayId: ev.days[i].id, arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: ev.days[i].segments.map((s) => s.id) })),
        tempoAnswers: [2, 2, 2],
        immersionAnswers: [2, 2],
        must: { gender: 'ANY', age: 'ANY', promises: [] },
      })
      .expect(200);
  }

  test('인증한 사람은 입장할 수 있는 날만 후보로 보이고, 카드에 인증 배지가 붙는다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    const b = await member('b');
    await pref(a.token, ev, [0, 1]);
    await pref(b.token, ev, [0, 1]);
    await verify(b.token, ev, 'T1111', [1]); // 둘째 날 1일권
    const res = await http(app).get(`/events/${ev.id}/candidates`).set(auth(a.token)).expect(200);
    expect(res.body.candidates[0]).toMatchObject({ userId: b.userId, grade: 'VERIFIED', overlaps: [{ date: '2026-12-13' }] });
  });
});

describe('운영자: 인증 검수', () => {
  async function pending() {
    dice = 0;
    const ev = await createEvent();
    const a = await member('a');
    const { id } = await verify(a.token, ev);
    return { ev, a, id };
  }

  test('검수 목록은 중복 의심 → 무작위 점검 순서', async () => {
    const ev = await createEvent();
    const a = await member('a');
    const b = await member('b');
    const c = await member('c');
    await verify(a.token, ev, 'T0001');
    dice = 0;
    await verify(c.token, ev, 'T0003'); // 무작위
    dice = 0.99;
    await verify(b.token, ev, 'T0001'); // 중복 의심
    const reviewer = await adminToken(app, 'REVIEWER');
    const res = await http(app).get('/admin/ticket-reviews').set(auth(reviewer)).expect(200);
    expect(res.body.map((r: { reason: string }) => r.reason)).toEqual(['DUPLICATE_SUSPECT', 'RANDOM']);
  });

  test('가린 이미지는 검수자만 볼 수 있고, 볼 때마다 기록이 남는다 (관리자도 볼 수 없음)', async () => {
    const { id } = await pending();
    const reviewer = await adminToken(app, 'REVIEWER', 'rv');
    const admin = await adminToken(app, 'ADMIN', 'boss');
    const em = await adminToken(app, 'EVENT_MANAGER', 'em');
    const res = await http(app).get(`/admin/ticket-reviews/${id}/image`).query({ reason: '중복 확인' }).set(auth(reviewer)).expect(200);
    expect(res.body.mimeType).toBe('image/jpeg');
    await http(app).get(`/admin/ticket-reviews/${id}/image`).set(auth(admin)).expect(403);
    await http(app).get(`/admin/ticket-reviews/${id}/image`).set(auth(em)).expect(403);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'TICKET_IMAGE_VIEW' } });
    expect(log).toMatchObject({ targetId: id, reason: '중복 확인' });
  });

  test('승인하면 이미지를 지우고, 그 뒤에는 이미지를 볼 수 없다', async () => {
    const { id } = await pending();
    const reviewer = await adminToken(app, 'REVIEWER', 'rv');
    await http(app).post(`/admin/ticket-reviews/${id}/approve`).set(auth(reviewer)).expect(200);
    expect(await prisma.ticketImage.count()).toBe(0);
    expect(await prisma.ticketVerification.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'VERIFIED', reviewerId: expect.any(String) });
    await http(app).get(`/admin/ticket-reviews/${id}/image`).set(auth(reviewer)).expect(404);
  });

  test('반려하면 실패로 바뀌고 이미지를 지운다', async () => {
    const { id, a, ev } = await pending();
    const admin = await adminToken(app, 'ADMIN', 'boss'); // 관리자도 검수(승인·반려)는 가능
    await http(app).post(`/admin/ticket-reviews/${id}/reject`).set(auth(admin)).send({ reason: 'UNREADABLE' }).expect(200);
    expect(await prisma.ticketImage.count()).toBe(0);
    const status = await http(app).get(`/events/${ev.id}/ticket`).set(auth(a.token)).expect(200);
    expect(status.body).toMatchObject({ grade: null, verification: { status: 'FAILED', failReason: 'UNREADABLE' } });
  });

  test('신고·행사 담당은 검수할 수 없다', async () => {
    const { id } = await pending();
    for (const role of ['REPORT_MANAGER', 'EVENT_MANAGER'] as const) {
      const t = await adminToken(app, role);
      await http(app).post(`/admin/ticket-reviews/${id}/approve`).set(auth(t)).expect(403);
    }
  });

  test('중복 의심을 승인하면 원래 번호 주인은 재검증으로 바뀐다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    const b = await member('b');
    const first = await verify(a.token, ev, 'T0001');
    const second = await verify(b.token, ev, 'T0001');
    const reviewer = await adminToken(app, 'REVIEWER', 'rv');
    await http(app).post(`/admin/ticket-reviews/${second.id}/approve`).set(auth(reviewer)).expect(200);
    expect((await prisma.ticketVerification.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('REVERIFYING');
    expect((await prisma.ticketHash.findFirstOrThrow()).verificationId).toBe(second.id);
    // 재검증 중인 첫 번째는 번호가 다른 사람 것이므로 그대로 승인할 수 없다
    const res = await http(app).post(`/admin/ticket-reviews/${first.id}/approve`).set(auth(reviewer)).expect(409);
    expect(res.body.code).toBe('APPROVAL_INVALID');
  });

  test('신고 담당이 재검증을 요청하면, 사용자가 이미지를 다시 올리고 검수자가 결과를 정한다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    const { id } = await verify(a.token, ev);
    const rm = await adminToken(app, 'REPORT_MANAGER', 'rm');
    const reviewer = await adminToken(app, 'REVIEWER', 'rv');
    await http(app).post(`/admin/tickets/${id}/reverify`).set(auth(reviewer)).send({ reason: 'x' }).expect(403);
    await http(app).post(`/admin/tickets/${id}/reverify`).set(auth(rm)).send({ reason: '신고 접수' }).expect(200);
    // 재검증 중에는 후보 카드의 인증 배지를 뗀다
    expect((await http(app).get(`/events/${ev.id}/ticket`).set(auth(a.token)).expect(200)).body.grade).toBeNull();
    const up = await http(app).post(`/tickets/${id}/image`).set(auth(a.token)).send({ imageBase64: await sampleImage(), mimeType: 'image/jpeg', masks: [] }).expect(200);
    expect(up.body.status).toBe('REVERIFYING');
    await http(app).post(`/admin/ticket-reviews/${id}/approve`).set(auth(reviewer)).expect(200);
    expect(await prisma.ticketVerification.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'VERIFIED' });
    expect(await prisma.ticketImage.count()).toBe(0);
  });

  test('보류는 상태를 바꾸지 않고 표시만 한다', async () => {
    const { id } = await pending();
    const reviewer = await adminToken(app, 'REVIEWER', 'rv');
    await http(app).post(`/admin/ticket-reviews/${id}/hold`).set(auth(reviewer)).expect(200);
    const row = await prisma.ticketVerification.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('REVIEW_PENDING');
    expect(row.heldAt).not.toBeNull();
  });
});
