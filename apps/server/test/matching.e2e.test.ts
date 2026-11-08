/**
 * 3-1단계: 입력 흐름 저장, 후보 매칭, 후보 상세, 후보 없음 알림 신청 (실제 DB)
 */
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { adminToken, ALL_TERMS, auth, eventInput, fakeToken, http, resetDb, startApp, TestClock } from './helpers';

let app: INestApplication;
let prisma: PrismaService;
const clock = new TestClock(); // 한국 시간 2026-11-07

beforeAll(async () => {
  app = await startApp(clock);
  prisma = app.get(PrismaService);
});

beforeEach(async () => {
  clock.current = new Date('2026-11-07T03:00:00Z');
  await resetDb(app);
});

afterAll(async () => {
  await app.close();
});

/** 이틀짜리 공연: 굿즈 줄(15~17), 입장 대기(17~18), 공연(18~20:30) */
async function createEvent(overrides: Record<string, unknown> = {}) {
  const admin = await adminToken(app, 'EVENT_MANAGER', `m${Math.random().toString(36).slice(2, 8)}`);
  const day = (date: string) => ({
    date,
    startTime: '15:00',
    endTime: '21:00',
    segments: [
      { label: '굿즈 줄', startTime: '15:00', endTime: '17:00' },
      { label: '입장 대기', startTime: '17:00', endTime: '18:00' },
      { label: '공연', startTime: '18:00', endTime: '20:30' },
    ],
  });
  const res = await http(app)
    .post('/admin/events')
    .set(auth(admin))
    .send(eventInput({ days: [day('2026-12-12'), day('2026-12-13')], ...overrides }))
    .expect(201);
  const detail = await prisma.event.findUniqueOrThrow({
    where: { id: res.body.id },
    include: { days: { orderBy: { date: 'asc' }, include: { segments: { orderBy: { sortOrder: 'asc' } } } } },
  });
  return { id: detail.id, days: detail.days, admin };
}

/** 가입을 끝까지 마친 사용자 */
async function member(person: string, opts: { birth?: string; gender?: 'M' | 'F'; nickname?: string; fandomIds?: string[]; fandomPublic?: boolean } = {}) {
  const res = await http(app)
    .post('/auth/identity')
    .send({ verificationToken: fakeToken(person, opts.birth ?? '2000-01-01', opts.gender ?? 'F'), agreedTerms: ALL_TERMS })
    .expect(200);
  const token = res.body.sessionToken as string;
  await http(app).put('/me/profile').set(auth(token)).send({ nickname: opts.nickname ?? `테스트${person}`, avatarColor: 'ink' }).expect(200);
  await http(app)
    .put('/me/fandoms')
    .set(auth(token))
    .send({ fandomIds: opts.fandomIds ?? [], isPublic: opts.fandomPublic ?? false })
    .expect(200);
  await http(app).post('/me/notification-choice').set(auth(token)).send({ granted: false }).expect(200);
  const user = await prisma.user.findFirstOrThrow({ where: { identity: { ciHash: { not: '' } }, nickname: opts.nickname ?? `테스트${person}` } });
  return { token, userId: user.id };
}

type Ev = Awaited<ReturnType<typeof createEvent>>;

function pref(ev: Ev, o: { days?: number[]; together?: number[]; arrive?: string; leave?: string; tempo?: number[]; immersion?: number[]; must?: object } = {}) {
  return {
    days: (o.days ?? [0]).map((i) => ({
      eventDayId: ev.days[i].id,
      arriveTime: o.arrive ?? '15:00',
      leaveTime: o.leave ?? '21:00',
      togetherSegmentIds: (o.together ?? [0, 1, 2]).map((s) => ev.days[i].segments[s].id),
    })),
    tempoAnswers: o.tempo ?? [2, 2, 2],
    immersionAnswers: o.immersion ?? [2, 2],
    must: o.must ?? { gender: 'ANY', age: 'ANY', promises: [] },
  };
}

const save = (token: string, ev: Ev, body: object) => http(app).put(`/events/${ev.id}/preference`).set(auth(token)).send(body);

