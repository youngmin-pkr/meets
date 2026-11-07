/**
 * 2단계: 행사 선택·제보(사용자)와 행사 관리(운영자) 테스트
 */
import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { adminToken, auth, eventInput, http, resetDb, signUpAdult, startApp, TestClock } from './helpers';

let app: INestApplication;
let prisma: PrismaService;
const clock = new TestClock(); // 한국 시간 2026-11-07

beforeAll(async () => {
  app = await startApp(clock);
  prisma = app.get(PrismaService);
});

beforeEach(async () => {
  await resetDb(app);
});

afterAll(async () => {
  await app.close();
});

async function createEvent(token: string, overrides: Record<string, unknown> = {}) {
  const res = await http(app).post('/admin/events').set(auth(token)).send(eventInput(overrides)).expect(201);
  return res.body.id as string;
}

function report(userToken: string, overrides: Record<string, unknown> = {}) {
  return http(app)
    .post('/event-reports')
    .set(auth(userToken))
    .send({
      category: 'PERFORMANCE',
      name: '테스트 새 공연',
      dateText: '12.20',
      placeText: '테스트홀',
      officialUrl: 'https://example.com/new-show',
      ...overrides,
    });
}

describe('사용자: 행사 목록과 상세', () => {
  test('로그인해야 볼 수 있다', async () => {
    await http(app).get('/events').expect(401);
  });

  test('등록·변경된 행사만, 끝나지 않은 것만, 날짜 순으로 보인다', async () => {
    const admin = await adminToken(app, 'EVENT_MANAGER');
    await createEvent(admin, { name: '나중 공연', officialUrl: 'https://example.com/b', days: [{ date: '2026-12-20', startTime: '18:00', endTime: '21:00', segments: [] }] });
    await createEvent(admin, { name: '먼저 공연', officialUrl: 'https://example.com/a', days: [{ date: '2026-11-20', startTime: '18:00', endTime: '21:00', segments: [] }] });
    await createEvent(admin, { name: '지난 공연', officialUrl: 'https://example.com/past', days: [{ date: '2026-11-06', startTime: '18:00', endTime: '21:00', segments: [] }] });
    await createEvent(admin, { name: '오늘 공연', officialUrl: 'https://example.com/today', days: [{ date: '2026-11-07', startTime: '18:00', endTime: '21:00', segments: [] }] });
    const user = await signUpAdult(app);
    await report(user); // 제보됨 상태 → 목록에 안 보임

    const res = await http(app).get('/events').set(auth(user)).expect(200);
    expect(res.body.map((e: { name: string }) => e.name)).toEqual(['오늘 공연', '먼저 공연', '나중 공연']);
  });

  test('분류와 검색어로 거른다', async () => {
    const admin = await adminToken(app, 'EVENT_MANAGER');
    await createEvent(admin, { name: '테스트 밴드 공연', officialUrl: 'https://example.com/1' });
    await createEvent(admin, { name: '테스트 팝업', type: 'POPUP', venue: '테스트몰', officialUrl: 'https://example.com/2' });
    const user = await signUpAdult(app);

    const exhibit = await http(app).get('/events').query({ category: 'EXHIBITION' }).set(auth(user)).expect(200);
    expect(exhibit.body.map((e: { name: string }) => e.name)).toEqual(['테스트 팝업']);
    const byVenue = await http(app).get('/events').query({ q: '테스트몰' }).set(auth(user)).expect(200);
    expect(byVenue.body).toHaveLength(1);
  });

  test('상세에는 공개된 만날 장소만 보인다', async () => {
    const admin = await adminToken(app, 'EVENT_MANAGER');
    const id = await createEvent(admin);
    const user = await signUpAdult(app);
    const res = await http(app).get(`/events/${id}`).set(auth(user)).expect(200);
    expect(res.body.meetingSpots.map((s: { name: string }) => s.name)).toEqual(['정문 안내판 앞']);
    expect(res.body.days[0].segments[0]).toMatchObject({ label: '공연', startTime: '18:00' });
  });

  test('등록 전 행사의 상세는 볼 수 없다', async () => {
    const user = await signUpAdult(app);
    await report(user).expect(200);
    const event = await prisma.event.findFirstOrThrow();
    await http(app).get(`/events/${event.id}`).set(auth(user)).expect(404);
  });
});

