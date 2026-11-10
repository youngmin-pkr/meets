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
    const concert = (await backend.listEvents({})).find((e) => e.name.includes('콘서트'))!;
    return { backend, event: await backend.getEvent(concert.id) };
  }
  const input = (event: Awaited<ReturnType<typeof ready>>['event'], must = { gender: 'ANY' as const, age: 'ANY' as const, promises: [] as never[] }) => ({
    days: [{ eventDayId: event.days[0].id, arriveTime: event.days[0].startTime, leaveTime: event.days[0].endTime, togetherSegmentIds: event.days[0].segments.map((s) => s.id) }],
    tempoAnswers: [2, 2, 2] as Array<1 | 2 | 3>,
    immersionAnswers: [2, 2] as Array<1 | 2 | 3>,
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
      immersionAnswers: [2, 2],
      must: { gender: 'ANY', age: 'ANY', promises: [] },
    });
    const r = await backend.getCandidates(paid.id, { shortTime: true, immersionPlus: true });
    expect(r.candidates.some((c) => c.grade === 'VERIFIED')).toBe(true);
  });
});

describe('데모: 제안과 약속', () => {
  async function setup(gender: 'M' | 'F' = 'F') {
    let clock = new Date('2026-11-07T03:00:00Z');
    const backend = createDemoBackend({ now: () => clock, autoAcceptDelayMs: 1000 });
    const r = await backend.verifyIdentity(`fake:p1:2000-01-01:${gender}`, ALL_TERMS);
    if (r.outcome !== 'SIGNED_UP') throw new Error();
    backend.setSessionToken(r.sessionToken);
    await backend.updateProfile('데모제안', 'ink');
    await backend.setFandoms([], false);
    await backend.setNotificationChoice(false);
    const list = await backend.listEvents({});
    const concert = await backend.getEvent(list.find((e) => e.name.includes('콘서트'))!.id);
    await backend.savePreference(concert.id, {
      days: [{ eventDayId: concert.days[0].id, arriveTime: concert.days[0].startTime, leaveTime: concert.days[0].endTime, togetherSegmentIds: concert.days[0].segments.map((s) => s.id) }],
      tempoAnswers: [2, 2, 2],
      immersionAnswers: [2, 2],
      must: { gender: 'ANY', age: 'ANY', promises: [] },
    });
    const tick = (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    };
    return { backend, concert, tick };
  }

  test('인증 전에는 보낼 수 없고, 인증 후 보내면 예시 사용자가 잠시 뒤 수락해 약속이 생긴다', async () => {
    const { backend, concert, tick } = await setup();
    const { candidates } = await backend.getCandidates(concert.id, {});
    const target = await backend.getCandidate(concert.id, candidates[0].userId);
    const input = {
      receiverId: target.userId,
      eventDayId: target.overlaps[0].eventDayId,
      segmentIds: target.overlaps[0].segmentIds.slice(0, 1),
      meetingSpotId: concert.meetingSpots[0].id,
    };
    // 후보를 처음 볼 때 예시 사용자 한 명이 나에게 보낸 제안이 있으므로, 그 사람이 아닌 상대에게 보냄
    const incoming = (await backend.listProposals()).find((p) => p.direction === 'RECEIVED');
    const other = candidates.find((c) => c.userId !== incoming?.counterpart.userId)!;
    const otherDetail = await backend.getCandidate(concert.id, other.userId);
    const input2 = { ...input, receiverId: other.userId, eventDayId: otherDetail.overlaps[0].eventDayId, segmentIds: otherDetail.overlaps[0].segmentIds.slice(0, 1) };
    await expect(backend.sendProposal(concert.id, input2)).rejects.toMatchObject({ code: 'PROPOSAL_NEEDS_TICKET' });

    const t = await backend.startTicket(concert.id, 'TICKET');
    await backend.uploadTicketImage(t.id, 'AAAA', 'image/jpeg', []);
    await backend.confirmTicket(t.id, 'D1234', []);
    const sent = await backend.sendProposal(concert.id, input2);
    expect(sent).toMatchObject({ direction: 'SENT', status: 'SENT' });
    await expect(backend.sendProposal(concert.id, input2)).rejects.toMatchObject({ code: 'PROPOSAL_EXISTS' });
    tick(1500);
    expect((await backend.listProposals()).find((p) => p.id === sent.id)?.status).toBe('ACCEPTED');
    expect((await backend.listAppointments()).find((x) => x.counterpart.userId === other.userId)).toMatchObject({ status: 'PENDING_CONFIRM' });
  });

  test('예시 사용자가 보낸 제안을 수락·거절할 수 있고, 24시간 뒤에는 만료된다', async () => {
    const { backend, concert, tick } = await setup();
    await backend.getCandidates(concert.id, {});
    const incoming = (await backend.listProposals()).find((p) => p.direction === 'RECEIVED')!;
    expect(incoming.status).toBe('SENT');
    // 인증 전에는 수락할 수 없음
    await expect(backend.acceptProposal(incoming.id)).rejects.toMatchObject({ code: 'PROPOSAL_NEEDS_TICKET' });
    tick(24 * 60 * 60 * 1000 + 1000);
    expect((await backend.listProposals()).find((p) => p.id === incoming.id)?.status).toBe('EXPIRED');
    await expect(backend.rejectProposal(incoming.id)).rejects.toMatchObject({ code: 'PROPOSAL_STATE' });
  });
});