describe('입력 흐름 저장', () => {
  test('저장하면 템포·몰입도 단계가 계산되고 다시 불러올 수 있다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    const res = await save(a.token, ev, pref(ev, { tempo: [3, 3, 2], immersion: [1, 3] })).expect(200);
    expect(res.body).toMatchObject({ tempoLevel: 3, immersionLevel: 1 }); // 첫 번째(공연 Q4) 답
    const got = await http(app).get(`/events/${ev.id}/preference`).set(auth(a.token)).expect(200);
    expect(got.body.preference.days).toHaveLength(1);
  });

  test('처음에는 저장된 값이 없다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    const got = await http(app).get(`/events/${ev.id}/preference`).set(auth(a.token)).expect(200);
    expect(got.body).toEqual({ preference: null });
  });

  test('다시 저장하면 고친 내용으로 바뀐다 (날짜도 바꿀 수 있음)', async () => {
    const ev = await createEvent();
    const a = await member('a');
    await save(a.token, ev, pref(ev, { days: [0] })).expect(200);
    await save(a.token, ev, pref(ev, { days: [1] })).expect(200);
    const rows = await prisma.preferenceDay.findMany();
    expect(rows.map((r) => r.eventDayId)).toEqual([ev.days[1].id]);
  });

  test.each([
    [{ days: [] }, 'NO_DAYS'],
    [{ together: [] }, 'NO_TOGETHER_SEGMENT'],
    [{ arrive: '21:00', leave: '15:00' }, 'BAD_TIME'],
  ])('%o → %s', async (o, problem) => {
    const ev = await createEvent();
    const a = await member('a');
    const res = await save(a.token, ev, pref(ev, o)).expect(400);
    expect(res.body).toMatchObject({ code: 'PREFERENCE_INVALID', detail: { problem } });
  });

  test('다른 행사의 날짜는 고를 수 없다', async () => {
    const ev = await createEvent();
    const other = await createEvent({ officialUrl: 'https://example.com/other' });
    const a = await member('a');
    const body = pref(ev);
    body.days[0].eventDayId = other.days[0].id;
    body.days[0].togetherSegmentIds = [];
    const res = await save(a.token, ev, body).expect(400);
    expect(res.body.detail.problem).toBe('UNKNOWN_DAY');
  });

  test('등록 전 행사에는 입력할 수 없다', async () => {
    const a = await member('a');
    await http(app)
      .post('/event-reports')
      .set(auth(a.token))
      .send({ category: 'PERFORMANCE', name: '새 공연', officialUrl: 'https://example.com/new' })
      .expect(200);
    const reported = await prisma.event.findFirstOrThrow();
    await http(app).get(`/events/${reported.id}/preference`).set(auth(a.token)).expect(404);
  });

  test('나이·성별을 직접 보내도 받지 않는다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    await save(a.token, ev, { ...pref(ev), age: 20, gender: 'M' }).expect(400);
  });
});

