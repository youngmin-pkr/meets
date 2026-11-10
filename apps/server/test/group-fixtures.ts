/**
 * 9-2a 테스트 도우미: 여러 명이 만나는 약속을 직접 만듭니다. (일행으로 제안하는 길은 9-2b에서 열림)
 * 기준: 12-12 '공연' 구간 18:00~20:30 (전날 확인 12-11 18:00 열림, 마감 12-12 15:00, 안전 확인 19:00·20:00)
 */
import type { INestApplication } from '@nestjs/common';
import { AppointmentsService } from '../src/appointments/appointments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { fixtures, kst } from './appointment-fixtures';
import { auth, http } from './helpers';

export { kst };

const cache = new WeakMap<object, ReturnType<typeof fixtures>>();

export async function groupAppointment(
  app: INestApplication,
  clock: { current: Date },
  sides: { a: string[]; b: string[] },
  opts: { confirm?: 'ALL' | 'NONE'; at?: string } = {},
) {
  const fx = cache.get(app) ?? fixtures(app);
  cache.set(app, fx);
  const prisma = app.get(PrismaService);
  clock.current = kst('2026-11-07T12:00:00');
  const names = [...sides.a, ...sides.b];
  const { ev, members } = await fx.setup(names);
  const byName = new Map(names.map((n, i) => [n, members[i]]));
  const A = sides.a.map((n) => byName.get(n)!);
  const B = sides.b.map((n) => byName.get(n)!);
  const day = ev.days[0];
  const seg = day.segments[1]; // 공연
  const spot = ev.meetingSpots[0];
  const proposal = await prisma.proposal.create({
    data: {
      senderId: A[0].userId,
      receiverId: B[0].userId,
      eventId: ev.id,
      eventDayId: day.id,
      segmentIds: [seg.id],
      meetingSpotId: spot.id,
      date: day.date,
      segmentsSnapshot: [{ id: seg.id, label: seg.label, startTime: seg.startTime, endTime: seg.endTime }],
      meetingSpotName: spot.name,
      status: 'ACCEPTED',
      expiresAt: kst('2026-11-08T12:00:00'),
    },
  });
  const appointments = app.get(AppointmentsService);
  const created = await prisma.$transaction((tx) =>
    appointments.createFromProposal(
      tx,
      { id: proposal.id, eventId: ev.id, eventDayId: day.id, meetingSpotId: spot.id, senderId: A[0].userId, receiverId: B[0].userId },
      { date: day.date, startTime: seg.startTime, endTime: seg.endTime, segments: [{ id: seg.id, label: seg.label, startTime: seg.startTime, endTime: seg.endTime }] },
      spot.name,
      [...A.map((m) => ({ userId: m.userId, side: 'A' as const })), ...B.map((m) => ({ userId: m.userId, side: 'B' as const }))],
    ),
  );
  const all = [...A, ...B];
  if (opts.confirm === 'ALL') {
    clock.current = kst('2026-12-11T18:00:00');
    for (const m of all) await http(app).post(`/appointments/${created.id}/confirm`).set(auth(m.token)).send({}).expect(200);
  }
  if (opts.at) clock.current = kst(opts.at);
  return { id: created.id, ev, A, B, all };
}
