/**
 * 9-1단계: 일행 만들기·초대·합류·전원 입력·빠지기·해체·일행 후보
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

type Member = Awaited<ReturnType<typeof fx.member>>;
const tokenOf = (url: string) => url.split('/party-invite/')[1];

async function createParty(leader: Member, eventId: string) {
  return (await http(app).post(`/events/${eventId}/party`).set(auth(leader.token)).send({}).expect(201)).body;
}
const getParty = (m: Member, id: string) => http(app).get(`/parties/${id}`).set(auth(m.token));
const join = (m: Member, url: string) => http(app).post(`/party-invites/${tokenOf(url)}/join`).set(auth(m.token)).send({});
const kinds = async (m: Member) => (await prisma.notification.findMany({ where: { userId: m.userId } })).map((n) => n.kind);

/** 행사와 입력을 마친 사람 n명 */
async function ready(names: string[]) {
  const { ev, members } = await fx.setup(names);
  return { ev, members };
}

describe('만들기와 초대', () => {
  it('만든 사람이 대표가 되고 초대 중으로 시작한다. 초대 링크는 대표에게만 보인다', async () => {
    const { ev, members: [a, b] } = await ready(['a', 'b']);
    const party = await createParty(a, ev.id);
    expect(party).toMatchObject({ status: 'INVITING', statusLabel: '초대 중', minSize: 2, maxSize: 4 });
    expect(party.members).toEqual([expect.objectContaining({ isMe: true, isLeader: true, ready: true })]);
    expect(party.invite.url).toMatch(/\/party-invite\/[0-9a-f-]+\.[A-Za-z0-9_-]{22}$/);
    expect(party.actions).toMatchObject({ disband: true, candidates: false, proceedWithout: false });
    await getParty(b, party.id).expect(404); // 아직 일행이 아닌 사람에게는 없는 일행
  });

  it('한 행사에는 한 일행에만 있을 수 있다', async () => {
    const { ev, members: [a, b] } = await ready(['a', 'b']);
    await createParty(a, ev.id);
    const res = await http(app).post(`/events/${ev.id}/party`).set(auth(a.token)).send({}).expect(409);
    expect(res.body.code).toBe('PARTY_EXISTS');
    const other = await createParty(b, ev.id);
    const mine = await http(app).get(`/events/${ev.id}/party`).set(auth(a.token)).expect(200);
    expect(mine.body.party.id).not.toBe(other.id);
  });

  it('로그인이 없거나 청소년이거나 가입을 마치지 않은 사람은 만들 수 없다', async () => {
    const { ev, members: [a] } = await ready(['a', 'b']);
    await http(app).post(`/events/${ev.id}/party`).send({}).expect(401);
    await prisma.user.update({ where: { id: a.userId }, data: { ageClass: 'TEEN' } });
    const res = await http(app).post(`/events/${ev.id}/party`).set(auth(a.token)).send({}).expect(403);
    expect(res.body.code).toBe('PARTY_ADULT_ONLY');
  });

  it('없는 행사나 끝난 행사에는 만들 수 없다', async () => {
    const { ev, members: [a] } = await ready(['a']);
    await http(app).post('/events/00000000-0000-4000-8000-000000000000/party').set(auth(a.token)).send({}).expect(404);
    clock.current = kst('2026-12-14T12:00:00');
    await http(app).post(`/events/${ev.id}/party`).set(auth(a.token)).send({}).expect(404);
  });
});