describe('사용자: 행사 제보', () => {
  test('새 제보는 제보됨 상태의 행사가 된다', async () => {
    const user = await signUpAdult(app);
    const res = await report(user).expect(200);
    expect(res.body).toEqual({ merged: false, progress: 'RECEIVED' });
    const event = await prisma.event.findFirstOrThrow({ include: { reports: true } });
    expect(event).toMatchObject({ status: 'REPORTED', name: '테스트 새 공연', venue: '테스트홀' });
    expect(event.reports).toHaveLength(1);
  });

  test('같은 공식 링크(주소 모양이 조금 달라도)의 제보는 하나로 합친다', async () => {
    const a = await signUpAdult(app, 'a');
    const b = await signUpAdult(app, 'b');
    await report(a).expect(200);
    const res = await report(b, { officialUrl: 'https://www.EXAMPLE.com/new-show/?utm_source=sns' }).expect(200);
    expect(res.body).toEqual({ merged: true, progress: 'RECEIVED' });
    expect(await prisma.event.count()).toBe(1);
    expect(await prisma.eventReport.count()).toBe(2);
  });

  test('이미 등록된 행사를 제보하면 등록됐다고 알려 준다', async () => {
    const admin = await adminToken(app, 'EVENT_MANAGER');
    await createEvent(admin, { officialUrl: 'https://example.com/new-show' });
    const user = await signUpAdult(app);
    const res = await report(user).expect(200);
    expect(res.body).toEqual({ merged: true, progress: 'REGISTERED' });
  });

  test('같은 사람이 두 번 제보해도 한 번으로 센다', async () => {
    const user = await signUpAdult(app);
    await report(user).expect(200);
    await report(user).expect(200);
    expect(await prisma.eventReport.count()).toBe(1);
  });

  test.each([
    [{ officialUrl: '' }, 'OFFICIAL_URL_INVALID'],
    [{ officialUrl: 'example.com/show' }, 'OFFICIAL_URL_INVALID'],
    [{ name: '' }, 'NAME_REQUIRED'],
    [{ name: '오픈채팅 모임' }, 'CONTAINS_CONTACT'],
  ])('%o 제보는 %s로 거절', async (patch, problem) => {
    const user = await signUpAdult(app);
    const res = await report(user, patch).expect(400);
    expect(res.body).toMatchObject({ code: 'EVENT_REPORT_INVALID', detail: { problem } });
    expect(await prisma.event.count()).toBe(0);
  });
});

describe('운영자: 로그인과 권한', () => {
  test('아이디나 비밀번호가 틀리면 같은 안내', async () => {
    await adminToken(app, 'ADMIN', 'boss');
    const wrongPw = await http(app).post('/admin/auth/login').send({ loginId: 'boss', password: 'nope' }).expect(401);
    const noUser = await http(app).post('/admin/auth/login').send({ loginId: 'ghost', password: 'nope' }).expect(401);
    expect(wrongPw.body).toEqual(noUser.body);
  });

  test('비밀번호는 원문으로 저장하지 않는다', async () => {
    await adminToken(app, 'ADMIN', 'boss');
    const admin = await prisma.adminUser.findFirstOrThrow();
    expect(admin.passwordHash).not.toContain('test-password-123');
  });

  test('운영자 로그인 없이는 거절', async () => {
    await http(app).get('/admin/events').expect(401);
  });

  test('일반 사용자 토큰으로는 운영자 기능을 쓸 수 없다', async () => {
    const user = await signUpAdult(app);
    await http(app).get('/admin/events').set(auth(user)).expect(401);
  });

  test.each(['REVIEWER', 'REPORT_MANAGER'] as const)('%s는 행사 관리를 할 수 없다', async (role) => {
    const token = await adminToken(app, role);
    await http(app).get('/admin/events').set(auth(token)).expect(403);
    await http(app).post('/admin/events').set(auth(token)).send(eventInput()).expect(403);
  });

  test.each(['EVENT_MANAGER', 'ADMIN'] as const)('%s는 행사를 등록할 수 있다', async (role) => {
    const token = await adminToken(app, role);
    await createEvent(token);
  });

  test('운영자 로그인 유지 기간이 지나면 거절', async () => {
    const token = await adminToken(app, 'ADMIN');
    clock.current = new Date(clock.current.getTime() + 13 * 60 * 60 * 1000);
    try {
      await http(app).get('/admin/events').set(auth(token)).expect(401);
    } finally {
      clock.current = new Date('2026-11-07T03:00:00Z');
    }
  });
});

