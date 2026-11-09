/**
 * 약속까지 만들어 두는 테스트 도우미 (행사 → 가입 → 입력·티켓 인증 → 제안 → 수락)
 * 기준 행사: 2026-12-12(토)·12-13(일), 구간 '굿즈 줄' 15:00~17:00, '공연' 18:00~20:30
 */
import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../src/prisma/prisma.service';
import { adminToken, ALL_TERMS, auth, eventInput, fakeToken, http } from './helpers';

/** 한국 시간 → Date */
export const kst = (s: string) => new Date(`${s}+09:00`);

export function fixtures(app: INestApplication) {
  const prisma = app.get(PrismaService);
  let seq = 0;

  const dayInput = (date: string) => ({
    date,
    startTime: '15:00',
    endTime: '21:00',
    segments: [
      { label: '굿즈 줄', startTime: '15:00', endTime: '17:00' },
      { label: '공연', startTime: '18:00', endTime: '20:30' },
    ],
  });

  async function createEvent() {
    const manager = await adminToken(app, 'EVENT_MANAGER', `fixture${++seq}${Date.now()}`);
    const res = await http(app)
      .post('/admin/events')
      .set(auth(manager))
      .send(eventInput({ days: [dayInput('2026-12-12'), dayInput('2026-12-13')], meetingSpots: [{ name: '정문 안내판 앞', isPublicPlace: true }] }))
      .expect(201);
    return prisma.event.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { days: { orderBy: { date: 'asc' }, include: { segments: { orderBy: { sortOrder: 'asc' } } } }, meetingSpots: true },
    });
  }
  type Ev = Awaited<ReturnType<typeof createEvent>>;

  async function member(person: string) {
    const res = await http(app).post('/auth/identity').send({ verificationToken: fakeToken(person, '2000-01-01'), agreedTerms: ALL_TERMS }).expect(200);
    const token = res.body.sessionToken as string;
    await http(app).put('/me/profile').set(auth(token)).send({ nickname: `테스트${person}`, avatarColor: 'ink' }).expect(200);
    await http(app).put('/me/fandoms').set(auth(token)).send({ fandomIds: [] }).expect(200);
    await http(app).post('/me/notification-choice').set(auth(token)).send({ granted: false }).expect(200);
    const user = await prisma.user.findFirstOrThrow({ where: { nickname: `테스트${person}` } });
    return { token, userId: user.id };
  }
  type Member = Awaited<ReturnType<typeof member>>;

  async function ready(m: Member, ev: Ev) {
    await http(app)
      .put(`/events/${ev.id}/preference`)
      .set(auth(m.token))
      .send({
        days: ev.days.map((d) => ({ eventDayId: d.id, arriveTime: '15:00', leaveTime: '21:00', togetherSegmentIds: d.segments.map((s) => s.id) })),
        tempoAnswers: [2, 2, 2],
        immersionAnswers: [2, 2],
        must: { gender: 'ANY', age: 'ANY', promises: [] },
      })
      .expect(200);
    const start = await http(app).post(`/events/${ev.id}/tickets`).set(auth(m.token)).send({ kind: 'TICKET' }).expect(201);
    const img = (await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } }).jpeg().toBuffer()).toString('base64');
    await http(app).post(`/tickets/${start.body.id}/image`).set(auth(m.token)).send({ imageBase64: img, mimeType: 'image/jpeg', masks: [] }).expect(200);
    await http(app)
      .post(`/tickets/${start.body.id}/confirm`)
      .set(auth(m.token))
      .send({ reservationNumber: `F${++seq}000`, admissibleDayIds: ev.days.map((d) => d.id) })
      .expect(200);
  }

  const proposalBody = (ev: Ev, receiverId: string, day = 0, seg = 0) => ({
    receiverId,
    eventDayId: ev.days[day].id,
    segmentIds: [ev.days[day].segments[seg].id],
    meetingSpotId: ev.meetingSpots[0].id,
  });

  /** from이 to에게 제안 → 보낸 제안 id */
  async function propose(from: Member, to: Member, ev: Ev, day = 0, seg = 0) {
    const sent = await http(app).post(`/events/${ev.id}/proposals`).set(auth(from.token)).send(proposalBody(ev, to.userId, day, seg)).expect(201);
    return sent.body.id as string;
  }

  /** from이 제안하고 to가 수락 → 약속 id */
  async function appoint(from: Member, to: Member, ev: Ev, day = 0, seg = 0) {
    const id = await propose(from, to, ev, day, seg);
    const accepted = await http(app).post(`/proposals/${id}/accept`).set(auth(to.token)).expect(200);
    return accepted.body.id as string;
  }

  async function setup(people = ['a', 'b']) {
    const ev = await createEvent();
    const members: Member[] = [];
    for (const p of people) {
      const m = await member(p);
      await ready(m, ev);
      members.push(m);
    }
    return { ev, members };
  }

  return { prisma, createEvent, member, ready, propose, appoint, setup };
}