describe('합류', () => {
  it('초대를 열면 행사와 대표 별명만 보이고, 합류하면 확인 중이 된다. 대표에게 알림이 간다', async () => {
    const { ev, members: [a, b] } = await ready(['a', 'b']);
    const party = await createParty(a, ev.id);
    const preview = await http(app).get(`/party-invites/${tokenOf(party.invite.url)}`).set(auth(b.token)).expect(200);
    expect(preview.body).toMatchObject({ event: { id: ev.id }, leaderNickname: '테스트a', memberCount: 1, maxSize: 4, joinable: true, problem: null });
    expect(Object.keys(preview.body).sort()).toEqual(['event', 'joinable', 'leaderNickname', 'maxSize', 'memberCount', 'problem']);
    const joined = (await join(b, party.invite.url).expect(200)).body;
    expect(joined.status).toBe('ACTIVE'); // 둘 다 입력을 마쳤으므로 곧바로 활성
    expect(await kinds(a)).toEqual(expect.arrayContaining(['PARTY_JOINED', 'PARTY_READY']));
    expect(await kinds(b)).toContain('PARTY_READY');
    expect(joined.invite).toBeNull(); // 합류한 친구에게는 초대 링크가 없다
    expect((await getParty(a, party.id).expect(200)).body.invite).toBeNull(); // 시작한 뒤에는 대표도 링크가 없다
  });

  it('입력을 마치지 않은 친구가 합류하면 확인 중에 머문다', async () => {
    const { ev, members: [a] } = await ready(['a']);
    const n = await fx.member('n1');
    const party = await createParty(a, ev.id);
    const joined = (await join(n, party.invite.url).expect(200)).body;
    expect(joined.status).toBe('CONFIRMING');
    expect(joined.guide).toContain('내가');
    expect((await getParty(a, party.id).expect(200)).body.guide).toContain('테스트n1님이'); // 대표에게는 친구 이름으로
    expect(joined.members.find((m: { isMe: boolean }) => m.isMe).ready).toBe(false);
    // 입력과 티켓 인증을 마치면 자동으로 활성
    await fx.ready(n, ev);
    expect((await getParty(a, party.id).expect(200)).body.status).toBe('ACTIVE');
  });

  it('서명이 틀리거나 없는 초대는 모두 같은 답이다', async () => {
    const { ev, members: [a, b] } = await ready(['a', 'b']);
    const party = await createParty(a, ev.id);
    const token = tokenOf(party.invite.url);
    const bodies = [];
    for (const t of [`${token.slice(0, -1)}x`, `${party.id}.AAAAAAAAAAAAAAAAAAAAAA`, 'nope', '.']) {
      bodies.push((await http(app).get(`/party-invites/${t}`).set(auth(b.token)).expect(404)).body);
      await http(app).post(`/party-invites/${t}/join`).set(auth(b.token)).send({}).expect(404);
    }
    expect(new Set(bodies.map((x) => JSON.stringify(x))).size).toBe(1);
    expect(bodies[0].code).toBe('INVITE_UNAVAILABLE');
  });

  it('다시 눌러도 한 번만 합류한다', async () => {
    const { ev, members: [a, b] } = await ready(['a', 'b']);
    const party = await createParty(a, ev.id);
    await join(b, party.invite.url).expect(200);
    await join(b, party.invite.url).expect(200);
    expect(await prisma.partyMember.count({ where: { partyId: party.id, active: true } })).toBe(2);
  });

  it('최대 4명까지. 동시에 눌러도 정원을 넘지 않는다', async () => {
    const { ev, members } = await ready(['a', 'b', 'c', 'd', 'e']);
    const [a, b, c, d, e] = members;
    const n = await fx.member('n1'); // 입력 전 → 확인 중에 머물러 링크가 유지됨
    const party = await createParty(a, ev.id);
    await join(n, party.invite.url).expect(200);
    await join(b, party.invite.url).expect(200);
    const [r1, r2] = await Promise.all([join(c, party.invite.url), join(d, party.invite.url)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 404]);
    expect(await prisma.partyMember.count({ where: { partyId: party.id, active: true } })).toBe(4);
    const full = await http(app).get(`/party-invites/${tokenOf((await getParty(a, party.id).expect(200)).body.invite?.url ?? 'x.y')}`).set(auth(e.token));
    expect(full.status).toBe(404); // 가득 차면 링크도 숨겨짐
  });

  it('이미 시작한 일행(활성)에는 합류할 수 없다', async () => {
    const { ev, members: [a, b, c] } = await ready(['a', 'b', 'c']);
    const party = await createParty(a, ev.id);
    await join(b, party.invite.url).expect(200); // 곧바로 활성
    const res = await join(c, party.invite.url).expect(404);
    expect(res.body.message).toContain('이미 시작한');
  });

  it('이 행사에 다른 일행이 있으면 합류할 수 없다', async () => {
    const { ev, members: [a, b, c] } = await ready(['a', 'b', 'c']);
    const n = await fx.member('n1');
    const p1 = await createParty(a, ev.id);
    const p2 = await createParty(b, ev.id);
    await join(n, p1.invite.url).expect(200);
    const res = await join(n, p2.invite.url).expect(404);
    expect(res.body.message).toContain('이미 다른 일행');
    void c;
  });

  it('차단한 사람이 일행에 있으면 초대가 없는 것처럼 보인다', async () => {
    const { ev, members: [a, b] } = await ready(['a', 'b']);
    const party = await createParty(a, ev.id);
    await http(app).post('/blocks').set(auth(b.token)).send({ userId: a.userId }).expect(200);
    await http(app).get(`/party-invites/${tokenOf(party.invite.url)}`).set(auth(b.token)).expect(404);
    await join(b, party.invite.url).expect(404);
  });

  it('초대는 48시간 뒤 사라지고, 아무도 합류하지 않았으면 일행이 풀린다', async () => {
    const { ev, members: [a, b] } = await ready(['a', 'b']);
    const party = await createParty(a, ev.id);
    clock.current = kst('2026-11-09T11:59:00');
    expect((await http(app).get(`/party-invites/${tokenOf(party.invite.url)}`).set(auth(b.token)).expect(200)).body.joinable).toBe(true);
    clock.current = kst('2026-11-09T12:00:00');
    const preview = (await http(app).get(`/party-invites/${tokenOf(party.invite.url)}`).set(auth(b.token)).expect(200)).body;
    expect(preview).toMatchObject({ joinable: false });
    expect(preview.problem).toContain('초대 시간');
    await app.get(PartiesService).settleAll();
    await getParty(a, party.id).expect(404);
    expect((await prisma.party.findUniqueOrThrow({ where: { id: party.id } })).status).toBe('DISBANDED');
    // 풀린 뒤에는 새로 만들 수 있다
    await createParty(a, ev.id);
  });
});

