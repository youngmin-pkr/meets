import type { INestApplication } from '@nestjs/common';
import { TERMS } from '@meets/shared';
import request from 'supertest';
import { createApp } from '../src/app.factory';
import type { Clock } from '../src/common/clock';
import { loadConfig } from '../src/config';
import { PrismaService } from '../src/prisma/prisma.service';

/** 테스트 기준 날짜: 2026-11-07 정오(한국 시간) */
export const TEST_NOW = new Date('2026-11-07T03:00:00Z');

export class TestClock implements Clock {
  constructor(public current: Date = TEST_NOW) {}
  now() {
    return this.current;
  }
}

export const ALL_TERMS = TERMS.map((t) => ({ code: t.code, version: t.version }));

export async function startApp(clock: Clock = new TestClock(), logger?: false) {
  const app = await createApp(loadConfig(), { clock, logger: logger ?? false });
  await app.init();
  return app;
}

export async function resetDb(app: INestApplication) {
  const prisma = app.get(PrismaService);
  await prisma.$executeRawUnsafe(
    'TRUNCATE "UserFandom","Fandom","Session","TermsConsent","IdentityVerification","User","PolicyValue","AuditLog" CASCADE',
  );
}

export function http(app: INestApplication) {
  return request(app.getHttpServer());
}

/** 테스트용 본인 확인 토큰 */
export const fakeToken = (person: string, birth: string) => `fake:${person}:${birth}`;

/** 성인으로 가입하고 로그인 토큰을 돌려줍니다. */
export async function signUpAdult(app: INestApplication, person = 'adult1') {
  const res = await http(app)
    .post('/auth/identity')
    .send({ verificationToken: fakeToken(person, '2000-01-01'), agreedTerms: ALL_TERMS })
    .expect(200);
  return res.body.sessionToken as string;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