describe('후보 목록', () => {
  test('입력하지 않으면 후보를 볼 수 없다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    const res = await http(app).get(`/events/${ev.id}/candidates`).set(auth(a.token)).expect(409);
    expect(res.body.code).toBe('PREFERENCE_REQUIRED');
  });

  test('조건이 맞는 사람이 후보로 나오고, 카드에 겹치는 시간이 있다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    const b = await member('b', { nickname: '하늘' });
    await save(a.token, ev, pref(ev)).expect(200);
    await save(b.token, ev, pref(ev, { arrive: '17:00' })).expect(200);
    const res = await http(app).get(`/events/${ev.id}/candidates`).set(auth(a.token)).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.candidates[0]).toMatchObject({
      userId: b.userId,
      nickname: '하늘',
      tempoGap: 0,
      immersionGap: 0,
      bestOverlapMinutes: 210,
      overlaps: [{ date: '2026-12-12', from: '17:00', to: '20:30' }],
    });
    expect(res.body.widen).toBeNull();
  });

  test('가입을 마치지 않았거나 이용 정지된 사람은 후보가 아니다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    const b = await member('b');
    await save(a.token, ev, pref(ev)).expect(200);
    await save(b.token, ev, pref(ev)).expect(200);
    await prisma.user.update({ where: { id: b.userId }, data: { signupCompletedAt: null } });
    let res = await http(app).get(`/events/${ev.id}/candidates`).set(auth(a.token)).expect(200);
    expect(res.body.total).toBe(0);
    await prisma.user.update({ where: { id: b.userId }, data: { signupCompletedAt: new Date(), status: { set: 'SUSPENDED' } } });
    res = await http(app).get(`/events/${ev.id}/candidates`).set(auth(a.token)).expect(200);
    expect(res.body.total).toBe(0);
  });

  test('같은 성별만 원하면 본인 확인 성별로 거른다', async () => {
    const ev = await createEvent();
    const a = await member('a', { gender: 'F' });
    const m = await member('m', { gender: 'M' });
    const f = await member('f', { gender: 'F' });
    await save(a.token, ev, pref(ev, { must: { gender: 'SAME', age: 'ANY', promises: [] } })).expect(200);
    await save(m.token, ev, pref(ev)).expect(200);
    await save(f.token, ev, pref(ev)).expect(200);
    const res = await http(app).get(`/events/${ev.id}/candidates`).set(auth(a.token)).expect(200);
    expect(res.body.candidates.map((c: { userId: string }) => c.userId)).toEqual([f.userId]);
  });

  test('나이 범위는 본인 확인 생년월일로 거른다 (오늘 기준 만 나이)', async () => {
    const ev = await createEvent();
    const a = await member('a', { birth: '2000-01-01' }); // 26세
    const near = await member('near', { birth: '1997-11-07' }); // 29세 (오늘 생일)
    const far = await member('far', { birth: '1997-11-06' }); // 29세
    const older = await member('older', { birth: '1996-11-07' }); // 30세
    await save(a.token, ev, pref(ev, { must: { gender: 'ANY', age: 'WITHIN_3', promises: [] } })).expect(200);
    for (const p of [near, far, older]) await save(p.token, ev, pref(ev)).expect(200);
    const res = await http(app).get(`/events/${ev.id}/candidates`).set(auth(a.token)).expect(200);
    expect(res.body.candidates.map((c: { userId: string }) => c.userId).sort()).toEqual([near.userId, far.userId].sort());
  });

  test('응답에 생년월일·성별·나이는 들어가지 않는다', async () => {
    const ev = await createEvent();
    const a = await member('a', { birth: '1999-03-15' });
    const b = await member('b', { birth: '1998-07-21', gender: 'F' });
    await save(a.token, ev, pref(ev)).expect(200);
    await save(b.token, ev, pref(ev)).expect(200);
    const list = await http(app).get(`/events/${ev.id}/candidates`).set(auth(a.token)).expect(200);
    const detail = await http(app).get(`/events/${ev.id}/candidates/${b.userId}`).set(auth(a.token)).expect(200);
    for (const body of [list.body, detail.body]) {
      const json = JSON.stringify(body);
      expect(json).not.toContain('1998');
      expect(json).not.toMatch(/"(gender|age|birthDate)"/);
    }
  });

  test('후보가 0명이면 조건을 넓혔을 때의 예상 후보 수를 알려 준다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    const shortOne = await member('s');
    const otherDay = await member('o');
    await save(a.token, ev, pref(ev, { days: [0] })).expect(200);
    await save(shortOne.token, ev, pref(ev, { days: [0], together: [1] })).expect(200); // 60분만 겹침
    await save(otherDay.token, ev, pref(ev, { days: [1] })).expect(200);
    const res = await http(app).get(`/events/${ev.id}/candidates`).set(auth(a.token)).expect(200);
    expect(res.body).toMatchObject({
      total: 0,
      widen: { shortTime: 1, immersionPlus: 0, otherDays: [{ date: '2026-12-13', people: 1 }] },
    });
    const widened = await http(app).get(`/events/${ev.id}/candidates`).query({ shortTime: 'true' }).set(auth(a.token)).expect(200);
    expect(widened.body.candidates.map((c: { userId: string }) => c.userId)).toEqual([shortOne.userId]);
  });

  test('날짜별로 따로 볼 수 있다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    const b = await member('b');
    await save(a.token, ev, pref(ev, { days: [0, 1] })).expect(200);
    await save(b.token, ev, pref(ev, { days: [1] })).expect(200);
    const d0 = await http(app).get(`/events/${ev.id}/candidates`).query({ dayId: ev.days[0].id }).set(auth(a.token)).expect(200);
    const d1 = await http(app).get(`/events/${ev.id}/candidates`).query({ dayId: ev.days[1].id }).set(auth(a.token)).expect(200);
    expect([d0.body.total, d1.body.total]).toEqual([0, 1]);
  });
});