describe('입력하지 않은 친구', () => {
  it('합류 24시간 뒤 재촉은 한 번만 간다', async () => {
    const { ev, members: [a] } = await ready(['a']);
    const n = await fx.member('n1');
    const party = await createParty(a, ev.id);
    await join(n, party.invite.url).expect(200);
    const parties = app.get(PartiesService);
    clock.current = kst('2026-11-08T11:59:00');
    await parties.settleAll();
    expect(await kinds(n)).not.toContain('PARTY_INPUT_REMIND');
    clock.current = kst('2026-11-08T12:00:00');
    await parties.settleAll();
    await parties.settleAll();
    clock.current = kst('2026-11-08T20:00:00');
    await parties.settleAll();
    expect((await kinds(n)).filter((k) => k === 'PARTY_INPUT_REMIND')).toHaveLength(1);
    expect((await kinds(a)).filter((k) => k === 'PARTY_INPUT_REMIND')).toHaveLength(0); // 입력을 마친 대표에게는 없음
  });

  it('대표가 입력하지 않은 친구를 빼고 진행할 수 있다. 빠진 친구에게 알림이 가고 일행은 사라진다', async () => {
    const { ev, members: [a, b] } = await ready(['a', 'b']);
    const n = await fx.member('n1');
    const party = await createParty(a, ev.id);
    await join(n, party.invite.url).expect(200);
    // b는 초대가 끝난 뒤가 아니라 확인 중 동안 합류
    const nb = (await join(b, party.invite.url).expect(200)).body;
    expect(nb.status).toBe('CONFIRMING');
    expect(nb.actions.proceedWithout).toBe(false); // 대표만
    await http(app).post(`/parties/${party.id}/proceed`).set(auth(b.token)).send({}).expect(403);
    expect((await getParty(a, party.id).expect(200)).body.actions.proceedWithout).toBe(true);
    const done = (await http(app).post(`/parties/${party.id}/proceed`).set(auth(a.token)).send({}).expect(200)).body;
    expect(done.status).toBe('ACTIVE');
    expect(done.members.map((m: { nickname: string }) => m.nickname).sort()).toEqual(['테스트a', '테스트b']);
    expect(await kinds(n)).toContain('PARTY_REMOVED');
    await getParty(n, party.id).expect(404);
  });

  it('입력을 마친 사람이 2명보다 적으면 진행할 수 없다', async () => {
    const { ev, members: [a] } = await ready(['a']);
    const n = await fx.member('n1');
    const party = await createParty(a, ev.id);
    await join(n, party.invite.url).expect(200);
    const res = await http(app).post(`/parties/${party.id}/proceed`).set(auth(a.token)).send({}).expect(409);
    expect(res.body.code).toBe('PARTY_NOT_READY');
  });
});

