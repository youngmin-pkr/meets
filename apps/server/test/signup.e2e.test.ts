/**
 * 가입·본인 확인 흐름 전체 테스트 (실제 테스트용 DB를 씁니다)
 */
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  ALL_TERMS,
  auth,
  fakeToken,
  http,
  resetDb,
  signUpAdult,
  startApp,
  TestClock,
} from './helpers';

let app: INestApplication;
let prisma: PrismaService;
const clock = new TestClock();

beforeAll(async () => {
  app = await startApp(clock);
  prisma = app.get(PrismaService);
});

beforeEach(async () => {
  clock.current = new Date('2026-11-07T03:00:00Z');
  await resetDb(app);
});

afterAll(async () => {
  await app.close();
});

async function seedFandoms(names: string[]) {
  const rows = [];
  for (const name of names) rows.push(await prisma.fandom.create({ data: { name } }));
  return rows;
}

function completeProfile(token: string, nickname = '민지') {
  return http(app)
    .put('/me/profile')
    .set(auth(token))
    .send({ nickname, avatarColor: 'ink' });
}

describe('본인 확인과 나이 분기', () => {
  test('성인은 가입되고 다음 화면은 별명 정하기', async () => {
    const res = await http(app)
      .post('/auth/identity')
      .send({ verificationToken: fakeToken('p1', '2000-01-01'), agreedTerms: ALL_TERMS })
      .expect(200);
    expect(res.body).toMatchObject({ outcome: 'SIGNED_UP', nextStep: 'PROFILE' });
    expect(typeof res.body.sessionToken).toBe('string');

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ ageClass: 'ADULT', status: 'ACTIVE', trustLevel: 1 });
    expect(await prisma.termsConsent.count()).toBe(ALL_TERMS.length);
  });

  test('오늘 만 18세가 된 사람은 성인', async () => {
    const res = await http(app)
      .post('/auth/identity')
      .send({ verificationToken: fakeToken('p2', '2008-11-07'), agreedTerms: ALL_TERMS })
      .expect(200);
    expect(res.body.outcome).toBe('SIGNED_UP');
  });

  test('내일 만 18세가 되는 사람은 청소년이라 아직 가입할 수 없고, 아무것도 저장하지 않는다', async () => {
    const res = await http(app)
      .post('/auth/identity')
      .send({ verificationToken: fakeToken('p3', '2008-11-08'), agreedTerms: ALL_TERMS })
      .expect(200);
    expect(res.body).toEqual({ outcome: 'TEEN_NOT_YET_AVAILABLE' });
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.identityVerification.count()).toBe(0);
  });

  test('만 14세 미만은 가입 불가이고, 아무것도 저장하지 않는다', async () => {
    const res = await http(app)
      .post('/auth/identity')
      .send({ verificationToken: fakeToken('p4', '2012-11-08'), agreedTerms: ALL_TERMS })
      .expect(200);
    expect(res.body).toEqual({ outcome: 'UNDER_MIN_AGE' });
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.identityVerification.count()).toBe(0);
  });

  test('만 14세가 된 날은 청소년으로 판정한다', async () => {
    const res = await http(app)
      .post('/auth/identity')
      .send({ verificationToken: fakeToken('p5', '2012-11-07'), agreedTerms: ALL_TERMS })
      .expect(200);
    expect(res.body.outcome).toBe('TEEN_NOT_YET_AVAILABLE');
  });

  test('한국 날짜로 판정한다 (UTC로는 아직 생일 전날이어도 한국이 생일이면 성인)', async () => {
    clock.current = new Date('2026-11-06T15:30:00Z'); // 한국 11월 7일 00:30
    const res = await http(app)
      .post('/auth/identity')
      .send({ verificationToken: fakeToken('p6', '2008-11-07'), agreedTerms: ALL_TERMS })
      .expect(200);
    expect(res.body.outcome).toBe('SIGNED_UP');
  });

  test('성인 기준 나이는 정책 값을 따른다', async () => {
    await prisma.policyValue.create({
      data: { key: 'ADULT_MIN_AGE', value: 19, effectiveFrom: new Date('2026-01-01T00:00:00Z') },
    });
    const res = await http(app)
      .post('/auth/identity')
      .send({ verificationToken: fakeToken('p7', '2008-01-01'), agreedTerms: ALL_TERMS })
      .expect(200);
    expect(res.body.outcome).toBe('TEEN_NOT_YET_AVAILABLE');
  });

  test.each(['', 'fake:p8', 'fake:p8:2000-02-30', 'real:p8:2000-01-01'])(
    '잘못된 확인 결과(%s)는 거절',
    async (token) => {
      const res = await http(app)
        .post('/auth/identity')
        .send({ verificationToken: token, agreedTerms: ALL_TERMS })
        .expect(400);
      expect(res.body.code === 'INVALID_VERIFICATION' || res.body.code === 'BAD_REQUEST').toBe(true);
    },
  );

  test('필수 약관에 동의하지 않으면 가입되지 않는다', async () => {
    const res = await http(app)
      .post('/auth/identity')
      .send({ verificationToken: fakeToken('p9', '2000-01-01'), agreedTerms: ALL_TERMS.slice(1) })
      .expect(400);
    expect(res.body.code).toBe('TERMS_REQUIRED');
    expect(await prisma.user.count()).toBe(0);
  });

  test('나이를 직접 보내도 무시하지 않고 거절한다 (나이는 본인 확인 결과로만)', async () => {
    const res = await http(app)
      .post('/auth/identity')
      .send({ verificationToken: fakeToken('p10', '2012-01-01'), agreedTerms: ALL_TERMS, ageClass: 'ADULT' })
      .expect(400);
    expect(res.body.code).toBe('BAD_REQUEST');
    expect(await prisma.user.count()).toBe(0);
  });
});

