/**
 * 9-2b단계: 일행으로 제안하기 — 초안, 전원 동의, 제안 보내기, 수락 → 여러 명 약속, 일행이 바뀔 때
 * 기준 행사: 2026-12-12(토)·12-13(일). 시계는 11-07 정오에 둡니다.
 */
import type { INestApplication } from '@nestjs/common';
import { PartiesService } from '../src/parties/parties.service';
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
const post = (m: M, path: string, body: object = {}) => http(app).post(path).set(auth(m.token)).send(body);
const get = (m: M, path: string) => http(app).get(path).set(auth(m.token));
const kinds = async (m: M, kind?: string) => (await prisma.notification.findMany({ where: { userId: m.userId, ...(kind ? { kind: kind as never } : {}) } })).map((n) => n.kind);
const proposalBody = (ev: Ev, receiverId: string) => ({
  receiverId,
  eventDayId: ev.days[0].id,
  segmentIds: [ev.days[0].segments[1].id],
  meetingSpotId: ev.meetingSpots[0].id,
});
const partyOf = async (m: M, id: string) => (await get(m, `/parties/${id}`).expect(200)).body;
const proposalsOf = async (m: M) => (await get(m, '/me/proposals').expect(200)).body as Array<Record<string, any>>;

/** 일행(names 명, 모두 입력 마침 → 활성)과 받을 사람들(r1, r2) */
async function world(names: string[]) {
  const { ev, members } = await fx.setup(['r1', 'r2']);
  const [r1, r2] = members;
  const A: M[] = [];
  for (const n of names) A.push(await fx.member(n));
  await fx.ready(A[0], ev);
  const party = (await post(A[0], `/events/${ev.id}/party`).expect(201)).body;
  for (const m of A.slice(1)) await post(m, `/party-invites/${party.invite.url.split('/party-invite/')[1]}/join`).expect(200);
  for (const m of A.slice(1)) await fx.ready(m, ev);
  expect((await partyOf(A[0], party.id)).status).toBe('ACTIVE');
  return { ev, A, r1, r2, partyId: party.id as string };
}
const createDraft = (m: M, partyId: string, ev: Ev, receiver: M) => post(m, `/parties/${partyId}/proposals`, proposalBody(ev, receiver.userId));

