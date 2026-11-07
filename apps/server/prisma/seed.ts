/**
 * 개발용 데이터 채우기: 팬덤 목록과 예시 행사.
 * 실제 팬덤·행사는 운영팀이 정합니다. 여기 이름은 모두 시험용입니다.
 */
import { EVENT_TYPE_CATEGORY, officialUrlKey, sampleEvents, todayInSeoul } from '@meets/shared';
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
  await prisma.$disconnect();
  console.log(`팬덤 ${SAMPLE_FANDOMS.length}개, 예시 행사 ${created}개를 넣었습니다.`);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
