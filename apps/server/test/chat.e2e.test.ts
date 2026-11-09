/**
 * 5단계: 앱 안 채팅과 연락처 차단
 * 약속(12-12 15:00~17:00)이 생기면 열리고, 끝나고 24시간 뒤 닫힘. 취소되면 바로 닫힘.
 */
import { Logger, type INestApplication } from '@nestjs/common';
import { fixtures, kst } from './appointment-fixtures';
import { auth, http, resetDb, startApp, TestClock } from './helpers';

let app: INestApplication;
let f: ReturnType<typeof fixtures>;
const clock = new TestClock();

beforeAll(async () => {
  app = await startApp(clock, false, () => 0.99);
  f = fixtures(app);
});

beforeEach(async () => {
  clock.current = kst('2026-11-07T12:00:00');
  await resetDb(app);
  // 시계를 한 달 넘게 돌리므로 이 테스트에서만 로그인 유지 기간을 늘립니다.
  await f.prisma.policyValue.create({ data: { key: 'SESSION_TTL_DAYS', value: 365, effectiveFrom: kst('2026-01-01T00:00:00') } });
});

afterAll(async () => {
  await app.close();
});

type M = { token: string; userId: string };
const chat = (m: M, id: string, after?: number) => http(app).get(`/appointments/${id}/chat${after !== undefined ? `?after=${after}` : ''}`).set(auth(m.token));
const say = (m: M, id: string, body: string, confirmContact?: boolean) =>
  http(app).post(`/appointments/${id}/chat`).set(auth(m.token)).send(confirmContact === undefined ? { body } : { body, confirmContact });

async function pair() {
  const { ev, members } = await f.setup(['a', 'b', 'c']);
  const [a, b, c] = members;
  const id = await f.appoint(a, b, ev);
  return { ev, a, b, c, id };
}

describe('채팅이 열리는 때와 누가 볼 수 있는지', () => {
  test('제안을 수락하기 전에는 채팅이 없다', async () => {
    const { ev, members } = await f.setup();
    const [a, b] = members;
    await f.propose(a, b, ev);
    expect((await http(app).get('/me/chats').set(auth(a.token)).expect(200)).body).toEqual([]);
  });

  test('수락하면 채팅이 열리고, 첫 안내 줄이 있다', async () => {
    const { a, b, id } = await pair();
    const res = await chat(a, id).expect(200);
    expect(res.body).toMatchObject({
      appointmentId: id,
      counterpart: { userId: b.userId, nickname: '테스트b' },
      open: true,
      closesAt: null,
      messages: [{ kind: 'SYSTEM', mine: false, body: expect.stringContaining('약속이 만들어졌어요') }],
    });
  });

  test('약속 당사자만 보고 보낼 수 있다 (서버에서 막음)', async () => {
    const { c, id } = await pair();
    await chat(c, id).expect(404);
    await say(c, id, '안녕하세요').expect(404);
    await http(app).get(`/appointments/${id}/chat`).expect(401);
  });
});

