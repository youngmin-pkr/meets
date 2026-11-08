/**
 * 데모 모드의 가짜 서버가 실제 서버와 같은 규칙으로 동작하는지 확인합니다.
 */
import { TERMS } from '@meets/shared';
import { createDemoBackend, DEMO_FANDOMS, DEMO_TAKEN_NICKNAMES } from '../src/demoBackend';

const NOW = () => new Date('2026-11-07T03:00:00Z'); // 한국 시간 11월 7일 정오
const ALL_TERMS = TERMS.map((t) => ({ code: t.code, version: t.version }));

async function signedUp(person = 'demo1') {
  const backend = createDemoBackend({ now: NOW });
  const result = await backend.verifyIdentity(`fake:${person}:2000-01-01`, ALL_TERMS);
  if (result.outcome !== 'SIGNED_UP') throw new Error('가입 실패');
  backend.setSessionToken(result.sessionToken);
  return backend;
}

describe('데모: 본인 확인', () => {
  test('성인은 가입되고 별명 화면으로', async () => {
    const backend = createDemoBackend({ now: NOW });
    const r = await backend.verifyIdentity('fake:a:2000-01-01', ALL_TERMS);
    expect(r).toMatchObject({ outcome: 'SIGNED_UP', nextStep: 'PROFILE' });
  });

  test('오늘 만 18세가 된 사람은 성인, 내일 되는 사람은 청소년', async () => {
    const backend = createDemoBackend({ now: NOW });
    expect((await backend.verifyIdentity('fake:b:2008-11-07', ALL_TERMS)).outcome).toBe('SIGNED_UP');
    expect((await backend.verifyIdentity('fake:c:2008-11-08', ALL_TERMS)).outcome).toBe(
      'TEEN_NOT_YET_AVAILABLE',
    );
  });

  test('만 14세 미만은 가입 불가', async () => {
    const backend = createDemoBackend({ now: NOW });
    expect(await backend.verifyIdentity('fake:d:2015-01-01', ALL_TERMS)).toEqual({ outcome: 'UNDER_MIN_AGE' });
  });

  test('필수 약관이 없으면 거절', async () => {
    const backend = createDemoBackend({ now: NOW });
    await expect(backend.verifyIdentity('fake:e:2000-01-01', [])).rejects.toMatchObject({
      code: 'TERMS_REQUIRED',
    });
  });

  test('잘못된 생년월일은 거절', async () => {
    const backend = createDemoBackend({ now: NOW });
    await expect(backend.verifyIdentity('fake:f:2000-02-30', ALL_TERMS)).rejects.toMatchObject({
      code: 'INVALID_VERIFICATION',
    });
  });

  test('같은 사람은 다시 로그인하면 멈췄던 단계부터', async () => {
    const backend = await signedUp('same');
    await backend.updateProfile('민지', 'ink');
    const r = await backend.verifyIdentity('fake:same:2000-01-01', []);
    expect(r).toMatchObject({ outcome: 'LOGGED_IN', nextStep: 'FANDOM' });
  });
});