describe('운영자: 행사 등록 검사', () => {
  test.each([
    [{ officialUrl: 'not-a-url' }, 'officialUrl'],
    [{ days: [{ date: '2026-02-30', startTime: '10:00', endTime: '11:00', segments: [] }] }, 'days.date'],
    [{ days: [{ date: '2026-12-01', startTime: '12:00', endTime: '11:00', segments: [] }] }, 'days.time'],
    [
      { days: [{ date: '2026-12-01', startTime: '12:00', endTime: '14:00', segments: [{ label: '밖', startTime: '15:00', endTime: '16:00' }] }] },
      'days.segments',
    ],
    [{ meetingSpots: [{ name: '뒷골목', isPublicPlace: false }] }, 'meetingSpots'],
  ])('%o → %s 오류', async (patch, field) => {
    const token = await adminToken(app, 'EVENT_MANAGER');
    const res = await http(app).post('/admin/events').set(auth(token)).send(eventInput(patch)).expect(400);
    expect(res.body).toMatchObject({ code: 'EVENT_INVALID', detail: { field } });
  });

  test('같은 공식 링크의 행사는 두 번 등록할 수 없다', async () => {
    const token = await adminToken(app, 'EVENT_MANAGER');
    await createEvent(token);
    const res = await http(app)
      .post('/admin/events')
      .set(auth(token))
      .send(eventInput({ officialUrl: 'https://www.example.com/concert/' }))
      .expect(409);
    expect(res.body.code).toBe('EVENT_DUPLICATE');
  });
});

