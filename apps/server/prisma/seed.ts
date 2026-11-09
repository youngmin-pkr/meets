/**
 * 개발용 데이터 채우기: 팬덤 목록과 예시 행사.
 * 실제 팬덤·행사는 운영팀이 정합니다. 여기 이름은 모두 시험용입니다.
 */
import { createHmac } from 'node:crypto';
import {
  avatarInitial,
  EVENT_TYPE_CATEGORY,
  immersionLevel,
  nicknameKey,
  officialUrlKey,
  SAMPLE_PEOPLE,
  sampleImmersionAnswers,
  sampleEvents,
  tempoLevel,
  todayInSeoul,
} from '@meets/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const SAMPLE_FANDOMS = [
  '테스트 아티스트 A',
  '테스트 아티스트 B',
  '테스트 밴드',
  '테스트 전시 시리즈',
  '테스트 페스티벌',
  '테스트 뮤지컬',
];

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
  });
  for (const name of SAMPLE_FANDOMS) {
    await prisma.fandom.upsert({ where: { name }, update: {}, create: { name } });
  }
  let created = 0;
  for (const e of sampleEvents(todayInSeoul())) {
    const key = officialUrlKey(e.officialUrl)!;
    if (await prisma.event.findUnique({ where: { officialUrlKey: key } })) continue;
    await prisma.event.create({
      data: {
        name: e.name,
        category: EVENT_TYPE_CATEGORY[e.type],
        type: e.type,
        venue: e.venue,
        officialUrl: e.officialUrl,
        officialUrlKey: key,
        ticketRequired: e.ticketRequired,
        status: 'REGISTERED',
        days: {
          create: e.days.map((d) => ({
            date: d.date,
            startTime: d.startTime,
            endTime: d.endTime,
            segments: { create: d.segments.map((s, i) => ({ ...s, sortOrder: i })) },
          })),
        },
        meetingSpots: { create: e.meetingSpots },
      },
    });
    created++;
  }
  // 예시 사용자: 가입을 마친 상태로, 예시 행사에 일정·스타일을 입력해 둡니다.
  const today = todayInSeoul();
  const samples = sampleEvents(today);
  const secret = process.env.CI_HASH_SECRET ?? 'dev';
  let people = 0;
  for (const p of SAMPLE_PEOPLE) {
    const ciHash = createHmac('sha256', secret).update(`SAMPLE-CI-${p.key}`).digest('hex');
    if (await prisma.identityVerification.findUnique({ where: { ciHash } })) continue;
    const birthDate = `${today.year - p.age - 1}-${String(today.month).padStart(2, '0')}-01`;
    const fandoms = await prisma.fandom.findMany({ where: { name: { in: p.fandoms } } });
    const now = new Date();
    const user = await prisma.user.create({
      data: {
        nickname: p.nickname,
        nicknameKey: nicknameKey(p.nickname),
        avatarInitial: avatarInitial(p.nickname),
        avatarColor: p.avatarColor,
        ageClass: 'ADULT',
        // 쌓인 신뢰를 가진 예시 사용자 (후보 카드에 '쌓인 신뢰' 표시를 보여 주려고)
        trustLevel: p.trusted ? 4 : 1,
        fandomPublic: p.fandomPublic,
        profileCompletedAt: now,
        fandomStepCompletedAt: now,
        notificationChoice: 'DENIED',
        signupCompletedAt: now,
        identity: { create: { ciHash, provider: 'sample', birthDate, gender: p.gender } },
        fandoms: { create: fandoms.map((f) => ({ fandomId: f.id })) },
      },
    });
    for (const plan of p.plans) {
      const sample = samples[plan.event];
      const event = await prisma.event.findUnique({
        where: { officialUrlKey: officialUrlKey(sample.officialUrl)! },
        include: { days: { orderBy: { date: 'asc' }, include: { segments: { orderBy: { sortOrder: 'asc' } } } } },
      });
      if (!event) continue;
      const dayIds = plan.days.map((i) => event.days[i]?.id).filter((x): x is string => !!x);
      if (plan.ticket === 'VERIFIED') {
        // 예시 사용자의 티켓 인증 (이미지 없이 결과만, 예매번호도 지어낸 값)
        const hash = createHmac('sha256', secret).update(`ticket:${event.id}:SAMPLE${p.key.toUpperCase()}`).digest('hex');
        await prisma.ticketVerification.create({
          data: {
            userId: user.id,
            eventId: event.id,
            kind: 'TICKET',
            status: 'VERIFIED',
            reservationHash: hash,
            admissibleDayIds: dayIds,
            decidedAt: now,
            imageDeletedAt: now,
            hashOwner: { create: { hash } },
          },
        });
      } else if (plan.ticket === 'PLANNED' && !event.ticketRequired) {
        await prisma.attendancePlan.create({ data: { userId: user.id, eventId: event.id } });
      }
      await prisma.preference.create({
        data: {
          userId: user.id,
          eventId: event.id,
          tempoAnswers: p.tempoAnswers,
          immersionAnswers: sampleImmersionAnswers(p, event.category),
          tempoLevel: tempoLevel(p.tempoAnswers),
          immersionLevel: immersionLevel(sampleImmersionAnswers(p, event.category)),
          mustGender: p.mustGender,
          mustAge: p.mustAge,
          promises: p.promises,
          days: {
            create: plan.days
              .filter((i) => event.days[i])
              .map((i) => ({
                eventDayId: event.days[i].id,
                arriveTime: plan.arrive,
                leaveTime: plan.leave,
                togetherSegmentIds: plan.together.map((j) => event.days[i].segments[j]?.id).filter((x): x is string => !!x),
              })),
          },
        },
      });
    }
    people++;
  }
  await prisma.$disconnect();
  console.log(`팬덤 ${SAMPLE_FANDOMS.length}개, 예시 행사 ${created}개, 예시 사용자 ${people}명을 넣었습니다.`);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
