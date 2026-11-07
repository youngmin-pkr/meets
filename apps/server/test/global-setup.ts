import { execSync } from 'node:child_process';
import path from 'node:path';

/** 테스트 전에 테스트용 DB에 표를 만들어 둡니다. */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5432/meets_test';
  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