describe('초안 만들기', () => {
  it('일행원이 초안을 만들면 나머지 일행원에게 동의 요청이 가고, 받는 사람에게는 보이지 않는다', async () => {
    const { ev, A, r1, partyId } = await world(['a1', 'a2']);
    const res = await createDraft(A[0], partyId, ev, r1).expect(201);
    expect(res.body).toMatchObject({
      status: 'DRAFT',
      direction: 'SENT',
      canCancel: true,
      counterpart: { userId: r1.userId },
      party: { id: partyId },
      consent: { agreed: 1, total: 2, needsMyAgreement: false },
    });
    expect(res.body.party.members.map((m: { userId: string }) => m.userId)).toEqual([A[0].userId, A[1].userId]); // 만든 사람이 먼저
    const other = (await proposalsOf(A[1]))[0];
    expect(other).toMatchObject({ status: 'DRAFT', consent: { needsMyAgreement: true, agreed: 1, total: 2 } });
    expect(await kinds(A[1], 'PARTY_PROPOSAL_ASK')).toHaveLength(1);
    expect(await kinds(A[0], 'PARTY_PROPOSAL_ASK')).toHaveLength(0);
    expect(await proposalsOf(r1)).toEqual([]); // 받는 사람에게는 초안이 보이지 않음
    expect(await kinds(r1, 'PROPOSAL_RECEIVED')).toHaveLength(0);
    // 일행 화면에는 초안과 동의 상황이 보이고, 새 제안은 만들 수 없다
    const party = await partyOf(A[1], partyId);
    expect(party.status).toBe('ACTIVE');
    expect(party.actions.propose).toBe(false);
    expect(party.proposal).toMatchObject({ status: 'DRAFT', needsMyAgreement: true, receiver: { userId: r1.userId } });
    expect(party.proposal.agreements.map((a: { agreed: boolean }) => a.agreed)).toEqual([true, false]);
  });

  it('일행원이 아니거나 일행에게 제안하거나 후보가 아닌 사람에게는 만들 수 없다', async () => {
    const { ev, A, r1, partyId } = await world(['a1', 'a2']);
    await createDraft(r1, partyId, ev, A[0]).expect(404); // 일행원이 아님
    const bad = await createDraft(A[0], partyId, ev, A[1]).expect(400); // 일행에게는 제안 불가
    expect(bad.body.code).toBe('PROPOSAL_INVALID');
    const stranger = await fx.member('s1'); // 입력하지 않은 사람 = 후보가 아님
    await createDraft(A[0], partyId, ev, stranger).expect(404);
    await post(A[0], `/parties/${partyId}/proposals`, { ...proposalBody(ev, r1.userId), meetingSpotId: '00000000-0000-4000-8000-000000000000' }).expect(400);
  });

  it('일행이 활성이 아니면 만들 수 없다', async () => {
    const { ev, members } = await fx.setup(['r1']);
    const lead = await fx.member('l1');
    await fx.ready(lead, ev);
    const friend = await fx.member('l2'); // 입력 전
    const party = (await post(lead, `/events/${ev.id}/party`).expect(201)).body;
    await post(friend, `/party-invites/${party.invite.url.split('/party-invite/')[1]}/join`).expect(200);
    const res = await createDraft(lead, party.id, ev, members[0]).expect(409);
    expect(res.body.code).toBe('PARTY_NOT_READY');
  });

  it('진행 중인 제안이 있으면 새로 만들 수 없다', async () => {
    const { ev, A, r1, r2, partyId } = await world(['a1', 'a2']);
    await createDraft(A[0], partyId, ev, r1).expect(201);
    expect((await createDraft(A[1], partyId, ev, r2).expect(409)).body.code).toBe('PROPOSAL_EXISTS');
  });

  it('일행 중 누구라도 그 시간에 다른 약속이 있으면 만들 수 없다', async () => {
    const { ev, A, r1, r2, partyId } = await world(['a1', 'a2']);
    // a2가 r2와 같은 시간(공연 구간)에 약속이 있음
    const id = await createAndAccept(ev, A[1], r2);
    expect(id).toBeTruthy();
    const res = await createDraft(A[0], partyId, ev, r1).expect(409);
    expect(res.body.code).toBe('APPOINTMENT_OVERLAP');
  });

  it('제안을 제한받는 일행원이 있으면 만들 수 없다 (누구인지는 알리지 않음)', async () => {
    const { ev, A, r1, r2, partyId } = await world(['a1', 'a2']);
    const apptId = await createAndAccept(ev, r2, r1); // 신고에 필요한 약속 하나 (일행과 무관)
    const report = await prisma.report.create({
      data: { reporterId: r1.userId, targetId: A[1].userId, appointmentId: apptId, category: 'OTHER', priority: 'GENERAL', status: 'QUEUED' },
    });
    await prisma.userRestriction.create({ data: { userId: A[1].userId, reportId: report.id, kind: 'PROPOSALS', endsAt: kst('2026-11-20T00:00:00') } });
    const res = await createDraft(A[0], partyId, ev, r1).expect(403);
    expect(res.body.code).toBe('RESTRICTED');
    expect(JSON.stringify(res.body)).not.toContain(A[1].userId);
  });
});

async function createAndAccept(ev: Ev, from: M, to: M) {
  const sent = await post(from, `/events/${ev.id}/proposals`, proposalBody(ev, to.userId)).expect(201);
  const accepted = await post(to, `/proposals/${sent.body.id}/accept`).expect(200);
  return accepted.body.id as string;
}