describe('빠지기와 해체 (누가 빠져도 남은 사람끼리 계속)', () => {
  async function trio() {
    const { ev, members } = await ready(['a', 'b', 'c']);
    const [a, b, c] = members;
    const n = await fx.member('n1'); // 일행이 확인 중인 동안 계속 합류시키려고
    const party = await createParty(a, ev.id);
    await join(n, party.invite.url).expect(200);
    await join(b, party.invite.url).expect(200);
    await join(c, party.invite.url).expect(200);
    await fx.ready(n, ev);
    expect((await getParty(a, party.id).expect(200)).body.status).toBe('ACTIVE');
    return { ev, a, b, c, n, id: party.id as string };
  }

  it('한 명이 빠져도 남은 사람끼리 계속하고 알림이 간다', async () => {
    const { a, b, c, n, id } = await trio();
    await http(app).post(`/parties/${id}/leave`).set(auth(b.token)).send({}).expect(200);
    const after = (await getParty(a, id).expect(200)).body;
    expect(after.status).toBe('ACTIVE');
    expect(after.members).toHaveLength(3);
    expect(await kinds(a)).toContain('PARTY_MEMBER_LEFT');
    expect(await kinds(c)).toContain('PARTY_MEMBER_LEFT');
    expect(await kinds(n)).toContain('PARTY_MEMBER_LEFT');
    await getParty(b, id).expect(404);
  });

  it('대표가 빠지면 가장 먼저 합류한 사람이 대표가 된다', async () => {
    const { a, b, n, id } = await trio();
    await http(app).post(`/parties/${id}/leave`).set(auth(a.token)).send({}).expect(200);
    const after = (await getParty(n, id).expect(200)).body; // n이 가장 먼저 합류
    expect(after.members.find((m: { isLeader: boolean }) => m.isLeader).userId).toBe(n.userId);
    expect(after.actions.disband).toBe(true);
    expect((await getParty(b, id).expect(200)).body.actions.disband).toBe(false);
  });

  it('한 명만 남으면 일행이 풀리고, 남은 사람에게 알림이 간다', async () => {
    const { ev, members: [a, b] } = await ready(['a', 'b']);
    const party = await createParty(a, ev.id);
    await join(b, party.invite.url).expect(200);
    await http(app).post(`/parties/${party.id}/leave`).set(auth(b.token)).send({}).expect(200);
    await getParty(a, party.id).expect(404);
    expect((await prisma.party.findUniqueOrThrow({ where: { id: party.id } })).status).toBe('DISBANDED');
    expect(await kinds(a)).toContain('PARTY_DISBANDED');
    expect(await prisma.partyMember.count({ where: { partyId: party.id, active: true } })).toBe(0);
  });

  it('남은 사람이 아직 입력 중이면 확인 중으로 계속하다가, 전원이 마치면 활성이 된다', async () => {
    const { ev, members: [a] } = await ready(['a']);
    const n1 = await fx.member('n1');
    const n2 = await fx.member('n2');
    const party = await createParty(a, ev.id);
    await join(n1, party.invite.url).expect(200);
    await join(n2, party.invite.url).expect(200);
    await http(app).post(`/parties/${party.id}/leave`).set(auth(n2.token)).send({}).expect(200);
    expect((await getParty(a, party.id).expect(200)).body.status).toBe('CONFIRMING');
    await fx.ready(n1, ev);
    expect((await getParty(a, party.id).expect(200)).body.status).toBe('ACTIVE');
  });

  it('대표만 해체할 수 있고, 해체하면 모두 나가고 새로 만들 수 있다', async () => {
    const { ev, a, b, id } = await trio();
    await http(app).post(`/parties/${id}/disband`).set(auth(b.token)).send({}).expect(403);
    await http(app).post(`/parties/${id}/disband`).set(auth(a.token)).send({}).expect(200);
    await getParty(b, id).expect(404);
    expect(await kinds(b)).toContain('PARTY_DISBANDED');
    await createParty(b, ev.id);
  });

  it('일행이 아닌 사람은 빠지기·해체·진행을 할 수 없다', async () => {
    const { ev, members: [a, b] } = await ready(['a', 'b']);
    const party = await createParty(a, ev.id);
    for (const path of ['leave', 'disband', 'proceed']) {
      await http(app).post(`/parties/${party.id}/${path}`).set(auth(b.token)).send({}).expect(404);
    }
  });

  it('행사가 끝나면 일행도 풀린다', async () => {
    const { ev, members: [a, b] } = await ready(['a', 'b']);
    const party = await createParty(a, ev.id);
    await join(b, party.invite.url).expect(200);
    clock.current = kst('2026-12-14T12:00:00');
    await app.get(PartiesService).settleAll();
    await getParty(a, party.id).expect(404);
  });
});