describe('메시지 주고받기', () => {
  test('보낸 메시지는 상대에게 보이고, 새 메시지만 이어서 가져올 수 있다', async () => {
    const { a, b, id } = await pair();
    const first = await say(a, id, '  안녕하세요! 굿즈 줄 먼저 서도 될까요?  ').expect(201);
    expect(first.body).toMatchObject({ kind: 'TEXT', mine: true, body: '안녕하세요! 굿즈 줄 먼저 서도 될까요?', flagged: false });

    const seen = await chat(b, id).expect(200);
    const last = seen.body.messages[seen.body.messages.length - 1];
    expect(last).toMatchObject({ mine: false, body: '안녕하세요! 굿즈 줄 먼저 서도 될까요?' });

    await say(b, id, '네 좋아요').expect(201);
    const after = await chat(a, id, first.body.seq).expect(200);
    expect(after.body.messages.map((m: { body: string }) => m.body)).toEqual(['네 좋아요']);
  });

  test('안 읽은 메시지 수: 대화 목록과 약속에 보이고, 열어 보면 0', async () => {
    const { a, b, id } = await pair();
    await say(a, id, '첫 메시지').expect(201);
    await say(a, id, '두 번째').expect(201);
    const list = await http(app).get('/me/chats').set(auth(b.token)).expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({ appointmentId: id, unread: 2, open: true, lastMessage: expect.objectContaining({ body: '두 번째', mine: false }) }),
    ]);
    expect((await http(app).get(`/appointments/${id}`).set(auth(b.token))).body.unreadMessages).toBe(2);
    // 보낸 사람에게는 0
    expect((await http(app).get('/me/chats').set(auth(a.token))).body[0].unread).toBe(0);
    await chat(b, id).expect(200);
    expect((await http(app).get('/me/chats').set(auth(b.token))).body[0].unread).toBe(0);
  });

  test('빈 메시지와 500자를 넘는 메시지는 보낼 수 없다', async () => {
    const { a, id } = await pair();
    expect((await say(a, id, '   ').expect(400)).body.code).toBe('CHAT_INVALID');
    await say(a, id, '가'.repeat(500)).expect(201);
    expect((await say(a, id, '가'.repeat(501)).expect(400)).body).toMatchObject({ code: 'CHAT_INVALID', detail: { max: 500 } });
  });

  test("'도착했어요'를 누르면 채팅에 안내 줄이 남는다", async () => {
    const { a, b, id } = await pair();
    clock.current = kst('2026-12-11T18:00:00');
    await http(app).post(`/appointments/${id}/confirm`).set(auth(a.token)).expect(200);
    await http(app).post(`/appointments/${id}/confirm`).set(auth(b.token)).expect(200);
    clock.current = kst('2026-12-12T14:30:00');
    await http(app).post(`/appointments/${id}/arrive`).set(auth(a.token)).expect(200);
    const bodies = (await chat(b, id)).body.messages.map((m: { body: string }) => m.body);
    expect(bodies).toEqual(expect.arrayContaining(['약속이 확정됐어요.', '테스트a님이 도착했어요.']));
  });
});

