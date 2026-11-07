import {
  avatarInitial,
  checkNickname,
  hasAgreedToRequiredTerms,
  nextSignupStep,
  nicknameKey,
  POLICY_DEFAULTS,
  TERMS,
} from '../src';

const limits = {
  minLength: POLICY_DEFAULTS.NICKNAME_MIN_LENGTH,
  maxLength: POLICY_DEFAULTS.NICKNAME_MAX_LENGTH,
};

describe('별명 규칙', () => {
  test('정책 값의 기본은 2~10자', () => {
    expect(limits).toEqual({ minLength: 2, maxLength: 10 });
  });

  test.each(['민지', '공연러버', 'Luna', 'fan2026', '가나다라마바사아자차'])(
    '"%s"는 쓸 수 있다',
    (nick) => {
      expect(checkNickname(nick, limits)).toMatchObject({ ok: true, nickname: nick });
    },
  );

  test('한 글자는 너무 짧다', () => {
    expect(checkNickname('민', limits)).toEqual({ ok: false, problem: 'TOO_SHORT' });
  });

  test('11글자는 너무 길다', () => {
    expect(checkNickname('가나다라마바사아자차카', limits)).toEqual({
      ok: false,
      problem: 'TOO_LONG',
    });
  });

  test.each(['민 지', '민지!', '민_지', '민지♥', 'ㅋㅋㅋ', '😀😀'])(
    '"%s"처럼 띄어쓰기·특수문자·자음만 쓰면 안 된다',
    (nick) => {
      expect(checkNickname(nick, limits)).toEqual({ ok: false, problem: 'INVALID_CHARACTERS' });
    },
  );

  test.each(['민010', '공일공일이삼사', '카톡민지', 'instagram', '1234567'])(
    '"%s"처럼 연락처·SNS가 보이면 안 된다',
    (nick) => {
      expect(checkNickname(nick, limits)).toEqual({ ok: false, problem: 'CONTAINS_CONTACT' });
    },
  );

  test('앞뒤 띄어쓰기는 지우고 검사한다', () => {
    expect(checkNickname('  민지  ', limits)).toMatchObject({ ok: true, nickname: '민지' });
  });

  test('정책 값이 바뀌면 그 값을 따른다', () => {
    expect(checkNickname('민', { minLength: 1, maxLength: 10 })).toMatchObject({ ok: true });
  });

  test('영문 대소문자는 같은 별명으로 본다', () => {
    expect(nicknameKey('Luna')).toBe(nicknameKey('luna'));
  });

  test('첫 글자를 아바타로 쓴다', () => {
    expect(avatarInitial('민지')).toBe('민');
    expect(avatarInitial('luna')).toBe('L');
  });
});

describe('약관 동의', () => {
  const all = TERMS.map((t) => ({ code: t.code, version: t.version }));

  test('필수 약관에 모두 동의하면 통과', () => {
    expect(hasAgreedToRequiredTerms(all)).toBe(true);
  });

  test('하나라도 빠지면 거절', () => {
    expect(hasAgreedToRequiredTerms(all.slice(1))).toBe(false);
    expect(hasAgreedToRequiredTerms([])).toBe(false);
  });

  test('예전 버전에 동의한 것은 인정하지 않는다', () => {
    expect(hasAgreedToRequiredTerms(all.map((a) => ({ ...a, version: '2000-01-01' })))).toBe(false);
  });
});

describe('가입 다음 화면', () => {
  test.each([
    [{ profileCompleted: false, fandomStepCompleted: false, signupCompleted: false }, 'PROFILE'],
    [{ profileCompleted: true, fandomStepCompleted: false, signupCompleted: false }, 'FANDOM'],
    [{ profileCompleted: true, fandomStepCompleted: true, signupCompleted: false }, 'READY'],
    [{ profileCompleted: true, fandomStepCompleted: true, signupCompleted: true }, 'DONE'],
  ] as const)('%o → %s', (progress, step) => {
    expect(nextSignupStep(progress)).toBe(step);
  });
});