describe('전원 동의', () => {
  it('일행원이 모두 동의하면 제안이 나가고, 받는 사람에게 일행 이름으로 알림이 가며, 일행은 제안 중이 된다. 만료는 나간 때부터 24시간', async () => {
    const { ev, A, r1, partyId } = await world(['a1', 'a2']);
    const draft = (await createDraft(A[0], partyId, ev, r1).expect(201)).body;
    clock.current = kst('2026-11-07T14:00:00'); // 2시간 뒤에 동의
    const sent = (await post(A[1], `/proposals/${draft.id}/agree`).expect(200)).body;
    expect(sent.status).toBe('SENT');
    expect(sent.expiresAt).toBe(kst('2026-11-08T14:00:00').toISOString());
    expect((await partyOf(A[0], partyId)).status).toBe('PROPOSING');
    const party = await partyOf(A[0], partyId);
    expect(party.proposal).toMatchObject({ status: 'SENT', canCancel: true });
    expect(party.actions).toMatchObject({ propose: false, candidates: false });
    const received = (await proposalsOf(r1))[0];
    expect(received).toMatchObject({ status: 'SENT', direction: 'RECEIVED', counterpart: { userId: A[0].userId }, consent: null });
    expect(received.party.members.map((m: { userId: string }) => m.userId)).toEqual([A[0].userId, A[1].userId]);
    const note = (await prisma.notification.findMany({ where: { userId: r1.userId, kind: 'PROPOSAL_RECEIVED' } }))[0];
    expect(note.body).toContain('테스트a1님 외 1명');
    expect(await kinds(A[0], 'PARTY_PROPOSAL_SENT')).toHaveLength(1);
    expect(await kinds(A[1], 'PARTY_PROPOSAL_SENT')).toHaveLength(1);
  });

  it('셋 이상이면 전원이 동의해야 나간다', async () => {
    const { ev, A, r1, partyId } = await world(['a1', 'a2', 'a3']);
    const draft = (await createDraft(A[0], partyId, ev, r1).expect(201)).body;
    expect(draft.consent).toMatchObject({ agreed: 1, total: 3 });
    await post(A[1], `/proposals/${draft.id}/agree`).expect(200);
    expect((await proposalsOf(r1))).toEqual([]);
    expect((await partyOf(A[0], partyId)).status).toBe('ACTIVE');
    expect((await partyOf(A[2], partyId)).proposal).toMatchObject({ status: 'DRAFT', needsMyAgreement: true });
    await post(A[2], `/proposals/${draft.id}/agree`).expect(200);
    expect((await proposalsOf(r1))[0].status).toBe('SENT');
  });

  it('한 명이라도 동의하지 않으면 초안이 취소되고 다시 만들 수 있다', async () => {
    const { ev, A, r1, partyId } = await world(['a1', 'a2', 'a3']);
    const draft = (await createDraft(A[0], partyId, ev, r1).expect(201)).body;
    await post(A[1], `/proposals/${draft.id}/agree`).expect(200);
    await post(A[2], `/proposals/${draft.id}/decline`).expect(200);
    expect((await prisma.proposal.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('CANCELLED');
    const note = (await prisma.notification.findMany({ where: { userId: A[0].userId, kind: 'PARTY_PROPOSAL_DECLINED' } }))[0];
    expect(note.body).toContain('테스트a3');
    expect(await kinds(r1, 'PARTY_PROPOSAL_DECLINED')).toHaveLength(0);
    expect((await partyOf(A[0], partyId)).actions.propose).toBe(true);
    await createDraft(A[1], partyId, ev, r1).expect(201);
  });

  it('24시간 안에 전원이 동의하지 않으면 만료된다', async () => {
    const { ev, A, r1, partyId } = await world(['a1', 'a2']);
    const draft = (await createDraft(A[0], partyId, ev, r1).expect(201)).body;
    clock.current = kst('2026-11-08T12:00:01');
    await post(A[1], `/proposals/${draft.id}/agree`).expect(409);
    expect((await prisma.proposal.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('EXPIRED');
    expect((await partyOf(A[0], partyId)).actions.propose).toBe(true);
  });

  it('이미 동의했거나 제안을 만든 사람, 받는 사람, 남은 사람은 다시 동의할 수 없다', async () => {
    const { ev, A, r1, partyId } = await world(['a1', 'a2']);
    const draft = (await createDraft(A[0], partyId, ev, r1).expect(201)).body;
    await post(A[0], `/proposals/${draft.id}/agree`).expect(404); // 만든 사람은 따로 동의하지 않음
    await post(r1, `/proposals/${draft.id}/agree`).expect(404);
    await post(r1, `/proposals/${draft.id}/decline`).expect(404);
    await post(A[1], `/proposals/${draft.id}/agree`).expect(200);
    await post(A[1], `/proposals/${draft.id}/agree`).expect(409); // 이미 나감
  });

  it('초안은 일행원 누구나 취소할 수 있고, 받는 사람은 취소할 수 없다', async () => {
    const { ev, A, r1, partyId } = await world(['a1', 'a2']);
    const draft = (await createDraft(A[0], partyId, ev, r1).expect(201)).body;
    await post(r1, `/proposals/${draft.id}/cancel`).expect(404);
    await post(A[1], `/proposals/${draft.id}/cancel`).expect(200);
    expect((await prisma.proposal.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('CANCELLED');
  });
});

describe('제안을 받은 사람의 답', () => {
  async function sent(names = ['a1', 'a2']) {
    const w = await world(names);
    const draft = (await createDraft(w.A[0], w.partyId, w.ev, w.r1).expect(201)).body;
    for (const m of w.A.slice(1)) await post(m, `/proposals/${draft.id}/agree`).expect(200);
    return { ...w, id: draft.id as string };
  }

  it('거절하면 일행 전원에게 알리고 일행은 활성으로 돌아간다', async () => {
    const { A, r1, id, partyId } = await sent();
    await post(r1, `/proposals/${id}/reject`).expect(200);
    expect((await partyOf(A[0], partyId)).status).toBe('ACTIVE');
    expect(await kinds(A[0], 'PROPOSAL_REJECTED')).toHaveLength(1);
    expect(await kinds(A[1], 'PROPOSAL_REJECTED')).toHaveLength(1);
  });

  it('일행원 누구나 보낸 제안을 취소할 수 있고, 취소하면 일행이 활성으로 돌아간다', async () => {
    const { A, r1, id, partyId } = await sent();
    await post(A[1], `/proposals/${id}/cancel`).expect(200); // 만든 사람이 아닌 일행원
    expect((await partyOf(A[0], partyId)).status).toBe('ACTIVE');
    await post(r1, `/proposals/${id}/accept`).expect(409);
  });

  it('답이 없으면 24시간 뒤 만료되고 일행이 활성으로 돌아간다 (시간 작업)', async () => {
    const { A, id, partyId } = await sent();
    clock.current = kst('2026-11-08T12:00:01');
    await app.get(PartiesService).settleAll();
    await prisma.proposal.findUniqueOrThrow({ where: { id } });
    // 시간 작업(1분마다)과 같은 함수
    const { ProposalsService } = await import('../src/proposals/proposals.service');
    await app.get(ProposalsService).expireDue();
    expect((await prisma.proposal.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
    expect((await partyOf(A[0], partyId)).status).toBe('ACTIVE');
  });

  it('수락하면 일행 전원과 받은 사람이 함께하는 약속이 만들어진다 (보낸 쪽 A, 받은 쪽 B)', async () => {
    const { A, r1, id, partyId } = await sent(['a1', 'a2', 'a3']);
    const appt = (await post(r1, `/proposals/${id}/accept`).expect(200)).body;
    expect(appt.status).toBe('PENDING_CONFIRM');
    expect(appt.companions.map((c: { sameSide: boolean }) => c.sameSide)).toEqual([false, false, false]);
    const rows = await prisma.appointmentParticipant.findMany({ where: { appointmentId: appt.id } });
    expect(rows.map((r) => [r.userId, r.side]).sort()).toEqual([...A.map((m) => [m.userId, 'A']), [r1.userId, 'B']].sort());
    const mine = (await get(A[2], `/appointments/${appt.id}`).expect(200)).body;
    expect(mine.companions).toHaveLength(3);
    expect(mine.companions[0].userId).toBe(r1.userId); // 만나는 상대(받은 사람)가 먼저
    for (const m of A) expect(await kinds(m, 'PROPOSAL_ACCEPTED')).toHaveLength(1);
    expect((await partyOf(A[0], partyId)).status).toBe('ACTIVE'); // 다른 날 제안을 또 보낼 수 있음
  });

  it('일행 중 누구라도 그 시간에 다른 약속이 생겼으면 수락할 수 없다', async () => {
    const { ev, A, r1, r2, id } = await sent();
    await createAndAccept(ev, A[1], r2);
    const res = await post(r1, `/proposals/${id}/accept`).expect(409);
    expect(res.body.code).toBe('APPOINTMENT_OVERLAP');
  });

  it('받는 사람이 아닌 사람은 답할 수 없다', async () => {
    const { A, r2, id } = await sent();
    await post(r2, `/proposals/${id}/accept`).expect(404);
    await post(A[0], `/proposals/${id}/accept`).expect(404);
  });
});

describe('일행이 바뀔 때 (누가 빠져도 남은 사람끼리 계속)', () => {
  it('초안 중에 아직 동의하지 않은 사람이 빠지면, 남은 사람이 모두 동의한 상태라 바로 제안이 나간다', async () => {
    const { ev, A, r1, partyId } = await world(['a1', 'a2', 'a3']);
    const draft = (await createDraft(A[0], partyId, ev, r1).expect(201)).body;
    await post(A[1], `/proposals/${draft.id}/agree`).expect(200);
    await post(A[2], `/parties/${partyId}/leave`).expect(200);
    expect((await proposalsOf(r1))[0].status).toBe('SENT');
    expect((await partyOf(A[0], partyId)).status).toBe('PROPOSING');
    expect((await partyOf(A[0], partyId)).members).toHaveLength(2);
  });

  it('초안을 만든 사람이 빠져도 초안은 계속된다', async () => {
    const { ev, A, r1, partyId } = await world(['a1', 'a2', 'a3']);
    const draft = (await createDraft(A[0], partyId, ev, r1).expect(201)).body;
    await post(A[0], `/parties/${partyId}/leave`).expect(200);
    const mine = (await proposalsOf(A[1]))[0];
    expect(mine).toMatchObject({ id: draft.id, status: 'DRAFT', consent: { needsMyAgreement: true } });
    await post(A[1], `/proposals/${draft.id}/agree`).expect(200);
    await post(A[2], `/proposals/${draft.id}/agree`).expect(200);
    expect((await proposalsOf(r1))[0].status).toBe('SENT');
  });

  it('보낸 뒤에 한 명이 빠져도 제안은 계속되고, 수락하면 남은 사람들과 약속이 만들어진다', async () => {
    const { ev, A, r1, partyId } = await world(['a1', 'a2', 'a3']);
    const draft = (await createDraft(A[0], partyId, ev, r1).expect(201)).body;
    for (const m of [A[1], A[2]]) await post(m, `/proposals/${draft.id}/agree`).expect(200);
    await post(A[2], `/parties/${partyId}/leave`).expect(200);
    expect((await proposalsOf(r1))[0].party.members).toHaveLength(2);
    const appt = (await post(r1, `/proposals/${draft.id}/accept`).expect(200)).body;
    expect(appt.companions).toHaveLength(2);
    expect(await prisma.appointmentParticipant.count({ where: { appointmentId: appt.id } })).toBe(3);
    void ev;
  });

  it('한 명만 남아 일행이 풀리면 초안은 취소되고, 보낸 제안은 남은 사람의 개인 제안으로 이어진다', async () => {
    const w1 = await world(['a1', 'a2']);
    const draft = (await createDraft(w1.A[0], w1.partyId, w1.ev, w1.r1).expect(201)).body;
    await post(w1.A[1], `/parties/${w1.partyId}/leave`).expect(200);
    expect((await prisma.proposal.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('CANCELLED');
  });

  it('보낸 뒤 일행이 풀리면 제안은 남은 한 명의 개인 제안으로 바뀌고, 수락하면 1:1 약속이 된다', async () => {
    const { ev, A, r1, partyId } = await world(['a1', 'a2']);
    const draft = (await createDraft(A[0], partyId, ev, r1).expect(201)).body;
    await post(A[1], `/proposals/${draft.id}/agree`).expect(200);
    await post(A[0], `/parties/${partyId}/leave`).expect(200); // 만든 사람이 빠져 a2만 남음
    const row = await prisma.proposal.findUniqueOrThrow({ where: { id: draft.id } });
    expect(row).toMatchObject({ status: 'SENT', senderId: A[1].userId, senderPartyId: null });
    const received = (await proposalsOf(r1))[0];
    expect(received).toMatchObject({ party: null, counterpart: { userId: A[1].userId } });
    const appt = (await post(r1, `/proposals/${draft.id}/accept`).expect(200)).body;
    expect(appt.companions).toHaveLength(1);
    expect(await prisma.appointmentParticipant.count({ where: { appointmentId: appt.id } })).toBe(2);
  });

  it('대표가 일행을 풀면 초안과 보낸 제안이 모두 취소된다', async () => {
    const { ev, A, r1, partyId } = await world(['a1', 'a2']);
    const draft = (await createDraft(A[0], partyId, ev, r1).expect(201)).body;
    await post(A[0], `/parties/${partyId}/disband`).expect(200);
    expect((await prisma.proposal.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('CANCELLED');
  });

  it('보낸 제안이 있는 일행을 대표가 풀면 제안이 취소되고 받는 사람은 수락할 수 없다', async () => {
    const { ev, A, r1, partyId } = await world(['a1', 'a2']);
    const draft = (await createDraft(A[0], partyId, ev, r1).expect(201)).body;
    await post(A[1], `/proposals/${draft.id}/agree`).expect(200);
    await post(A[0], `/parties/${partyId}/disband`).expect(200);
    expect((await prisma.proposal.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('CANCELLED');
    await post(r1, `/proposals/${draft.id}/accept`).expect(409);
  });
});

describe('개인 제안은 그대로', () => {
  it('개인이 보낸 제안에는 일행 정보가 없고 취소할 수 있다', async () => {
    const { ev, members } = await fx.setup(['p1', 'p2']);
    const sent = (await post(members[0], `/events/${ev.id}/proposals`, proposalBody(ev, members[1].userId)).expect(201)).body;
    expect(sent).toMatchObject({ party: null, consent: null, canCancel: true });
    const recv = (await proposalsOf(members[1]))[0];
    expect(recv).toMatchObject({ party: null, canCancel: false });
  });
});
