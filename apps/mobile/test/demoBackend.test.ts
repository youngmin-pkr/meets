/**
 * 데모 모드의 가짜 서버가 실제 서버와 같은 규칙으로 동작하는지 확인합니다.
 */
import { TERMS } from '@meets/shared';
import { createDemoBackend, DEMO_FANDOMS, DEMO_TAKEN_NICKNAMES } from '../src/demoBackend';

const NOW = () => new Date('2026-11-07T03:00:00Z'); // 한국 시간 11월 7일 정오
const ALL_TERMS = TERMS.map((t) => ({ code: t.code, version: t.version }));

async function signedUp(person = 'demo1') {
  const backend = createDemoBackend({ now: NOW });
  const result = await backend.verifyIdentity(`fake:${person}:2000-01-01`, ALL_TERMS);
  if (result.outcome !== 'SIGNED_UP') throw new Error('가입 실패');
  backend.setSessionToken(result.sessionToken);
  return backend;
}

describe('데모: 본인 확인', () => {
  test('성인은 가입되고 별명 화면으로', async () => {
    const backend = createDemoBackend({ now: NOW });
    const r = await backend.verifyIdentity('fake:a:2000-01-01', ALL_TERMS);
    expect(r).toMatchObject({ outcome: 'SIGNED_UP', nextStep: 'PROFILE' });
  });

  test('오늘 만 18세가 된 사람은 성인, 내일 되는 사람은 청소년', async () => {
    const backend = createDemoBackend({ now: NOW });
    expect((await backend.verifyIdentity('fake:b:2008-11-07', ALL_TERMS)).outcome).toBe('SIGNED_UP');
    expect((await backend.verifyIdentity('fake:c:2008-11-08', ALL_TERMS)).outcome).toBe(
      'TEEN_NOT_YET_AVAILABLE',
    );
  });

  test('만 14세 미만은 가입 불가', async () => {
    const backend = createDemoBackend({ now: NOW });
    expect(await backend.verifyIdentity('fake:d:2015-01-01', ALL_TERMS)).toEqual({ outcome: 'UNDER_MIN_AGE' });
  });

  test('필수 약관이 없으면 거절', async () => {
    const backend = createDemoBackend({ now: NOW });
    await expect(backend.verifyIdentity('fake:e:2000-01-01', [])).rejects.toMatchObject({
      code: 'TERMS_REQUIRED',
    });
  });

  test('잘못된 생년월일은 거절', async () => {
    const backend = createDemoBackend({ now: NOW });
    await expect(backend.verifyIdentity('fake:f:2000-02-30', ALL_TERMS)).rejects.toMatchObject({
      code: 'INVALID_VERIFICATION',
    });
  });

  test('같은 사람은 다시 로그인하면 멈췄던 단계부터', async () => {
    const backend = await signedUp('same');
    await backend.updateProfile('민지', 'ink');
    const r = await backend.verifyIdentity('fake:same:2000-01-01', []);
    expect(r).toMatchObject({ outcome: 'LOGGED_IN', nextStep: 'FANDOM' });
  });
});

describe('데모: 별명', () => {
  test('규칙에 맞으면 저장', async () => {
    const backend = await signedUp();
    expect(await backend.updateProfile('민지', 'red')).toMatchObject({
      nickname: '민지',
      avatarInitial: '민',
      nextStep: 'FANDOM',
    });
  });

  test('연락처가 보이면 거절', async () => {
    const backend = await signedUp();
    await expect(backend.updateProfile('카톡민지', 'ink')).rejects.toMatchObject({
      code: 'NICKNAME_INVALID',
      detail: { problem: 'CONTAINS_CONTACT' },
    });
  });

  test('미리 쓰이고 있는 별명은 거절 (대소문자 무시)', async () => {
    const backend = await signedUp();
    await expect(backend.updateProfile(DEMO_TAKEN_NICKNAMES[0], 'ink')).rejects.toMatchObject({
      code: 'NICKNAME_TAKEN',
    });
  });

  test('다른 데모 사용자가 쓴 별명도 거절', async () => {
    const backend = createDemoBackend({ now: NOW });
    const a = await backend.verifyIdentity('fake:a:2000-01-01', ALL_TERMS);
    if (a.outcome !== 'SIGNED_UP') throw new Error();
    backend.setSessionToken(a.sessionToken);
    await backend.updateProfile('Luna', 'ink');
    const b = await backend.verifyIdentity('fake:b:2000-01-01', ALL_TERMS);
    if (b.outcome !== 'SIGNED_UP') throw new Error();
    backend.setSessionToken(b.sessionToken);
    await expect(backend.updateProfile('luna', 'ink')).rejects.toMatchObject({ code: 'NICKNAME_TAKEN' });
  });

  test('없는 색은 거절', async () => {
    const backend = await signedUp();
    await expect(backend.updateProfile('민지', 'purple')).rejects.toMatchObject({
      code: 'INVALID_AVATAR_COLOR',
    });
  });
});

describe('데모: 팬덤과 알림', () => {
  test('별명 전에는 팬덤을 고를 수 없다', async () => {
    const backend = await signedUp();
    await expect(backend.setFandoms([], false)).rejects.toMatchObject({ code: 'STEP_ORDER' });
  });

  test('3개까지, 4개째는 거절', async () => {
    const backend = await signedUp();
    await backend.updateProfile('민지', 'ink');
    const ids = DEMO_FANDOMS.map((f) => f.id);
    await expect(backend.setFandoms(ids.slice(0, 4), false)).rejects.toMatchObject({ code: 'FANDOM_LIMIT' });
    expect((await backend.setFandoms(ids.slice(0, 3), false)).fandoms).toHaveLength(3);
  });

  test('알림은 한 번만 고르고, 고르면 가입 끝', async () => {
    const backend = await signedUp();
    await backend.updateProfile('민지', 'ink');
    await backend.setFandoms([], false);
    expect(await backend.setNotificationChoice(false)).toMatchObject({ nextStep: 'DONE' });
    await expect(backend.setNotificationChoice(true)).rejects.toMatchObject({
      code: 'NOTIFICATION_ALREADY_ASKED',
    });
  });

  test('로그인하지 않으면 내 정보를 볼 수 없다', async () => {
    const backend = createDemoBackend({ now: NOW });
    await expect(backend.getMe()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
