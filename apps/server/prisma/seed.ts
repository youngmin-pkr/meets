/**
 * 개발용 팬덤 목록 채우기.
 * 실제 팬덤 목록은 운영팀이 정합니다. 여기 이름은 시험용입니다.
 */
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
  await prisma.$disconnect();
  console.log(`팬덤 ${SAMPLE_FANDOMS.length}개를 넣었습니다.`);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