describe('데모: 별명', () => {
  test('규칙에 맞으면 저장', async () => {
    const backend = await signedUp();
    expect(await backend.updateProfile('민지', 'red')).toMatchObject({
      nickname: '민지',
      avatarInitial: '민',
      nextStep: 'FANDOM',
    });
  });

  test('연락처가 보이면 거절', async () => {
    const backend = await signedUp();
    await expect(backend.updateProfile('카톡민지', 'ink')).rejects.toMatchObject({
      code: 'NICKNAME_INVALID',
      detail: { problem: 'CONTAINS_CONTACT' },
    });
  });

  test('미리 쓰이고 있는 별명은 거절 (대소문자 무시)', async () => {
    const backend = await signedUp();
    await expect(backend.updateProfile(DEMO_TAKEN_NICKNAMES[0], 'ink')).rejects.toMatchObject({
      code: 'NICKNAME_TAKEN',
    });
  });

  test('다른 데모 사용자가 쓴 별명도 거절', async () => {
    const backend = createDemoBackend({ now: NOW });
    const a = await backend.verifyIdentity('fake:a:2000-01-01', ALL_TERMS);
    if (a.outcome !== 'SIGNED_UP') throw new Error();
    backend.setSessionToken(a.sessionToken);
    await backend.updateProfile('Luna', 'ink');
    const b = await backend.verifyIdentity('fake:b:2000-01-01', ALL_TERMS);
    if (b.outcome !== 'SIGNED_UP') throw new Error();
    backend.setSessionToken(b.sessionToken);
    await expect(backend.updateProfile('luna', 'ink')).rejects.toMatchObject({ code: 'NICKNAME_TAKEN' });
  });

  test('없는 색은 거절', async () => {
    const backend = await signedUp();
    await expect(backend.updateProfile('민지', 'purple')).rejects.toMatchObject({
      code: 'INVALID_AVATAR_COLOR',
    });
  });
});