describe('후보 상세', () => {
  test('왜 잘 맞는지와 공개한 팬덤을 보여 준다', async () => {
    const fandom = await prisma.fandom.create({ data: { name: '테스트 밴드' } });
    const ev = await createEvent();
    const a = await member('a', { fandomIds: [fandom.id] });
    const open = await member('open', { fandomIds: [fandom.id], fandomPublic: true });
    const hidden = await member('hidden', { fandomIds: [fandom.id], fandomPublic: false });
    const promises = { gender: 'ANY', age: 'ANY', promises: ['PUNCTUAL'] };
    await save(a.token, ev, pref(ev, { must: promises })).expect(200);
    await save(open.token, ev, pref(ev, { must: promises })).expect(200);
    await save(hidden.token, ev, pref(ev, { must: promises })).expect(200);

    const o = await http(app).get(`/events/${ev.id}/candidates/${open.userId}`).set(auth(a.token)).expect(200);
    expect(o.body).toMatchObject({ sameFan: true, publicFandoms: ['테스트 밴드'] });
    expect(o.body.reasons.time).toContain('굿즈 줄');
    expect(o.body.reasons.promises).toBe('시간 약속 기준이 같아요.');
    const h = await http(app).get(`/events/${ev.id}/candidates/${hidden.userId}`).set(auth(a.token)).expect(200);
    expect(h.body).toMatchObject({ sameFan: true, publicFandoms: [] });
  });

  test('후보가 아닌 사람의 상세는 볼 수 없다', async () => {
    const ev = await createEvent();
    const a = await member('a', { gender: 'F' });
    const m = await member('m', { gender: 'M' });
    await save(a.token, ev, pref(ev, { must: { gender: 'SAME', age: 'ANY', promises: [] } })).expect(200);
    await save(m.token, ev, pref(ev)).expect(200);
    await http(app).get(`/events/${ev.id}/candidates/${m.userId}`).set(auth(a.token)).expect(404);
  });
});

describe('후보 없음 → 알림 신청', () => {
  test('행사 3일 전까지 알림을 신청할 수 있다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    await save(a.token, ev, pref(ev)).expect(200);
    const res = await http(app)
      .post(`/events/${ev.id}/wait-registrations`)
      .set(auth(a.token))
      .send({ includeImmersionPlus: true })
      .expect(200);
    expect(res.body).toEqual({ endsOn: '2026-12-09', includeImmersionPlus: true });
    // 다시 신청하면 하나로 유지
    await http(app).post(`/events/${ev.id}/wait-registrations`).set(auth(a.token)).send({}).expect(200);
    expect(await prisma.waitRegistration.count()).toBe(1);
  });

  test('행사 3일 전이 지나면 신청할 수 없다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    await save(a.token, ev, pref(ev)).expect(200);
    clock.current = new Date('2026-12-10T03:00:00Z');
    // 한 달이 지나 로그인 유지 기간이 끝났으므로 다시 로그인
    const login = await http(app).post('/auth/identity').send({ verificationToken: fakeToken('a', '2000-01-01') }).expect(200);
    const res = await http(app).post(`/events/${ev.id}/wait-registrations`).set(auth(login.body.sessionToken)).send({}).expect(409);
    expect(res.body.code).toBe('WAIT_TOO_LATE');
  });
});

describe('행사 수정과 입력 내용', () => {
  test('일정이 그대로인 수정(이름 고침)은 사용자가 고른 날을 지우지 않는다', async () => {
    const ev = await createEvent();
    const a = await member('a');
    await save(a.token, ev, pref(ev)).expect(200);
    const current = await http(app).get(`/admin/events/${ev.id}`).set(auth(ev.admin)).expect(200);
    const body = {
      ...eventInput(),
      name: '이름 고침',
      days: current.body.days.map((d: { date: string; startTime: string; endTime: string; segments: Array<{ label: string; startTime: string; endTime: string }> }) => ({
        date: d.date,
        startTime: d.startTime,
        endTime: d.endTime,
        segments: d.segments.map((s) => ({ label: s.label, startTime: s.startTime, endTime: s.endTime })),
      })),
    };
    await http(app).put(`/admin/events/${ev.id}`).set(auth(ev.admin)).send(body).expect(200);
    expect(await prisma.preferenceDay.count()).toBe(1);
  });
});

describe('본인 확인 결과 저장', () => {
  test('생년월일과 성별을 저장한다 (다른 사용자에게는 보이지 않음)', async () => {
    await member('a', { birth: '1999-03-15', gender: 'M' });
    expect(await prisma.identityVerification.findFirstOrThrow()).toMatchObject({ birthDate: '1999-03-15', gender: 'M' });
  });

  test('예전에 저장하지 않은 사람은 다시 로그인할 때 채운다', async () => {
    await member('a', { birth: '1999-03-15', gender: 'M' });
    await prisma.identityVerification.updateMany({ data: { birthDate: null, gender: null } });
    await http(app).post('/auth/identity').send({ verificationToken: fakeToken('a', '1999-03-15', 'M') }).expect(200);
    expect(await prisma.identityVerification.findFirstOrThrow()).toMatchObject({ birthDate: '1999-03-15', gender: 'M' });
  });
});
