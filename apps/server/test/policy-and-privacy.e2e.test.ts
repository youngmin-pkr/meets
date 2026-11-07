/**
 * 정책 값 읽기와 개인정보가 로그에 남지 않는지 테스트
 */
import { Logger, type INestApplication } from '@nestjs/common';
import { POLICY_DEFAULTS } from '@meets/shared';
import { loadConfig } from '../src/config';
import { PolicyService } from '../src/policy/policy.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ALL_TERMS, auth, fakeToken, http, resetDb, signUpAdult, startApp, TestClock } from './helpers';

let app: INestApplication;
let prisma: PrismaService;
let policy: PolicyService;
const clock = new TestClock();

beforeAll(async () => {
  app = await startApp(clock);
  prisma = app.get(PrismaService);
  policy = app.get(PolicyService);
});

beforeEach(async () => {
  await resetDb(app);
});

afterAll(async () => {
  await app.close();
});

describe('정책 값', () => {
  test('DB에 값이 없으면 기본값을 쓴다', async () => {
    expect(await policy.getNumber('FANDOM_MAX_COUNT')).toBe(POLICY_DEFAULTS.FANDOM_MAX_COUNT);
  });

  test('적용 시작이 지난 값 중 가장 최근 값을 쓴다', async () => {
    await prisma.policyValue.createMany({
      data: [
        { key: 'FANDOM_MAX_COUNT', value: 4, effectiveFrom: new Date('2026-01-01T00:00:00Z') },
        { key: 'FANDOM_MAX_COUNT', value: 5, effectiveFrom: new Date('2026-06-01T00:00:00Z') },
      ],
    });
    expect(await policy.getNumber('FANDOM_MAX_COUNT')).toBe(5);
  });

  test('아직 적용 시작 전인 값은 쓰지 않는다', async () => {
    await prisma.policyValue.create({
      data: { key: 'FANDOM_MAX_COUNT', value: 9, effectiveFrom: new Date('2027-01-01T00:00:00Z') },
    });
    expect(await policy.getNumber('FANDOM_MAX_COUNT')).toBe(POLICY_DEFAULTS.FANDOM_MAX_COUNT);
  });
});

describe('서버 설정', () => {
  const base = { DATABASE_URL: 'postgresql://x', CI_HASH_SECRET: 's' };

  test('실제 서비스에서는 테스트용 본인 확인을 쓸 수 없다', () => {
    expect(() => loadConfig({ ...base, IDENTITY_PROVIDER: 'fake', NODE_ENV: 'production' })).toThrow(
      /production/,
    );
  });

  test('비밀 값이 없으면 시작하지 않는다', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://x' })).toThrow(/CI_HASH_SECRET/);
  });
});

describe('개인정보가 로그·오류 메시지에 남지 않는다 (CLAUDE.md 규칙 11)', () => {
  test('연락처가 든 별명을 거절할 때 로그와 응답에 그 값이 없다', async () => {
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
      const token = await signUpAdult(app, 'privacy');
      const res = await http(app)
        .put('/me/profile')
        .set(auth(token))
        .send({ nickname: '01098765432', avatarColor: 'ink' })
        .expect(400);
      // 응답에 입력값이 들어가지 않는다
      expect(JSON.stringify(res.body)).not.toContain('98765432');
      // 로그는 남았지만(오류 종류만) 입력값은 없다
      expect(lines.some((l) => l.includes('NICKNAME_INVALID'))).toBe(true);
      expect(lines.join('\n')).not.toContain('98765432');
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });

  test('본인 확인 정보(생년월일·테스트 번호)가 로그에 남지 않는다', async () => {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    const spies = [
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture),
      jest.spyOn(Logger.prototype, 'error').mockImplementation(capture),
    ];
    try {
      await http(app)
        .post('/auth/identity')
        .send({ verificationToken: fakeToken('secretperson', '1999-12-31'), agreedTerms: [] })
        .expect(400);
      await http(app)
        .post('/auth/identity')
        .send({ verificationToken: fakeToken('secretperson', '1999-12-31'), agreedTerms: ALL_TERMS })
        .expect(200);
      expect(lines.join('\n')).not.toMatch(/secretperson|1999-12-31/);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});