describe('데모: 팬덤과 알림', () => {
  test('별명 전에는 팬덤을 고를 수 없다', async () => {
    const backend = await signedUp();
    await expect(backend.setFandoms([], false)).rejects.toMatchObject({ code: 'STEP_ORDER' });
  });

  test('3개까지, 4개째는 거절', async () => {
    const backend = await signedUp();
    await backend.updateProfile('민지', 'ink');
    const ids = DEMO_FANDOMS.map((f) => f.id);
    await expect(backend.setFandoms(ids.slice(0, 4), false)).rejects.toMatchObject({ code: 'FANDOM_LIMIT' });
    expect((await backend.setFandoms(ids.slice(0, 3), false)).fandoms).toHaveLength(3);
  });

  test('알림은 한 번만 고르고, 고르면 가입 끝', async () => {
    const backend = await signedUp();
    await backend.updateProfile('민지', 'ink');
    await backend.setFandoms([], false);
    expect(await backend.setNotificationChoice(false)).toMatchObject({ nextStep: 'DONE' });
    await expect(backend.setNotificationChoice(true)).rejects.toMatchObject({
      code: 'NOTIFICATION_ALREADY_ASKED',
    });
  });

  test('로그인하지 않으면 내 정보를 볼 수 없다', async () => {
    const backend = createDemoBackend({ now: NOW });
    await expect(backend.getMe()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('데모: 행사 선택과 제보', () => {
  test('로그인하지 않으면 행사를 볼 수 없다', async () => {
    const backend = createDemoBackend({ now: NOW });
    await expect(backend.listEvents({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  test('예시 행사가 날짜 순으로 보이고, 분류로 거를 수 있다', async () => {
    const backend = await signedUp();
    const all = await backend.listEvents({});
    expect(all.length).toBeGreaterThanOrEqual(4);
    const firstDates = all.map((e) => e.days[0].date);
    expect(firstDates).toEqual([...firstDates].sort());
    const exhibition = await backend.listEvents({ category: 'EXHIBITION' });
    expect(exhibition.every((e) => e.category === 'EXHIBITION')).toBe(true);
    expect(exhibition.length).toBeGreaterThan(0);
  });

  test('상세에는 공개된 만날 장소만 있다', async () => {
    const backend = await signedUp();
    const [first] = await backend.listEvents({});
    const detail = await backend.getEvent(first.id);
    expect(detail.meetingSpots.length).toBeGreaterThan(0);
  });

  test('새 제보는 접수되고 목록에는 바로 나오지 않는다', async () => {
    const backend = await signedUp();
    const before = (await backend.listEvents({})).length;
    const r = await backend.reportEvent({
      category: 'PERFORMANCE',
      name: '새로운 테스트 공연',
      officialUrl: 'https://example.com/brand-new',
    });
    expect(r).toEqual({ merged: false, progress: 'RECEIVED' });
    expect((await backend.listEvents({})).length).toBe(before);
  });

  test('같은 공식 링크는 합치고, 등록된 행사면 등록됐다고 알려 준다', async () => {
    const backend = await signedUp();
    const [first] = await backend.listEvents({});
    const r = await backend.reportEvent({
      category: first.category,
      name: '아무 이름',
      officialUrl: `${first.officialUrl.replace('https://', 'https://www.')}/?utm_source=x`,
    });
    expect(r).toEqual({ merged: true, progress: 'REGISTERED' });
  });

  test('공식 링크가 없으면 거절', async () => {
    const backend = await signedUp();
    await expect(
      backend.reportEvent({ category: 'PERFORMANCE', name: '모임', officialUrl: '' }),
    ).rejects.toMatchObject({ code: 'EVENT_REPORT_INVALID', detail: { problem: 'OFFICIAL_URL_INVALID' } });
  });
});

describe('데모: 입력 흐름과 후보', () => {
  async function ready(person = 'viewer', gender: 'M' | 'F' = 'F') {
    const backend = createDemoBackend({ now: NOW });
    const r = await backend.verifyIdentity(`fake:${person}:2000-01-01:${gender}`, ALL_TERMS);
    if (r.outcome !== 'SIGNED_UP') throw new Error();
    backend.setSessionToken(r.sessionToken);
    await backend.updateProfile('데모보기', 'ink');
    await backend.setFandoms([], false);
    await backend.setNotificationChoice(false);
    const [concert] = await backend.listEvents({});
    return { backend, event: await backend.getEvent(concert.id) };
  }
  const input = (event: Awaited<ReturnType<typeof ready>>['event'], must = { gender: 'ANY' as const, age: 'ANY' as const, promises: [] as never[] }) => ({
    days: [{ eventDayId: event.days[0].id, arriveTime: event.days[0].startTime, leaveTime: event.days[0].endTime, togetherSegmentIds: event.days[0].segments.map((s) => s.id) }],
    tempoAnswers: [2, 2, 2] as Array<1 | 2 | 3>,
    immersionAnswers: [2, 2, 2] as Array<1 | 2 | 3>,
    must,
  });

  test('입력 전에는 후보를 볼 수 없다', async () => {
    const { backend, event } = await ready();
    await expect(backend.getCandidates(event.id, {})).rejects.toMatchObject({ code: 'PREFERENCE_REQUIRED' });
  });

  test('입력하면 예시 사용자 중 조건이 맞는 사람이 후보로 나온다', async () => {
    const { backend, event } = await ready();
    const saved = await backend.savePreference(event.id, input(event));
    expect(saved).toMatchObject({ tempoLevel: 2, immersionLevel: 2 });
    const r = await backend.getCandidates(event.id, {});
    expect(r.total).toBeGreaterThan(0);
    expect(r.candidates[0]).toMatchObject({ nickname: expect.any(String), summary: expect.any(String) });
    const detail = await backend.getCandidate(event.id, r.candidates[0].userId);
    expect(detail.reasons.tempo).toBeTruthy();
  });

  test('같은 성별만 고르면 남성 예시 사용자는 빠진다', async () => {
    const { backend, event } = await ready('f1', 'F');
    await backend.savePreference(event.id, input(event, { gender: 'SAME' as never, age: 'ANY' as never, promises: [] }));
    const r = await backend.getCandidates(event.id, { shortTime: true, immersionPlus: true });
    expect(r.candidates.map((c) => c.nickname)).not.toContain('민트');
  });

  test('잘못된 입력은 거절', async () => {
    const { backend, event } = await ready();
    await expect(backend.savePreference(event.id, { ...input(event), days: [] })).rejects.toMatchObject({
      code: 'PREFERENCE_INVALID',
    });
  });

  test('알림 신청은 행사 3일 전까지', async () => {
    const { backend, event } = await ready();
    await backend.savePreference(event.id, input(event));
    const r = await backend.registerWait(event.id, true);
    expect(r.includeImmersionPlus).toBe(true);
    expect(r.endsOn < event.days[0].date).toBe(true);
  });
});

describe('데모: 티켓 인증', () => {
  async function member(person: string) {
    const backend = createDemoBackend({ now: NOW });
    return backend;
  }
  async function signIn(backend: ReturnType<typeof createDemoBackend>, person: string) {
    const r = await backend.verifyIdentity(`fake:${person}:2000-01-01:F`, ALL_TERMS);
    if (r.outcome !== 'SIGNED_UP' && r.outcome !== 'LOGGED_IN') throw new Error();
    backend.setSessionToken(r.sessionToken);
    if (r.outcome === 'SIGNED_UP') {
      await backend.updateProfile(`데모${person}`, 'ink');
      await backend.setFandoms([], false);
      await backend.setNotificationChoice(false);
    }
  }

  test('올리고 확인하면 인증 완료, 같은 번호를 다른 사람이 쓰면 확인 대기', async () => {
    const backend = await member('x');
    await signIn(backend, 'a');
    const [concert] = await backend.listEvents({});
    const t1 = await backend.startTicket(concert.id, 'TICKET');
    await backend.uploadTicketImage(t1.id, 'AAAA', 'image/jpeg', [{ x: 0, y: 0, w: 0.5, h: 0.2 }]);
    expect((await backend.confirmTicket(t1.id, 'T1234', [])).status).toBe('VERIFIED');
    expect((await backend.getTicketStatus(concert.id)).grade).toBe('VERIFIED');

    await signIn(backend, 'b');
    const t2 = await backend.startTicket(concert.id, 'TICKET');
    await backend.uploadTicketImage(t2.id, 'AAAA', 'image/jpeg', []);
    expect(await backend.confirmTicket(t2.id, 't-1234', [])).toMatchObject({ status: 'REVIEW_PENDING', checks: { notUsedElsewhere: false } });
  });

  test('잘못된 이미지·가린 영역·예매번호는 거절', async () => {
    const backend = await member('x');
    await signIn(backend, 'a');
    const [concert] = await backend.listEvents({});
    const t = await backend.startTicket(concert.id, 'TICKET');
    await expect(backend.uploadTicketImage(t.id, 'AAAA', 'image/gif', [])).rejects.toMatchObject({ code: 'IMAGE_INVALID' });
    await expect(backend.uploadTicketImage(t.id, 'AAAA', 'image/png', [{ x: 0.9, y: 0, w: 0.5, h: 0.1 }])).rejects.toMatchObject({ code: 'IMAGE_INVALID' });
    await backend.uploadTicketImage(t.id, 'AAAA', 'image/png', []);
    await expect(backend.confirmTicket(t.id, '12', [])).rejects.toMatchObject({ code: 'TICKET_INVALID' });
  });

  test("'참석 예정'은 티켓이 필요 없는 행사에서만, 예시 사용자 중 인증한 사람은 배지가 있다", async () => {
    const backend = await member('x');
    await signIn(backend, 'a');
    const list = await backend.listEvents({});
    const paid = list.find((e) => e.ticketRequired)!;
    const free = list.find((e) => !e.ticketRequired)!;
    await expect(backend.planAttendance(paid.id)).rejects.toMatchObject({ code: 'PLAN_NOT_ALLOWED' });
    expect((await backend.planAttendance(free.id)).grade).toBe('PLANNED');

    const ev = await backend.getEvent(paid.id);
    await backend.savePreference(paid.id, {
      days: [{ eventDayId: ev.days[0].id, arriveTime: ev.days[0].startTime, leaveTime: ev.days[0].endTime, togetherSegmentIds: ev.days[0].segments.map((s) => s.id) }],
      tempoAnswers: [2, 2, 2],
      immersionAnswers: [2, 2, 2],
      must: { gender: 'ANY', age: 'ANY', promises: [] },
    });
    const r = await backend.getCandidates(paid.id, { shortTime: true, immersionPlus: true });
    expect(r.candidates.some((c) => c.grade === 'VERIFIED')).toBe(true);
  });
});
