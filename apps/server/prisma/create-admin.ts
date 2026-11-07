/**
 * 운영자 계정 만들기 (운영 콘솔 화면이 생기기 전까지 쓰는 방법)
 *
 * 예) ADMIN_LOGIN_ID=admin1 ADMIN_PASSWORD='길고-어려운-비밀번호' ADMIN_ROLE=ADMIN npm run admin:create
 * 역할: REVIEWER(검수자) REPORT_MANAGER(신고 담당) EVENT_MANAGER(행사 담당) ADMIN(관리자)
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { ADMIN_PASSWORD_MIN_LENGTH, hashPassword } from '../src/admin/password';
import { ADMIN_ROLES, type AdminRoleName } from '../src/admin/permissions';

async function main() {
  const loginId = process.env.ADMIN_LOGIN_ID ?? '';
  const password = process.env.ADMIN_PASSWORD ?? '';
  const role = (process.env.ADMIN_ROLE ?? '') as AdminRoleName;
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(loginId)) throw new Error('ADMIN_LOGIN_ID는 영문·숫자 3~40자로 정해 주세요.');
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    throw new Error(`ADMIN_PASSWORD는 ${ADMIN_PASSWORD_MIN_LENGTH}자 이상이어야 해요.`);
  }
  if (!ADMIN_ROLES.includes(role)) throw new Error(`ADMIN_ROLE은 ${ADMIN_ROLES.join(', ')} 중 하나예요.`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
  });
  await prisma.adminUser.create({ data: { loginId, role, passwordHash: await hashPassword(password) } });
  await prisma.$disconnect();
  console.log(`운영자 ${loginId}(${role})를 만들었습니다.`);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