describe('같은 사람의 다시 로그인', () => {
  test('같은 사람이 다시 본인 확인하면 새 계정이 아니라 기존 계정으로 로그인', async () => {
    const first = await signUpAdult(app, 'same');
    await completeProfile(first).expect(200);

    const res = await http(app)
      .post('/auth/identity')
      .send({ verificationToken: fakeToken('same', '2000-01-01') })
      .expect(200);
    expect(res.body).toMatchObject({ outcome: 'LOGGED_IN', nextStep: 'FANDOM' });
    expect(await prisma.user.count()).toBe(1);
  });

  test('CI는 원문이 아니라 해시로만 저장한다', async () => {
    await signUpAdult(app, 'hashme');
    const row = await prisma.identityVerification.findFirstOrThrow();
    expect(row.ciHash).not.toContain('hashme');
    expect(row.ciHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('동시에 두 번 가입을 눌러도 계정은 하나만 생긴다', async () => {
    const send = () =>
      http(app)
        .post('/auth/identity')
        .send({ verificationToken: fakeToken('twice', '2000-01-01'), agreedTerms: ALL_TERMS });
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await prisma.user.count()).toBe(1);
  });
});

describe('로그인 확인', () => {
  test('토큰 없이 내 정보를 볼 수 없다', async () => {
    const res = await http(app).get('/me').expect(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  test('틀린 토큰은 거절', async () => {
    await http(app).get('/me').set(auth('wrong')).expect(401);
  });

  test('로그인 유지 기간이 지나면 거절', async () => {
    const token = await signUpAdult(app);
    clock.current = new Date('2026-12-08T03:00:00Z'); // 31일 뒤
    await http(app).get('/me').set(auth(token)).expect(401);
  });
});

describe('별명과 색', () => {
  test('별명을 정하면 첫 글자와 색이 저장되고 다음은 팬덤', async () => {
    const token = await signUpAdult(app);
    const res = await completeProfile(token, '민지').expect(200);
    expect(res.body).toMatchObject({
      nickname: '민지',
      avatarInitial: '민',
      avatarColor: 'ink',
      nextStep: 'FANDOM',
    });
  });

  test.each([
    ['민', 'TOO_SHORT'],
    ['가나다라마바사아자차카', 'TOO_LONG'],
    ['민 지', 'INVALID_CHARACTERS'],
    ['민지!', 'INVALID_CHARACTERS'],
    ['카톡민지', 'CONTAINS_CONTACT'],
    ['공일공일이삼사', 'CONTAINS_CONTACT'],
  ])('"%s"는 %s로 거절', async (nickname, problem) => {
    const token = await signUpAdult(app);
    const res = await completeProfile(token, nickname).expect(400);
    expect(res.body).toMatchObject({ code: 'NICKNAME_INVALID', detail: { problem } });
  });

  test('다른 사람이 쓰는 별명은 쓸 수 없다 (영문 대소문자 구분 없이)', async () => {
    const a = await signUpAdult(app, 'a');
    const b = await signUpAdult(app, 'b');
    await completeProfile(a, 'Luna').expect(200);
    const res = await completeProfile(b, 'luna').expect(409);
    expect(res.body.code).toBe('NICKNAME_TAKEN');
  });

  test('내 별명을 같은 값으로 다시 저장하는 것은 괜찮다', async () => {
    const a = await signUpAdult(app);
    await completeProfile(a, 'Luna').expect(200);
    await completeProfile(a, 'Luna').expect(200);
  });

  test('없는 색은 거절', async () => {
    const token = await signUpAdult(app);
    const res = await http(app)
      .put('/me/profile')
      .set(auth(token))
      .send({ nickname: '민지', avatarColor: 'purple' })
      .expect(400);
    expect(res.body.code).toBe('INVALID_AVATAR_COLOR');
  });

  test('별명 저장 때 나이 구분을 같이 보내면 거절한다', async () => {
    const token = await signUpAdult(app);
    await http(app)
      .put('/me/profile')
      .set(auth(token))
      .send({ nickname: '민지', avatarColor: 'ink', ageClass: 'TEEN' })
      .expect(400);
    const user = await prisma.user.findFirstOrThrow();
    expect(user.ageClass).toBe('ADULT');
    expect(user.nickname).toBeNull();
  });

  test('별명 길이는 정책 값을 따른다', async () => {
    await prisma.policyValue.create({
      data: { key: 'NICKNAME_MIN_LENGTH', value: 1, effectiveFrom: new Date('2026-01-01T00:00:00Z') },
    });
    const token = await signUpAdult(app);
    await completeProfile(token, '민').expect(200);
  });
});

describe('팬덤', () => {
  test('별명을 정하기 전에는 팬덤을 고를 수 없다', async () => {
    const token = await signUpAdult(app);
    const res = await http(app).put('/me/fandoms').set(auth(token)).send({ fandomIds: [] }).expect(409);
    expect(res.body.code).toBe('STEP_ORDER');
  });

  test('3개까지 고를 수 있고, 공개는 기본으로 꺼져 있다', async () => {
    const [f1, f2, f3] = await seedFandoms(['A', 'B', 'C']);
    const token = await signUpAdult(app);
    await completeProfile(token).expect(200);
    const res = await http(app)
      .put('/me/fandoms')
      .set(auth(token))
      .send({ fandomIds: [f1.id, f2.id, f3.id] })
      .expect(200);
    expect(res.body.fandoms.map((f: { name: string }) => f.name).sort()).toEqual(['A', 'B', 'C']);
    expect(res.body).toMatchObject({ fandomPublic: false, nextStep: 'READY' });
  });

  test('4개째는 거절', async () => {
    const fs = await seedFandoms(['A', 'B', 'C', 'D']);
    const token = await signUpAdult(app);
    await completeProfile(token).expect(200);
    const res = await http(app)
      .put('/me/fandoms')
      .set(auth(token))
      .send({ fandomIds: fs.map((f) => f.id) })
      .expect(400);
    expect(res.body).toMatchObject({ code: 'FANDOM_LIMIT', detail: { max: 3 } });
  });

  test('같은 팬덤을 두 번 보내도 하나로 센다', async () => {
    const [f1] = await seedFandoms(['A']);
    const token = await signUpAdult(app);
    await completeProfile(token).expect(200);
    const res = await http(app)
      .put('/me/fandoms')
      .set(auth(token))
      .send({ fandomIds: [f1.id, f1.id, f1.id, f1.id] })
      .expect(200);
    expect(res.body.fandoms).toHaveLength(1);
  });

  test('건너뛰기(빈 목록)도 다음 단계로 넘어간다', async () => {
    const token = await signUpAdult(app);
    await completeProfile(token).expect(200);
    const res = await http(app).put('/me/fandoms').set(auth(token)).send({ fandomIds: [] }).expect(200);
    expect(res.body).toMatchObject({ fandoms: [], nextStep: 'READY' });
  });

  test('공개를 직접 켤 수 있다', async () => {
    const [f1] = await seedFandoms(['A']);
    const token = await signUpAdult(app);
    await completeProfile(token).expect(200);
    const res = await http(app)
      .put('/me/fandoms')
      .set(auth(token))
      .send({ fandomIds: [f1.id], isPublic: true })
      .expect(200);
    expect(res.body.fandomPublic).toBe(true);
  });

  test('없는 팬덤은 거절', async () => {
    const token = await signUpAdult(app);
    await completeProfile(token).expect(200);
    const res = await http(app)
      .put('/me/fandoms')
      .set(auth(token))
      .send({ fandomIds: ['00000000-0000-4000-8000-000000000000'] })
      .expect(400);
    expect(res.body.code).toBe('FANDOM_NOT_FOUND');
  });

  test('팬덤 검색', async () => {
    await seedFandoms(['테스트 밴드', '테스트 전시', '다른 이름']);
    const token = await signUpAdult(app);
    const res = await http(app).get('/fandoms').query({ q: '테스트' }).set(auth(token)).expect(200);
    expect(res.body.map((f: { name: string }) => f.name)).toEqual(['테스트 밴드', '테스트 전시']);
  });
});

describe('준비 완료와 알림 권한', () => {
  async function untilReady() {
    const token = await signUpAdult(app);
    await completeProfile(token).expect(200);
    await http(app).put('/me/fandoms').set(auth(token)).send({ fandomIds: [] }).expect(200);
    return token;
  }

  test('알림 선택을 하면 가입이 끝난다', async () => {
    const token = await untilReady();
    const res = await http(app)
      .post('/me/notification-choice')
      .set(auth(token))
      .send({ granted: false })
      .expect(200);
    expect(res.body).toMatchObject({ notificationChoice: 'DENIED', nextStep: 'DONE' });
  });

  test('알림은 한 번만 묻는다', async () => {
    const token = await untilReady();
    await http(app).post('/me/notification-choice').set(auth(token)).send({ granted: true }).expect(200);
    const res = await http(app)
      .post('/me/notification-choice')
      .set(auth(token))
      .send({ granted: false })
      .expect(409);
    expect(res.body.code).toBe('NOTIFICATION_ALREADY_ASKED');
  });

  test('앞 단계를 건너뛰고 알림 선택을 할 수 없다', async () => {
    const token = await signUpAdult(app);
    const res = await http(app)
      .post('/me/notification-choice')
      .set(auth(token))
      .send({ granted: true })
      .expect(409);
    expect(res.body.code).toBe('STEP_ORDER');
  });

  test('가입을 마친 사람이 다시 로그인하면 다음 화면은 끝(DONE)', async () => {
    const token = await untilReady();
    await http(app).post('/me/notification-choice').set(auth(token)).send({ granted: true }).expect(200);
    const res = await http(app)
      .post('/auth/identity')
      .send({ verificationToken: fakeToken('adult1', '2000-01-01') })
      .expect(200);
    expect(res.body).toMatchObject({ outcome: 'LOGGED_IN', nextStep: 'DONE' });
  });
});

describe('가입 설정 값', () => {
  test('앱이 쓸 약관·글자 수·팬덤 최대 개수를 정책 값에서 돌려준다', async () => {
    const res = await http(app).get('/signup/config').expect(200);
    expect(res.body).toMatchObject({
      identityProvider: 'fake',
      nicknameMinLength: 2,
      nicknameMaxLength: 10,
      fandomMaxCount: 3,
      signupMinAge: 14,
    });
    expect(res.body.terms).toHaveLength(2);
  });
});