describe('운영자: 제보 검수 (제보됨 → 검수 중 → 등록/반려)', () => {
  async function reported() {
    const user = await signUpAdult(app);
    await report(user).expect(200);
    return (await prisma.event.findFirstOrThrow()).id;
  }

  test('검수 시작 → 정보 채우기 → 승인하면 사용자 목록에 보인다', async () => {
    const id = await reported();
    const token = await adminToken(app, 'EVENT_MANAGER');
    await http(app).post(`/admin/events/${id}/review`).set(auth(token)).expect(200);
    // 아직 정보가 비어 있어 승인할 수 없다
    const early = await http(app).post(`/admin/events/${id}/approve`).set(auth(token)).expect(409);
    expect(early.body.code).toBe('EVENT_INCOMPLETE');
    // 정보를 채운다 (검수 중에는 일정을 바꿔도 확인 없이 저장)
    await http(app)
      .put(`/admin/events/${id}`)
      .set(auth(token))
      .send(eventInput({ officialUrl: 'https://example.com/new-show' }))
      .expect(200);
    await http(app).post(`/admin/events/${id}/approve`).set(auth(token)).expect(200);

    const user = await signUpAdult(app, 'viewer');
    const list = await http(app).get('/events').set(auth(user)).expect(200);
    expect(list.body.map((e: { id: string }) => e.id)).toEqual([id]);
  });

  test('검수 없이 바로 승인할 수 없다 (제보됨 → 등록은 표에 없음)', async () => {
    const id = await reported();
    const token = await adminToken(app, 'EVENT_MANAGER');
    await http(app).put(`/admin/events/${id}`).set(auth(token)).send(eventInput({ officialUrl: 'https://example.com/new-show' })).expect(200);
    const res = await http(app).post(`/admin/events/${id}/approve`).set(auth(token)).expect(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  test('반려하면 사유가 남고, 반려된 행사는 고칠 수 없다', async () => {
    const id = await reported();
    const token = await adminToken(app, 'EVENT_MANAGER');
    await http(app).post(`/admin/events/${id}/review`).set(auth(token)).expect(200);
    await http(app).post(`/admin/events/${id}/reject`).set(auth(token)).send({ reason: '개인 모임' }).expect(200);
    expect(await prisma.event.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'REJECTED',
      statusReason: '개인 모임',
    });
    const res = await http(app).put(`/admin/events/${id}`).set(auth(token)).send(eventInput({ officialUrl: 'https://example.com/new-show' })).expect(409);
    expect(res.body.code).toBe('EVENT_CLOSED');
  });
});

describe('운영자: 행사 수정 (등록 → 변경됨)', () => {
  const newSchedule = { days: [{ date: '2026-12-13', startTime: '15:00', endTime: '21:00', segments: [] }] };

  test('일정이 바뀌면 저장 전 확인을 요구한다', async () => {
    const token = await adminToken(app, 'EVENT_MANAGER');
    const id = await createEvent(token);
    const res = await http(app).put(`/admin/events/${id}`).set(auth(token)).send(eventInput(newSchedule)).expect(409);
    expect(res.body).toMatchObject({ code: 'CONFIRM_REQUIRED', detail: { affectedAppointments: 0 } });
    expect((await prisma.event.findUniqueOrThrow({ where: { id } })).status).toBe('REGISTERED');
  });

  test('확인 후 저장하면 변경됨이 되고 사용자에게 바뀐 행사로 보인다', async () => {
    const token = await adminToken(app, 'EVENT_MANAGER');
    const id = await createEvent(token);
    await http(app).put(`/admin/events/${id}`).set(auth(token)).send({ ...eventInput(newSchedule), confirmed: true }).expect(200);
    expect((await prisma.event.findUniqueOrThrow({ where: { id } })).status).toBe('CHANGED');
    const user = await signUpAdult(app);
    const res = await http(app).get(`/events/${id}`).set(auth(user)).expect(200);
    expect(res.body).toMatchObject({ changed: true, days: [{ date: '2026-12-13' }] });
  });

  test('일정이 그대로면(이름만 고치면) 상태가 바뀌지 않는다', async () => {
    const token = await adminToken(app, 'EVENT_MANAGER');
    const id = await createEvent(token);
    await http(app).put(`/admin/events/${id}`).set(auth(token)).send(eventInput({ name: '이름 고침' })).expect(200);
    expect(await prisma.event.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'REGISTERED', name: '이름 고침' });
  });

  test('변경됨 상태에서도 일정을 다시 바꿀 수 있고, 이때도 저장 전 확인을 받는다', async () => {
    const token = await adminToken(app, 'EVENT_MANAGER');
    const id = await createEvent(token);
    await http(app).put(`/admin/events/${id}`).set(auth(token)).send({ ...eventInput(newSchedule), confirmed: true }).expect(200);
    const again = { days: [{ date: '2026-12-14', startTime: '15:00', endTime: '21:00', segments: [] }] };
    const ask = await http(app).put(`/admin/events/${id}`).set(auth(token)).send(eventInput(again)).expect(409);
    expect(ask.body.code).toBe('CONFIRM_REQUIRED');
    await http(app).put(`/admin/events/${id}`).set(auth(token)).send({ ...eventInput(again), confirmed: true }).expect(200);
    const saved = await prisma.event.findUniqueOrThrow({ where: { id }, include: { days: true } });
    expect(saved.status).toBe('CHANGED');
    expect(saved.days.map((d) => d.date)).toEqual(['2026-12-14']);
  });
});

describe('운영자: 행사 취소 (두 명 확인)', () => {
  test('행사 담당이 제안하고 관리자가 확정하면 취소되고 목록에서 빠진다', async () => {
    const manager = await adminToken(app, 'EVENT_MANAGER', 'manager');
    const admin = await adminToken(app, 'ADMIN', 'boss');
    const id = await createEvent(manager);

    const proposal = await http(app)
      .post(`/admin/events/${id}/cancel-proposals`)
      .set(auth(manager))
      .send({ reason: '주최 측 공연 취소 공지' })
      .expect(201);
    expect((await prisma.event.findUniqueOrThrow({ where: { id } })).status).toBe('REGISTERED');

    await http(app).post(`/admin/event-cancellations/${proposal.body.id}/confirm`).set(auth(admin)).expect(200);
    expect(await prisma.event.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'CANCELLED' });
    expect(await prisma.adminApproval.findUniqueOrThrow({ where: { id: proposal.body.id } })).toMatchObject({
      status: 'CONFIRMED',
      confirmedById: expect.any(String),
    });

    const user = await signUpAdult(app);
    expect((await http(app).get('/events').set(auth(user)).expect(200)).body).toEqual([]);
  });

  test('일정이 바뀐(변경됨) 행사도 두 명 확인으로 취소할 수 있다', async () => {
    const manager = await adminToken(app, 'EVENT_MANAGER', 'manager');
    const admin = await adminToken(app, 'ADMIN', 'boss');
    const id = await createEvent(manager);
    const changed = { days: [{ date: '2026-12-13', startTime: '15:00', endTime: '21:00', segments: [] }] };
    await http(app).put(`/admin/events/${id}`).set(auth(manager)).send({ ...eventInput(changed), confirmed: true }).expect(200);
    const p = await http(app).post(`/admin/events/${id}/cancel-proposals`).set(auth(manager)).send({ reason: '취소 공지' }).expect(201);
    await http(app).post(`/admin/event-cancellations/${p.body.id}/confirm`).set(auth(admin)).expect(200);
    expect((await prisma.event.findUniqueOrThrow({ where: { id } })).status).toBe('CANCELLED');
  });

  test('행사 담당은 확정할 수 없고, 관리자는 제안할 수 없다', async () => {
    const manager = await adminToken(app, 'EVENT_MANAGER', 'manager');
    const admin = await adminToken(app, 'ADMIN', 'boss');
    const id = await createEvent(manager);
    await http(app).post(`/admin/events/${id}/cancel-proposals`).set(auth(admin)).send({ reason: 'x' }).expect(403);
    const p = await http(app).post(`/admin/events/${id}/cancel-proposals`).set(auth(manager)).send({ reason: 'x' }).expect(201);
    await http(app).post(`/admin/event-cancellations/${p.body.id}/confirm`).set(auth(manager)).expect(403);
  });

  test('같은 사람이 제안과 확정을 모두 할 수 없다', async () => {
    // 권한표상 한 사람이 둘 다 할 수는 없지만, 기록이 꼬여도 서버가 막는지 확인합니다.
    const admin = await adminToken(app, 'ADMIN', 'boss');
    const adminRow = await prisma.adminUser.findFirstOrThrow({ where: { loginId: 'boss' } });
    const manager = await adminToken(app, 'EVENT_MANAGER', 'manager');
    const id = await createEvent(manager);
    const approval = await prisma.adminApproval.create({
      data: { kind: 'EVENT_CANCEL', targetId: id, reason: 'x', proposedById: adminRow.id },
    });
    const res = await http(app).post(`/admin/event-cancellations/${approval.id}/confirm`).set(auth(admin)).expect(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
    expect((await prisma.event.findUniqueOrThrow({ where: { id } })).status).toBe('REGISTERED');
  });

  test('이미 처리된 제안은 다시 확정할 수 없고, 같은 행사에 제안이 겹치지 않는다', async () => {
    const manager = await adminToken(app, 'EVENT_MANAGER', 'manager');
    const admin = await adminToken(app, 'ADMIN', 'boss');
    const id = await createEvent(manager);
    const p = await http(app).post(`/admin/events/${id}/cancel-proposals`).set(auth(manager)).send({ reason: 'x' }).expect(201);
    await http(app).post(`/admin/events/${id}/cancel-proposals`).set(auth(manager)).send({ reason: 'y' }).expect(409);
    await http(app).post(`/admin/event-cancellations/${p.body.id}/confirm`).set(auth(admin)).expect(200);
    await http(app).post(`/admin/event-cancellations/${p.body.id}/confirm`).set(auth(admin)).expect(409);
  });
});

describe('운영자 기록 (AuditLog)', () => {
  test('로그인, 열람, 등록, 수정, 취소 제안·확정이 모두 남는다', async () => {
    const manager = await adminToken(app, 'EVENT_MANAGER', 'manager');
    const admin = await adminToken(app, 'ADMIN', 'boss');
    const id = await createEvent(manager);
    await http(app).get('/admin/events').set(auth(manager)).expect(200);
    await http(app).get(`/admin/events/${id}`).set(auth(manager)).expect(200);
    await http(app).put(`/admin/events/${id}`).set(auth(manager)).send(eventInput({ name: '고침' })).expect(200);
    const p = await http(app).post(`/admin/events/${id}/cancel-proposals`).set(auth(manager)).send({ reason: '취소 공지' }).expect(201);
    await http(app).post(`/admin/event-cancellations/${p.body.id}/confirm`).set(auth(admin)).expect(200);

    const actions = (await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map((l) => l.action);
    for (const a of [
      'ADMIN_LOGIN',
      'EVENT_CREATE',
      'EVENT_LIST_VIEW',
      'EVENT_VIEW',
      'EVENT_UPDATE',
      'EVENT_CANCEL_PROPOSE',
      'EVENT_CANCEL_CONFIRM',
    ]) {
      expect(actions).toContain(a);
    }
  });

  test('비밀번호는 로그와 기록에 남지 않는다', async () => {
    const lines: string[] = [];
    const spy = jest.spyOn(Logger.prototype, 'warn').mockImplementation((...a: unknown[]) => {
      lines.push(a.map(String).join(' '));
    });
    try {
      await adminToken(app, 'ADMIN', 'boss');
      await http(app).post('/admin/auth/login').send({ loginId: 'boss', password: 'secret-wrong-pw' }).expect(401);
      const logs = await prisma.auditLog.findMany();
      expect(JSON.stringify(logs) + lines.join('\n')).not.toMatch(/secret-wrong-pw|test-password-123/);
    } finally {
      spy.mockRestore();
    }
  });
});