describe('일행 후보', () => {
  it('활성이 되기 전에는 후보를 볼 수 없다', async () => {
    const { ev, members: [a] } = await ready(['a']);
    const party = await createParty(a, ev.id);
    const res = await http(app).get(`/parties/${party.id}/candidates`).set(auth(a.token)).expect(409);
    expect(res.body.code).toBe('PARTY_NOT_READY');
  });

  it('일행 구성원은 후보가 아니고, 일행 밖 사람은 후보가 된다. 일행이 아닌 사람은 볼 수 없다', async () => {
    const { ev, members: [a, b, c, d] } = await ready(['a', 'b', 'c', 'd']);
    const party = await createParty(a, ev.id);
    await join(b, party.invite.url).expect(200);
    const res = (await http(app).get(`/parties/${party.id}/candidates`).set(auth(a.token)).expect(200)).body;
    const ids = res.candidates.map((x: { userId: string }) => x.userId).sort();
    expect(ids).toEqual([c.userId, d.userId].sort());
    // 같은 목록을 일행의 다른 사람도 본다
    expect((await http(app).get(`/parties/${party.id}/candidates`).set(auth(b.token)).expect(200)).body.total).toBe(2);
    await http(app).get(`/parties/${party.id}/candidates`).set(auth(c.token)).expect(404);
    const detail = (await http(app).get(`/parties/${party.id}/candidates/${c.userId}`).set(auth(a.token)).expect(200)).body;
    expect(detail.userId).toBe(c.userId);
    await http(app).get(`/parties/${party.id}/candidates/${b.userId}`).set(auth(a.token)).expect(404); // 일행 구성원
  });

  it('일행 중 한 명이라도 차단한 사람은 후보에서 숨겨진다', async () => {
    const { ev, members: [a, b, c, d] } = await ready(['a', 'b', 'c', 'd']);
    const party = await createParty(a, ev.id);
    await join(b, party.invite.url).expect(200);
    await http(app).post('/blocks').set(auth(b.token)).send({ userId: c.userId }).expect(200);
    const res = (await http(app).get(`/parties/${party.id}/candidates`).set(auth(a.token)).expect(200)).body;
    expect(res.candidates.map((x: { userId: string }) => x.userId)).toEqual([d.userId]);
  });

  it('일행의 시간이 겹치지 않으면 후보가 없다', async () => {
    const { ev, members: [a, b, c] } = await ready(['a', 'b', 'c']);
    // b는 첫째 날 굿즈 줄만, a는 공연만 같이하도록 바꿈 → 전원이 겹치는 구간이 없음
    const segs = ev.days[0].segments;
    const put = (m: Member, ids: string[]) =>
      http(app)
        .put(`/events/${ev.id}/preference`)
        .set(auth(m.token))
        .send({
          days: ev.days.map((d, i) => ({ eventDayId: d.id, arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: i === 0 ? ids : d.segments.map((s) => s.id) })).slice(0, 1),
          tempoAnswers: [2, 2, 2],
          immersionAnswers: [2, 2],
          must: { gender: 'ANY', age: 'ANY', promises: [] },
        })
        .expect(200);
    await put(a, [segs[0].id]);
    await put(b, [segs[1].id]);
    const party = await createParty(a, ev.id);
    await join(b, party.invite.url).expect(200);
    const res = (await http(app).get(`/parties/${party.id}/candidates`).set(auth(a.token)).expect(200)).body;
    expect(res.total).toBe(0);
    void c;
  });
});