describe('데모: 약속 (전날 확인·취소·알림)', () => {
  /** 가입을 마치면 '내일 약속'이 하나 들어 있습니다 (예시 상대는 이미 확인함) */
  async function member() {
    let clock = new Date('2026-11-07T03:00:00Z'); // 한국 시간 11월 7일 정오
    const backend = createDemoBackend({ now: () => clock, autoAcceptDelayMs: 1000 });
    const r = await backend.verifyIdentity('fake:ap1:2000-01-01:F', ALL_TERMS);
    if (r.outcome !== 'SIGNED_UP') throw new Error();
    backend.setSessionToken(r.sessionToken);
    await backend.updateProfile('데모약속', 'ink');
    await backend.setFandoms([], false);
    await backend.setNotificationChoice(false);
    const tick = (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    };
    return { backend, tick };
  }

  test("가입하면 내일 약속이 있고, 바로 '갈 수 있어요'를 누르면 확정된다", async () => {
    const { backend } = await member();
    const a = (await backend.listAppointments()).find((x) => x.status === 'PENDING_CONFIRM')!;
    expect(a).toMatchObject({
      status: 'PENDING_CONFIRM',
      day: { date: '2026-11-08' },
      counterpart: { nickname: '하늘' },
      confirm: { mine: false, theirs: true },
      actions: { confirm: true, cancel: true },
      needsAction: true,
    });
    const notes = await backend.listNotifications();
    expect(notes.items.map((n) => n.kind)).toContain('DAY_BEFORE_CONFIRM');
    expect(notes.unread).toBeGreaterThan(0);

    const done = await backend.confirmAppointment(a.id);
    expect(done).toMatchObject({ status: 'CONFIRMED', confirm: { mine: true, theirs: true }, needsAction: false });
    await expect(backend.confirmAppointment(a.id)).rejects.toMatchObject({ code: 'APPOINTMENT_STATE' });
    // 확정 알림은 기다리던 상대에게 갑니다. (내가 마지막으로 눌렀으므로 나에게는 오지 않음)
    expect((await backend.listNotifications()).items.map((n) => n.kind)).not.toContain('APPOINTMENT_CONFIRMED');
  });

  test('약속 24시간 전까지는 영향 없고, 그 뒤 취소는 임박 취소로 기록된다', async () => {
    const { backend, tick } = await member();
    const a = (await backend.listAppointments()).find((x) => x.status === 'PENDING_CONFIRM')!;
    expect(a.freeCancelUntil).toBe(new Date('2026-11-07T05:00:00Z').toISOString()); // 11월 7일 14시
    tick(3 * 60 * 60 * 1000); // 15시
    const cancelled = await backend.cancelAppointment(a.id, 'SICK');
    expect(cancelled).toMatchObject({ status: 'CANCELLED', end: { reason: 'CANCELLED', byMe: true, late: true, cancelReason: '몸이 안 좋아요' } });
    await expect(backend.cancelAppointment(a.id)).rejects.toMatchObject({ code: 'APPOINTMENT_STATE' });
  });

  test('마감까지 확인하지 않으면 취소되고 무응답으로 보인다', async () => {
    const { backend, tick } = await member();
    const a = (await backend.listAppointments()).find((x) => x.status === 'PENDING_CONFIRM')!;
    tick(23 * 60 * 60 * 1000); // 다음 날 11시 (마감: 약속 3시간 전)
    const after = await backend.getAppointment(a.id);
    expect(after).toMatchObject({ status: 'CANCELLED', end: { reason: 'NO_CONFIRM', byMe: true } });
    expect((await backend.listNotifications()).items.map((n) => n.kind)).toContain('NO_CONFIRM_SELF');
  });

  test('확정 뒤 약속 1시간 전부터 도착을 남기고, 상대 기록이 없으면 15분 뒤 안 나왔어요를 누를 수 있다', async () => {
    const { backend, tick } = await member();
    const a = (await backend.listAppointments()).find((x) => x.status === 'PENDING_CONFIRM')!;
    await backend.confirmAppointment(a.id);
    await expect(backend.arriveAppointment(a.id)).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_NOW' });
    tick(25 * 60 * 60 * 1000); // 다음 날 13시 (약속 14시)
    expect((await backend.listNotifications()).items.find((n) => n.appointmentId === a.id)!.kind).toBe('APPOINTMENT_SOON');
    expect((await backend.arriveAppointment(a.id)).arrival.mine).not.toBeNull();
    tick(75 * 60 * 1000); // 14:15
    const meeting = await backend.getAppointment(a.id);
    expect(meeting).toMatchObject({ status: 'IN_PROGRESS', actions: { reportNoShow: true } });
    expect(await backend.reportNoShow(a.id)).toMatchObject({ status: 'ENDED_EARLY', end: { reason: 'NO_SHOW', byMe: true } });
  });

  test('시간이 겹치는 제안은 보낼 수 없다', async () => {
    const { backend, tick } = await member();
    const concert = await backend.getEvent((await backend.listEvents({})).find((e) => e.name.includes('콘서트'))!.id);
    const day = concert.days[0];
    await backend.savePreference(concert.id, {
      days: [{ eventDayId: day.id, arriveTime: day.startTime, leaveTime: day.endTime, togetherSegmentIds: day.segments.map((s) => s.id) }],
      tempoAnswers: [2, 2, 2],
      immersionAnswers: [2, 2],
      must: { gender: 'ANY', age: 'ANY', promises: [] },
    });
    const t = await backend.startTicket(concert.id, 'TICKET');
    await backend.uploadTicketImage(t.id, 'AAAA', 'image/jpeg', []);
    await backend.confirmTicket(t.id, 'O1234', []);
    const { candidates } = await backend.getCandidates(concert.id, { shortTime: true, immersionPlus: true });
    const incoming = (await backend.listProposals()).find((p) => p.direction === 'RECEIVED' && p.status === 'SENT');
    const others = candidates.filter((c) => c.userId !== incoming?.counterpart.userId);
    const proposalTo = async (userId: string) => {
      const d = await backend.getCandidate(concert.id, userId);
      const segs = d.overlaps[0].segmentIds.filter((id) => id === day.segments[0].id);
      return { receiverId: userId, eventDayId: d.overlaps[0].eventDayId, segmentIds: segs, meetingSpotId: concert.meetingSpots[0].id };
    };
    const withGoods = [];
    for (const c of others) if ((await proposalTo(c.userId)).segmentIds.length) withGoods.push(c.userId);
    expect(withGoods.length).toBeGreaterThanOrEqual(2);
    await backend.sendProposal(concert.id, await proposalTo(withGoods[0]));
    tick(1500); // 예시 사용자가 수락 → 약속
    await backend.listAppointments();
    await expect(backend.sendProposal(concert.id, await proposalTo(withGoods[1]))).rejects.toMatchObject({ code: 'APPOINTMENT_OVERLAP' });
  });

  test('알림을 열어 보면 모두 읽음이 된다', async () => {
    const { backend } = await member();
    expect((await backend.getHomeSummary()).unreadNotifications).toBeGreaterThan(0);
    await backend.markNotificationsRead();
    expect(await backend.getHomeSummary()).toEqual({ unreadNotifications: 0, hasVerifiedTicket: false });
  });

  test('다른 사람의 약속은 볼 수 없다', async () => {
    const { backend } = await member();
    await expect(backend.getAppointment('demo-appointment-999')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});


describe('데모: 앱 안 채팅', () => {
  async function member() {
    let clock = new Date('2026-11-07T03:00:00Z'); // 한국 시간 11월 7일 정오
    const backend = createDemoBackend({ now: () => clock, autoAcceptDelayMs: 1000 });
    const r = await backend.verifyIdentity('fake:chat1:2000-01-01:F', ALL_TERMS);
    if (r.outcome !== 'SIGNED_UP') throw new Error();
    backend.setSessionToken(r.sessionToken);
    await backend.updateProfile('데모채팅', 'ink');
    await backend.setFandoms([], false);
    await backend.setNotificationChoice(false);
    const a = (await backend.listAppointments()).find((x) => x.status === 'PENDING_CONFIRM')!;
    const tick = (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    };
    return { backend, a, tick };
  }

  test('약속이 생기면 채팅이 열려 있고, 예시 상대의 인사가 안 읽은 메시지로 보인다', async () => {
    const { backend, a } = await member();
    expect(a.unreadMessages).toBe(1);
    const summary = (await backend.listChats()).find((c) => c.appointmentId === a.id)!;
    expect(summary).toMatchObject({ appointmentId: a.id, open: true, unread: 1, counterpart: { nickname: '하늘' } });
    const chat = await backend.getChat(a.id);
    expect(chat.messages.map((m) => m.kind)).toEqual(['SYSTEM', 'TEXT']);
    expect((await backend.listChats()).find((c) => c.appointmentId === a.id)!.unread).toBe(0);
  });

  test('내가 보내면 예시 상대가 잠시 뒤 답하고, 새 메시지만 이어서 받을 수 있다', async () => {
    const { backend, a, tick } = await member();
    const mine = await backend.sendChat(a.id, '안녕하세요!');
    expect(mine).toMatchObject({ mine: true, kind: 'TEXT', flagged: false });
    tick(1500);
    const next = await backend.getChat(a.id, mine.seq);
    expect(next.messages).toEqual([expect.objectContaining({ mine: false, kind: 'TEXT' })]);
  });

  test('연락처는 멈추고, 그래도 보내면 기록이 남는다', async () => {
    const { backend, a } = await member();
    await expect(backend.sendChat(a.id, '카톡 아이디 알려 주세요')).rejects.toMatchObject({ code: 'CONTACT_DETECTED', detail: { kinds: ['MESSENGER'] } });
    expect(await backend.sendChat(a.id, '카톡 아이디 알려 주세요', true)).toMatchObject({ flagged: true });
    await expect(backend.sendChat(a.id, '  ')).rejects.toMatchObject({ code: 'CHAT_INVALID' });
    await expect(backend.sendChat(a.id, '가'.repeat(501))).rejects.toMatchObject({ code: 'CHAT_INVALID' });
  });

  test('약속을 취소하면 채팅이 닫히고 읽기만 된다', async () => {
    const { backend, a } = await member();
    await backend.cancelAppointment(a.id);
    const chat = await backend.getChat(a.id);
    expect(chat).toMatchObject({ open: false, appointmentStatus: 'CANCELLED' });
    expect(chat.messages[chat.messages.length - 1]).toMatchObject({ kind: 'SYSTEM', body: '약속이 취소됐어요. 채팅이 닫혔어요.' });
    await expect(backend.sendChat(a.id, '다시 될까요?')).rejects.toMatchObject({ code: 'CHAT_CLOSED' });
  });

  test('만남이 끝나고 24시간 뒤 닫힌다', async () => {
    const { backend, a, tick } = await member();
    await backend.confirmAppointment(a.id);
    tick(30 * 60 * 60 * 1000); // 다음 날 18시 → 만남 끝
    expect((await backend.getChat(a.id)).open).toBe(true);
    tick(24 * 60 * 60 * 1000);
    expect((await backend.getChat(a.id)).open).toBe(false);
  });

  test('다른 사람의 채팅은 볼 수 없다', async () => {
    const { backend } = await member();
    await expect(backend.getChat('demo-appointment-999')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('데모: 후기 · 차단 · 신고 · 신뢰 단계', () => {
  async function member() {
    let clock = new Date('2026-11-07T03:00:00Z'); // 한국 시간 11월 7일 정오
    const backend = createDemoBackend({ now: () => clock, autoAcceptDelayMs: 1000 });
    const r = await backend.verifyIdentity('fake:rv1:2000-01-01:F', ALL_TERMS);
    if (r.outcome !== 'SIGNED_UP') throw new Error();
    backend.setSessionToken(r.sessionToken);
    await backend.updateProfile('데모후기', 'ink');
    await backend.setFandoms([], false);
    await backend.setNotificationChoice(false);
    const tick = (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    };
    const list = await backend.listAppointments();
    return { backend, tick, past: list.find((x) => x.status === 'ENDED')!, tomorrow: list.find((x) => x.status === 'PENDING_CONFIRM')! };
  }

  const review = (o: Record<string, unknown> = {}) => ({ overall: 'GREAT' as const, goodTags: ['PUNCTUAL' as const], badTags: [], again: 'YES' as const, hideTarget: false, ...o });

  test('가입하면 어제 끝난 만남이 있고, 후기 요청이 와 있다', async () => {
    const { backend, past } = await member();
    expect(past).toMatchObject({ status: 'ENDED', counterpart: { nickname: '지우' }, review: { canWrite: true, done: false } });
    expect((await backend.listNotifications()).items.map((n) => n.kind)).toContain('REVIEW_REQUEST');
    // 후기 내용은 응답에 없다
    expect(JSON.stringify(past)).not.toMatch(/goodTags|badTags|again/);
  });

  test("서로 '또 같이 가고 싶어요'를 고르면 이어지고, 채팅이 닫히지 않으며, 후보 맨 위에 보인다", async () => {
    const { backend, tick, past } = await member();
    expect(await backend.submitReview(past.id, review())).toEqual({ done: true, mutual: true });
    expect((await backend.getAppointment(past.id)).review).toMatchObject({ canWrite: false, done: true });
    expect((await backend.listNotifications()).items.map((n) => n.kind)).toContain('REVIEW_MUTUAL_AGAIN');
    tick(5 * 24 * 60 * 60 * 1000);
    expect(await backend.getChat(past.id)).toMatchObject({ open: true, closesAt: null });
    await expect(backend.submitReview(past.id, review())).rejects.toMatchObject({ code: 'REVIEW_EXISTS' });
  });

  test('YES가 아니면 연결되지 않고 알림도 없다. 칩이 이상하면 거절', async () => {
    const { backend, past } = await member();
    await expect(backend.submitReview(past.id, review({ goodTags: ['PUNCTUAL', 'PUNCTUAL'] }))).rejects.toMatchObject({ code: 'REVIEW_INVALID' });
    expect(await backend.submitReview(past.id, review({ again: 'MAYBE' }))).toEqual({ done: true, mutual: false });
    expect((await backend.listNotifications()).items.map((n) => n.kind)).not.toContain('REVIEW_MUTUAL_AGAIN');
  });

  test('아직 끝나지 않은 약속과 후기 기간(7일)이 지난 만남에는 남길 수 없다', async () => {
    const { backend, tick, past, tomorrow } = await member();
    await expect(backend.submitReview(tomorrow.id, review())).rejects.toMatchObject({ code: 'REVIEW_NOT_ALLOWED' });
    tick(7 * 24 * 60 * 60 * 1000);
    expect((await backend.getAppointment(past.id)).review.canWrite).toBe(false);
    await expect(backend.submitReview(past.id, review())).rejects.toMatchObject({ code: 'REVIEW_NOT_ALLOWED' });
  });

  test('내일 약속이 끝나면 양쪽에 후기 요청이 가고, 취소된 약속에는 가지 않는다', async () => {
    const { backend, tick, tomorrow } = await member();
    await backend.confirmAppointment(tomorrow.id);
    tick(30 * 60 * 60 * 1000); // 다음 날 18시 → 만남 끝
    const ended = await backend.getAppointment(tomorrow.id);
    expect(ended).toMatchObject({ status: 'ENDED', review: { canWrite: true } });
    expect((await backend.listNotifications()).items.filter((n) => n.kind === 'REVIEW_REQUEST' && n.appointmentId === tomorrow.id)).toHaveLength(1);
  });

  test('추천에서 빼면 서로 후보에서 사라지고, 차단 목록에 보인다', async () => {
    const { backend, past } = await member();
    await backend.submitReview(past.id, review({ again: 'NO', hideTarget: true }));
    const blocks = await backend.listBlocks();
    expect(blocks).toEqual([expect.objectContaining({ nickname: '지우', sourceLabel: '후기에서 차단', lastAppointmentId: past.id })]);
    await backend.unblockUser(blocks[0].userId);
    expect(await backend.listBlocks()).toEqual([]);
  });

  test('상대를 차단하면 약속이 끝나고 임박 취소가 기록되지 않으며, 채팅이 닫힌다', async () => {
    const { backend, tomorrow } = await member();
    // 내일 약속은 24시간 안이라 직접 취소하면 임박 취소지만, 차단으로 끝난 것은 기록되지 않는다
    await backend.blockCounterpart(tomorrow.id);
    expect(await backend.getAppointment(tomorrow.id)).toMatchObject({ status: 'CANCELLED', end: { reason: 'CANCELLED', byMe: true, late: false } });
    expect((await backend.getChat(tomorrow.id)).open).toBe(false);
    await expect(backend.sendChat(tomorrow.id, '안녕하세요')).rejects.toMatchObject({ code: 'CHAT_CLOSED' });
    expect((await backend.listBlocks())[0]).toMatchObject({ nickname: '하늘', sourceLabel: '채팅에서 차단' });
    expect((await backend.getTrust()).level).toBe(1);
  });

  test('신고: 분류와 글자 수, 같은 약속은 한 번만, 같이 차단하면 보이지 않는다', async () => {
    const { backend, past } = await member();
    await expect(backend.sendReport({ appointmentId: past.id, category: 'NOPE' as never, alsoBlock: false })).rejects.toMatchObject({ code: 'REPORT_INVALID' });
    await expect(backend.sendReport({ appointmentId: past.id, category: 'MONEY', detail: '가'.repeat(1001), alsoBlock: false })).rejects.toMatchObject({ code: 'REPORT_INVALID' });
    const ok = await backend.sendReport({ appointmentId: past.id, category: 'STALKING', detail: '계속 연락했어요', alsoBlock: true });
    expect(ok).toMatchObject({ received: true, blocked: true });
    await expect(backend.sendReport({ appointmentId: past.id, category: 'MONEY', alsoBlock: false })).rejects.toMatchObject({ code: 'REPORT_EXISTS' });
    expect((await backend.listBlocks())[0].sourceLabel).toBe('약속 중 불편');
    await expect(backend.sendReport({ appointmentId: 'demo-appointment-999', category: 'MONEY', alsoBlock: false })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('신뢰 단계: 처음에는 기본이고, 점수 숫자 없이 단계만 돌려준다', async () => {
    const { backend } = await member();
    const t = await backend.getTrust();
    expect(t).toMatchObject({ level: 1, label: '기본', next: { label: '참석 예정' } });
    expect(Object.keys(t).sort()).toEqual(['description', 'label', 'level', 'next']);
  });

  test("후보 카드에 '쌓인 신뢰'가 표시만 붙고, 서로 다시 가고 싶은 사람은 맨 위에 보인다", async () => {
    const { backend, past } = await member();
    const concert = await backend.getEvent((await backend.listEvents({})).find((e) => e.name.includes('콘서트'))!.id);
    const day = concert.days[0];
    await backend.savePreference(concert.id, {
      days: [{ eventDayId: day.id, arriveTime: day.startTime, leaveTime: day.endTime, togetherSegmentIds: day.segments.map((s) => s.id) }],
      tempoAnswers: [2, 2, 2],
      immersionAnswers: [2, 2],
      must: { gender: 'ANY', age: 'ANY', promises: [] },
    });
    const before = await backend.getCandidates(concert.id, { shortTime: true, immersionPlus: true });
    expect(before.candidates.find((c) => c.nickname === '하늘')).toMatchObject({ trusted: true });
    expect(before.candidates.filter((c) => c.nickname !== '하늘').every((c) => c.trusted === false)).toBe(true);
    expect(before.candidates.every((c) => c.reunion === false)).toBe(true);

    await backend.submitReview(past.id, review());
    const after = await backend.getCandidates(concert.id, { shortTime: true, immersionPlus: true });
    expect(after.candidates[0]).toMatchObject({ nickname: '지우', reunion: true });
    expect(after.candidates.filter((c) => c.reunion)).toHaveLength(1);
  });

  test('차단한 사람은 후보에서 사라진다', async () => {
    const { backend } = await member();
    const concert = await backend.getEvent((await backend.listEvents({})).find((e) => e.name.includes('콘서트'))!.id);
    const day = concert.days[0];
    await backend.savePreference(concert.id, {
      days: [{ eventDayId: day.id, arriveTime: day.startTime, leaveTime: day.endTime, togetherSegmentIds: day.segments.map((s) => s.id) }],
      tempoAnswers: [2, 2, 2],
      immersionAnswers: [2, 2],
      must: { gender: 'ANY', age: 'ANY', promises: [] },
    });
    const sky = (await backend.getCandidates(concert.id, { shortTime: true, immersionPlus: true })).candidates.find((c) => c.nickname === '하늘')!;
    await backend.blockUser(sky.userId);
    expect((await backend.getCandidates(concert.id, { shortTime: true, immersionPlus: true })).candidates.map((c) => c.nickname)).not.toContain('하늘');
    await expect(backend.getCandidate(concert.id, sky.userId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(backend.blockUser('nobody')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('데모: 만남 중 안전', () => {
  async function member() {
    let clock = new Date('2026-11-07T03:00:00Z'); // 한국 시간 11월 7일 정오
    const backend = createDemoBackend({ now: () => clock, autoAcceptDelayMs: 1000 });
    const r = await backend.verifyIdentity('fake:sf1:2000-01-01:F', ALL_TERMS);
    if (r.outcome !== 'SIGNED_UP') throw new Error();
    backend.setSessionToken(r.sessionToken);
    await backend.updateProfile('데모안전', 'ink');
    await backend.setFandoms([], false);
    await backend.setNotificationChoice(false);
    const tick = (min: number) => {
      clock = new Date(clock.getTime() + min * 60 * 1000);
    };
    const list = await backend.listAppointments();
    return { backend, tick, now: list.find((x) => x.status === 'IN_PROGRESS')! };
  }

  test('가입하면 지금 만나는 중인 약속이 있고, 도움 요청을 쓸 수 있다', async () => {
    const { backend, now } = await member();
    expect(now.safety).toEqual({ canRequestHelp: true, pendingCheck: null });
    expect(await backend.getSafetySettings()).toEqual({ checkEnabled: true, alertTrusted: false });
  });

  test('시작 60분 뒤 묻고, 10분 뒤 다시 묻는다. 믿는 사람 알림이 꺼져 있으면 링크에 알리지 않는다', async () => {
    const { backend, tick, now } = await member();
    const link = await backend.createShareLink(now.id, true);
    tick(5);
    const asked = await backend.getAppointment(now.id);
    expect(asked.safety.pendingCheck).toMatchObject({ minutesSinceStart: 60 });
    expect(asked.needsAction).toBe(true);
    tick(10);
    await backend.getAppointment(now.id);
    const kinds = (await backend.listNotifications()).items.map((n) => n.kind);
    expect(kinds).toContain('SAFETY_CHECK');
    expect(kinds).toContain('SAFETY_CHECK_REMIND');
    tick(15);
    await backend.getAppointment(now.id);
    expect((await backend.listShareLinks(now.id))[0].preview.alert).toBeNull();
    expect(link.url).toContain('/share/');
  });

  test('믿는 사람 알림을 켜 두면 답이 없을 때 링크에 알림이 뜬다', async () => {
    const { backend, tick, now } = await member();
    await backend.updateSafetySettings({ alertTrusted: true });
    await backend.createShareLink(now.id, true);
    for (const min of [5, 10, 10]) {
      tick(min); // 서버처럼 시간이 흐르는 동안 앱이 계속 확인합니다
      await backend.getAppointment(now.id);
    }
    expect((await backend.listShareLinks(now.id))[0].preview.alert).toMatchObject({ kind: 'NO_RESPONSE' });
  });

  test("'괜찮아요'로 답하면 다시 묻지 않는다. 확인을 끄면 묻지 않는다", async () => {
    const { backend, tick, now } = await member();
    tick(5);
    const check = (await backend.getAppointment(now.id)).safety.pendingCheck!;
    await backend.answerSafetyCheck(now.id, check.id, 'OK');
    tick(20);
    const after = await backend.getAppointment(now.id);
    expect(after.safety.pendingCheck).toBeNull();
    expect((await backend.listNotifications()).items.map((n) => n.kind)).not.toContain('SAFETY_CHECK_REMIND');
  });

  test('안전 확인을 끄면 묻지 않는다', async () => {
    const { backend, tick, now } = await member();
    await backend.updateSafetySettings({ checkEnabled: false });
    tick(30);
    expect((await backend.getAppointment(now.id)).safety.pendingCheck).toBeNull();
  });

  test('벗어나고 싶어요: 약속이 끝나고 채팅이 닫히며, 화면에는 취소로만 보인다', async () => {
    const { backend, now } = await member();
    expect(await backend.requestHelp(now.id)).toEqual({ ended: true, reported: true, trustedNotified: false });
    const after = await backend.getAppointment(now.id);
    expect(after.status).toBe('ENDED_EARLY');
    expect(after.end).toMatchObject({ reason: 'CANCELLED', byMe: true, late: false });
    expect((await backend.getChat(now.id)).open).toBe(false);
    await expect(backend.requestHelp(now.id)).rejects.toMatchObject({ code: 'SAFETY_NOT_NOW' });
    await expect(backend.createShareLink(now.id, true)).rejects.toMatchObject({ code: 'SHARE_NOT_ALLOWED' });
  });

  test('아직 도착 버튼이 열리지 않은 내일 약속에는 도움 요청을 쓸 수 없다', async () => {
    const { backend } = await member();
    const tomorrow = (await backend.listAppointments()).find((x) => x.status === 'PENDING_CONFIRM')!;
    expect(tomorrow.safety.canRequestHelp).toBe(false);
    await expect(backend.requestHelp(tomorrow.id)).rejects.toMatchObject({ code: 'SAFETY_NOT_NOW' });
  });

  test('링크에는 행사·시간·장소·동행 별명만 있고, 끄면 사라진다', async () => {
    const { backend, now } = await member();
    const link = await backend.createShareLink(now.id, false);
    expect(Object.keys(link.preview).sort()).toEqual(['alert', 'arrivedAt', 'companion', 'eventName', 'expiresAt', 'spotName', 'status', 'when']);
    expect(link.preview.status).toBeNull();
    expect(JSON.stringify(link)).not.toMatch(/demo-user|demo-sample/);
    expect(await backend.listShareLinks(now.id)).toHaveLength(1);
    await backend.revokeShareLink(link.id);
    expect(await backend.listShareLinks(now.id)).toEqual([]);
    await expect(backend.revokeShareLink(link.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('데모: 일행', () => {
  async function world() {
    let clock = new Date('2026-11-07T03:00:00Z'); // 한국 시간 11월 7일 정오
    const backend = createDemoBackend({ now: () => clock, autoAcceptDelayMs: 1000 });
    const tick = (min: number) => {
      clock = new Date(clock.getTime() + min * 60 * 1000);
    };
    const signUp = async (person: string, nick: string) => {
      const r = await backend.verifyIdentity(`fake:${person}:2000-01-01:F`, ALL_TERMS);
      if (r.outcome !== 'SIGNED_UP') throw new Error();
      backend.setSessionToken(r.sessionToken);
      await backend.updateProfile(nick, 'ink');
      await backend.setFandoms([], false);
      await backend.setNotificationChoice(false);
      return r.sessionToken;
    };
    const tokenA = await signUp('pa1', '데모일행');
    const concert = await backend.getEvent((await backend.listEvents({})).find((e) => e.name.includes('콘서트'))!.id);
    /** 일정·스타일 입력과 티켓 인증까지 */
    const finish = async () => {
      await backend.savePreference(concert.id, {
        days: [{ eventDayId: concert.days[0].id, arriveTime: concert.days[0].startTime, leaveTime: concert.days[0].endTime, togetherSegmentIds: concert.days[0].segments.map((s) => s.id) }],
        tempoAnswers: [2, 2, 2],
        immersionAnswers: [2, 2],
        must: { gender: 'ANY', age: 'ANY', promises: [] },
      });
      const t = await backend.startTicket(concert.id, 'TICKET');
      await backend.uploadTicketImage(t.id, 'AAAA', 'image/jpeg', []);
      await backend.confirmTicket(t.id, `P${Math.random().toString(36).slice(2, 8)}`, []);
    };
    return { backend, tick, signUp, tokenA, concert, finish };
  }

  test('일행을 만들면 초대 중이고 링크가 있다. 한 행사에 하나만', async () => {
    const { backend, concert } = await world();
    const party = await backend.createParty(concert.id);
    expect(party).toMatchObject({ status: 'INVITING', minSize: 2, maxSize: 4 });
    expect(party.invite?.url).toContain('/party-invite/');
    await expect(backend.createParty(concert.id)).rejects.toMatchObject({ code: 'PARTY_EXISTS' });
    expect((await backend.getEventParty(concert.id)).party?.id).toBe(party.id);
    expect(await backend.listParties()).toHaveLength(1);
  });

  test('잠시 뒤 예시 친구가 합류하고, 내가 입력과 티켓 인증을 마치면 활성이 되어 후보를 볼 수 있다', async () => {
    const { backend, tick, concert, finish } = await world();
    const party = await backend.createParty(concert.id);
    tick(1);
    const joined = await backend.getParty(party.id);
    expect(joined.members).toHaveLength(2);
    expect(joined.status).toBe('CONFIRMING');
    expect(joined.guide).toContain('내가');
    await expect(backend.getPartyCandidates(party.id, {})).rejects.toMatchObject({ code: 'PARTY_NOT_READY' });
    await finish();
    const active = await backend.getParty(party.id);
    expect(active).toMatchObject({ status: 'ACTIVE', actions: { candidates: true } });
    expect(active.invite).toBeNull();
    const res = await backend.getPartyCandidates(party.id, {});
    const memberIds = active.members.map((m) => m.userId);
    expect(res.candidates.every((c) => !memberIds.includes(c.userId))).toBe(true);
    expect((await backend.listNotifications()).items.map((n) => n.kind)).toEqual(expect.arrayContaining(['PARTY_JOINED', 'PARTY_READY']));
  });

  test('한 명만 남으면 일행이 풀린다', async () => {
    const { backend, tick, concert, finish } = await world();
    await finish();
    const party = await backend.createParty(concert.id);
    tick(1);
    expect((await backend.getParty(party.id)).status).toBe('ACTIVE');
    await backend.leaveParty(party.id);
    await expect(backend.getParty(party.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await backend.getEventParty(concert.id)).party).toBeNull();
    await backend.createParty(concert.id); // 풀린 뒤에는 새로 만들 수 있다
  });

  test('초대 링크로 합류하고, 대표가 입력하지 않은 친구를 빼고 진행할 수 있다', async () => {
    const { backend, tick, signUp, tokenA, concert, finish } = await world();
    await finish();
    const party = await backend.createParty(concert.id);
    const link = party.invite!.url;
    const tokenB = await signUp('pa2', '데모친구');
    expect(await backend.previewPartyInvite(link.split('/party-invite/')[1])).toMatchObject({ leaderNickname: '데모일행', memberCount: 1, joinable: true });
    const joined = await backend.joinParty(link.split('/party-invite/')[1]);
    expect(joined.status).toBe('CONFIRMING');
    expect(joined.actions.proceedWithout).toBe(false);
    backend.setSessionToken(tokenA);
    tick(1); // 예시 친구도 합류
    const view = await backend.getParty(party.id);
    expect(view.members).toHaveLength(3);
    expect(view.actions.proceedWithout).toBe(true);
    const done = await backend.proceedParty(party.id);
    expect(done.status).toBe('ACTIVE');
    expect(done.members.map((m) => m.nickname)).not.toContain('데모친구');
    backend.setSessionToken(tokenB);
    await expect(backend.getParty(party.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await backend.listNotifications()).items.map((n) => n.kind)).toContain('PARTY_REMOVED');
  });

  test('잘못된 링크와 이미 시작한 일행에는 합류할 수 없다', async () => {
    const { backend, tick, signUp, tokenA, concert, finish } = await world();
    await finish();
    const party = await backend.createParty(concert.id);
    const token = party.invite!.url.split('/party-invite/')[1];
    tick(1); // 예시 친구 합류 → 활성
    const tokenB = await signUp('pa3', '데모새친구');
    await expect(backend.previewPartyInvite('nope.demo')).rejects.toMatchObject({ code: 'INVITE_UNAVAILABLE' });
    expect(await backend.previewPartyInvite(token)).toMatchObject({ joinable: false });
    await expect(backend.joinParty(token)).rejects.toMatchObject({ code: 'INVITE_UNAVAILABLE' });
    backend.setSessionToken(tokenA);
    void tokenB;
  });

  test('대표만 일행을 풀 수 있다', async () => {
    const { backend, concert } = await world();
    const party = await backend.createParty(concert.id);
    expect(party.actions.disband).toBe(true);
    await backend.disbandParty(party.id);
    expect(await backend.listParties()).toEqual([]);
  });

  test('초대는 48시간 뒤 사라지고, 아무도 합류하지 않았으면 일행이 풀린다', async () => {
    const { backend, tick, signUp, tokenA, concert } = await world();
    const party = await backend.createParty(concert.id);
    void tokenA;
    void signUp;
    tick(60 * 49);
    // 초대 시간이 지나면 예시 친구도 합류하지 못해 혼자 남은 일행은 풀린다
    await expect(backend.getParty(party.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  async function activeParty() {
    const w = await world();
    await w.finish();
    const party = await w.backend.createParty(w.concert.id);
    w.tick(1); // 예시 친구 합류 → 활성
    const active = await w.backend.getParty(party.id);
    expect(active.status).toBe('ACTIVE');
    const cands = await w.backend.getPartyCandidates(party.id, {});
    const target = cands.candidates[0];
    const detail = await w.backend.getPartyCandidate(party.id, target.userId);
    const ov = detail.overlaps[0];
    const input = { receiverId: target.userId, eventDayId: ov.eventDayId, segmentIds: ov.segmentIds.slice(0, 1), meetingSpotId: w.concert.meetingSpots[0].id };
    return { ...w, party: active, target, input };
  }

  test('일행으로 제안하면 초안이 되고, 예시 친구가 동의하면 제안이 나가 일행이 제안 중이 된다', async () => {
    const { backend, tick, party, input } = await activeParty();
    const draft = await backend.createPartyProposal(party.id, input);
    expect(draft).toMatchObject({ status: 'DRAFT', direction: 'SENT', canCancel: true, consent: { agreed: 1, total: 2, needsMyAgreement: false } });
    expect(draft.party?.members).toHaveLength(2);
    const view = await backend.getParty(party.id);
    expect(view.actions).toMatchObject({ propose: false });
    expect(view.proposal).toMatchObject({ status: 'DRAFT' });
    await expect(backend.createPartyProposal(party.id, input)).rejects.toMatchObject({ code: 'PROPOSAL_EXISTS' });
    tick(1);
    const sent = (await backend.listProposals()).find((p) => p.id === draft.id)!;
    expect(sent.status).toBe('SENT');
    expect((await backend.getParty(party.id)).status).toBe('PROPOSING');
    expect((await backend.listNotifications()).items.map((n) => n.kind)).toContain('PARTY_PROPOSAL_SENT');
  });

  test('받은 예시 사용자가 수락하면 일행과 함께하는 약속이 생기고 일행은 활성으로 돌아간다', async () => {
    const { backend, tick, party, input, target } = await activeParty();
    await backend.createPartyProposal(party.id, input);
    tick(1);
    await backend.listProposals(); // 예시 친구 동의 → 제안이 나감
    tick(1);
    const appts = await backend.listAppointments();
    const group = appts.find((a) => a.companions.length === 2 && a.companions.some((c) => c.userId === target.userId))!;
    expect(group).toBeTruthy();
    expect(group.companions.map((c) => c.sameSide).sort()).toEqual([false, true]);
    expect((await backend.getParty(party.id)).status).toBe('ACTIVE');
  });

  test('초안은 만든 사람이 취소할 수 있고, 취소하면 다시 만들 수 있다', async () => {
    const { backend, party, input } = await activeParty();
    const draft = await backend.createPartyProposal(party.id, input);
    await backend.cancelProposal(draft.id);
    expect((await backend.listProposals()).find((p) => p.id === draft.id)?.status).toBe('CANCELLED');
    expect((await backend.getParty(party.id)).actions.propose).toBe(true);
    await backend.createPartyProposal(party.id, input);
  });

  test('초안은 24시간 안에 전원이 동의하지 않으면 만료된다. 일행이 풀리면 초안은 취소된다', async () => {
    const { backend, party, input } = await activeParty();
    const draft = await backend.createPartyProposal(party.id, input);
    await backend.leaveParty(party.id); // 한 명만 남아 일행이 풀림
    expect((await backend.listProposals()).find((p) => p.id === draft.id)?.status).toBe('CANCELLED');
  });

  test('진짜 일행원은 직접 동의해야 하고, 동의하면 제안이 나간다', async () => {
    const { backend, tick, signUp, tokenA, concert, finish } = await world();
    await finish();
    const party = await backend.createParty(concert.id);
    const token = party.invite!.url.split('/party-invite/')[1];
    const tokenB = await signUp('pa5', '데모동행');
    await finish();
    await backend.joinParty(token);
    backend.setSessionToken(tokenA);
    tick(1); // 둘 다 입력을 마쳤으므로 이미 시작한 일행이라 예시 친구는 합류하지 않음 (2명)
    const cands = await backend.getPartyCandidates(party.id, {});
    const detail = await backend.getPartyCandidate(party.id, cands.candidates[0].userId);
    const ov = detail.overlaps[0];
    const draft = await backend.createPartyProposal(party.id, { receiverId: detail.userId, eventDayId: ov.eventDayId, segmentIds: ov.segmentIds.slice(0, 1), meetingSpotId: concert.meetingSpots[0].id });
    expect(draft.consent?.total).toBe(2);
    tick(1); // 진짜 일행원이 동의하기 전에는 시간이 지나도 나가지 않음
    expect((await backend.getParty(party.id)).proposal?.status).toBe('DRAFT');
    backend.setSessionToken(tokenB);
    const mine = (await backend.listProposals()).find((p) => p.id === draft.id)!;
    expect(mine.consent?.needsMyAgreement).toBe(true);
    expect(await backend.agreeProposal(draft.id)).toMatchObject({ status: 'SENT' });
    await expect(backend.agreeProposal(draft.id)).rejects.toMatchObject({ code: 'PROPOSAL_STATE' });
  });

  test('받는 사람에게는 초안이 보이지 않는다', async () => {
    const { backend, party, input } = await activeParty();
    const draft = await backend.createPartyProposal(party.id, input);
    expect(draft.status).toBe('DRAFT');
    await expect(backend.agreeProposal(draft.id)).rejects.toMatchObject({ code: 'NOT_FOUND' }); // 만든 사람은 따로 동의하지 않음
  });
});