describe('연락처·SNS 감지 (CLAUDE.md 규칙 7)', () => {
  test.each([
    ['전화번호', '제 번호는 010-1234-5678이에요', 'PHONE'],
    ['메신저 이름', '줄 서는 동안 카톡으로 얘기할까요?', 'MESSENGER'],
    ['SNS 아이디', '@sky_fan 으로 연락 주세요', 'SNS_HANDLE'],
  ])('%s: 보내기 전에 멈추고 종류만 알려 준다', async (_name, text, kind) => {
    const { a, b, id } = await pair();
    const res = await say(a, id, text).expect(409);
    expect(res.body).toMatchObject({ code: 'CONTACT_DETECTED', detail: { kinds: expect.arrayContaining([kind]) } });
    // 원문은 돌려주지 않음
    expect(JSON.stringify(res.body)).not.toContain(text);
    // 상대에게 가지 않음
    expect((await chat(b, id)).body.messages.some((m: { body: string }) => m.body === text)).toBe(false);
  });

  test("'그래도 보낼게요'를 고르면 보내지고, 감지 기록이 남는다 (보낸 사람에게만 표시)", async () => {
    const { a, b, id } = await pair();
    const sent = await say(a, id, '제 번호는 010-1234-5678이에요', true).expect(201);
    expect(sent.body).toMatchObject({ flagged: true });
    const row = await f.prisma.chatMessage.findUniqueOrThrow({ where: { id: sent.body.id } });
    expect(row).toMatchObject({ contactDetected: true, contactKinds: ['PHONE'], senderId: a.userId });
    const theirs = (await chat(b, id)).body.messages.find((m: { id: string }) => m.id === sent.body.id);
    expect(theirs).toMatchObject({ mine: false, flagged: false });
  });

  test('연락처가 없는 메시지는 확인 없이 보내지고 기록되지 않는다', async () => {
    const { a, id } = await pair();
    const sent = await say(a, id, '정문 안내판 앞에서 봬요').expect(201);
    expect((await f.prisma.chatMessage.findUniqueOrThrow({ where: { id: sent.body.id } })).contactDetected).toBe(false);
  });

  test('메시지 내용(연락처)이 서버 로그와 오류 응답에 남지 않는다 (규칙 11)', async () => {
    const { a, id } = await pair();
    const lines: string[] = [];
    const capture = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    const spies = [
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture),
      jest.spyOn(Logger.prototype, 'error').mockImplementation(capture),
      jest.spyOn(Logger.prototype, 'log').mockImplementation(capture),
      jest.spyOn(console, 'log').mockImplementation(capture),
      jest.spyOn(console, 'error').mockImplementation(capture),
    ];
    try {
      const res = await say(a, id, '01098765432 여기로 연락').expect(409);
      expect(JSON.stringify(res.body)).not.toContain('98765432');
      await say(a, id, `01098765432 ${'가'.repeat(600)}`).expect(400);
      expect(lines.some((l) => l.includes('CONTACT_DETECTED'))).toBe(true);
      expect(lines.join('\n')).not.toContain('98765432');
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});

describe('채팅이 닫히는 때', () => {
  test('약속이 취소되면 바로 닫히고, 지난 대화는 읽을 수만 있다', async () => {
    const { a, b, id } = await pair();
    await say(a, id, '안녕하세요').expect(201);
    await http(app).post(`/appointments/${id}/cancel`).set(auth(b.token)).send({}).expect(200);
    const res = await chat(a, id).expect(200);
    expect(res.body).toMatchObject({ open: false, closesAt: kst('2026-11-07T12:00:00').toISOString(), appointmentStatus: 'CANCELLED' });
    expect(res.body.messages.map((m: { body: string }) => m.body)).toEqual(expect.arrayContaining(['안녕하세요', '약속이 취소됐어요. 채팅이 닫혔어요.']));
    expect((await say(a, id, '혹시 다시 될까요').expect(409)).body.code).toBe('CHAT_CLOSED');
  });

  test('만남이 끝나면 24시간 동안 더 열려 있다', async () => {
    const { a, b, id } = await pair();
    clock.current = kst('2026-12-11T18:00:00');
    await http(app).post(`/appointments/${id}/confirm`).set(auth(a.token)).expect(200);
    await http(app).post(`/appointments/${id}/confirm`).set(auth(b.token)).expect(200);
    clock.current = kst('2026-12-13T16:59:00');
    const res = await chat(a, id).expect(200);
    expect(res.body).toMatchObject({ open: true, appointmentStatus: 'ENDED', closesAt: kst('2026-12-13T17:00:00').toISOString() });
    await say(a, id, '오늘 즐거웠어요').expect(201);
    clock.current = kst('2026-12-13T17:00:00');
    await say(b, id, '저도요').expect(409);
    expect((await http(app).get('/me/chats').set(auth(a.token))).body[0].open).toBe(false);
  });

  test('행사가 취소되면 닫힌다', async () => {
    const { ev, a, id } = await pair();
    const { adminToken } = await import('./helpers');
    const manager = await adminToken(app, 'EVENT_MANAGER', 'chatmanager');
    const p = await http(app).post(`/admin/events/${ev.id}/cancel-proposals`).set(auth(manager)).send({ reason: '취소 공지' }).expect(201);
    await http(app).post(`/admin/event-cancellations/${p.body.id}/confirm`).set(auth(await adminToken(app, 'ADMIN', 'chatadmin'))).expect(200);
    const res = await chat(a, id).expect(200);
    expect(res.body).toMatchObject({ open: false, appointmentStatus: 'AUTO_ENDED' });
  });
});

describe('운영자 열람', () => {
  test('이번 단계에는 운영자가 대화를 볼 수 있는 주소가 없다 (신고 건 열람은 7단계)', async () => {
    const { id } = await pair();
    const { adminToken } = await import('./helpers');
    const admin = await adminToken(app, 'ADMIN', 'chatviewer');
    await http(app).get(`/appointments/${id}/chat`).set(auth(admin)).expect(401);
    await http(app).get(`/admin/appointments/${id}/chat`).set(auth(admin)).expect(404);
  });
});
