import { allRequiredChecked, screenAfterIdentity, screenForStep } from '../src/signupFlow';

describe('본인 확인 결과에 따른 화면', () => {
  test('14세 미만은 가입 불가 안내', () => {
    expect(screenAfterIdentity({ outcome: 'UNDER_MIN_AGE' })).toBe('UNDER_MIN_AGE');
  });

  test('청소년은 아직 이용할 수 없다는 안내 (청소년 모드 화면으로 가지 않음)', () => {
    expect(screenAfterIdentity({ outcome: 'TEEN_NOT_YET_AVAILABLE' })).toBe('TEEN_NOT_YET');
  });

  test('정지·탈퇴 계정 안내', () => {
    expect(screenAfterIdentity({ outcome: 'ACCOUNT_UNAVAILABLE' })).toBe('ACCOUNT_UNAVAILABLE');
  });

  test('새로 가입하면 별명 화면', () => {
    expect(screenAfterIdentity({ outcome: 'SIGNED_UP', sessionToken: 't', nextStep: 'PROFILE' })).toBe(
      'PROFILE',
    );
  });

  test('다시 로그인하면 멈췄던 단계부터', () => {
    expect(screenAfterIdentity({ outcome: 'LOGGED_IN', sessionToken: 't', nextStep: 'FANDOM' })).toBe(
      'FANDOM',
    );
    expect(screenForStep('READY')).toBe('READY');
    expect(screenForStep('DONE')).toBe('HOME');
  });
});

describe('약관 체크', () => {
  const terms = [
    { code: 'SERVICE', required: true },
    { code: 'PRIVACY', required: true },
    { code: 'MARKETING', required: false },
  ];

  test('처음(아무것도 체크 안 함)에는 진행할 수 없다', () => {
    expect(allRequiredChecked(terms, {})).toBe(false);
  });

  test('필수만 모두 체크하면 진행할 수 있다', () => {
    expect(allRequiredChecked(terms, { SERVICE: true, PRIVACY: true })).toBe(true);
  });

  test('필수 하나라도 빠지면 진행할 수 없다', () => {
    expect(allRequiredChecked(terms, { SERVICE: true, MARKETING: true })).toBe(false);
  });
});
