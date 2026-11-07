/**
 * 데모 모드용 가짜 서버 (포트폴리오 데모 전용)
 *
 * 실제 서버 없이 브라우저 메모리 안에서 동작합니다. 새로고침하면 처음으로 돌아갑니다.
 * 나이 판정·별명 규칙·약관·정책 값은 실제 서버와 같은 @meets/shared 코드를 씁니다.
 * 실제 서비스의 보안(권한 검사, DB 제약)은 apps/server에 있고, 여기는 화면 시연용입니다.
 */
import {
  AVATAR_COLOR_KEYS,
  AVATAR_COLORS,
  avatarInitial,
  checkNickname,
  decideSignupAgeOutcome,
  hasAgreedToRequiredTerms,
  manAge,
  nextSignupStep,
  nicknameKey,
  NICKNAME_PROBLEM_MESSAGES,
  parseCalendarDate,
  POLICY_DEFAULTS,
  TERMS,
  todayInSeoul,
  type AgreedTerm,
  type AvatarColor,
  type IdentityResult,
} from '@meets/shared';
import { ApiError, type Backend, type Me, type SignupConfig } from './apiTypes';

interface DemoUser {
  id: string;
  person: string;
  nickname: string | null;
  avatarColor: string | null;
  fandomIds: string[];
  fandomPublic: boolean;
  notificationChoice: 'ALLOWED' | 'DENIED' | null;
  profileDone: boolean;
  fandomDone: boolean;
  signupDone: boolean;
}

/** 데모에서 고를 수 있는 팬덤 (시험용 이름) */
export const DEMO_FANDOMS = [
  '테스트 뮤지컬',
  '테스트 밴드',
  '테스트 아티스트 A',
  '테스트 아티스트 B',
  '테스트 전시 시리즈',
  '테스트 페스티벌',
].map((name, i) => ({ id: `demo-fandom-${i + 1}`, name }));

/** 데모에서 '이미 쓰이는 별명'을 시연하려고 미리 넣어 둔 별명 */
export const DEMO_TAKEN_NICKNAMES = ['동행러'];

export function createDemoBackend(options: { now?: () => Date } = {}): Backend {
  const now = options.now ?? (() => new Date());
  const users: DemoUser[] = [];
  const takenKeys = new Set(DEMO_TAKEN_NICKNAMES.map(nicknameKey));
  const sessions = new Map<string, string>(); // 토큰 → 사용자 id
  let sessionToken: string | null = null;
  let seq = 0;

  const delay = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 150));

  function currentUser(): DemoUser {
    const id = sessionToken ? sessions.get(sessionToken) : undefined;
    const user = users.find((u) => u.id === id);
    if (!user) throw new ApiError('UNAUTHORIZED', '다시 로그인해 주세요.');
    return user;
  }

  function toMe(u: DemoUser): Me {
    return {
      nickname: u.nickname,
      avatarInitial: u.nickname ? avatarInitial(u.nickname) : null,
      avatarColor: u.avatarColor,
      fandomPublic: u.fandomPublic,
      fandoms: DEMO_FANDOMS.filter((f) => u.fandomIds.includes(f.id)),
      notificationChoice: u.notificationChoice,
      nextStep: nextSignupStep({
        profileCompleted: u.profileDone,
        fandomStepCompleted: u.fandomDone,
        signupCompleted: u.signupDone,
      }),
    };
  }

  function newSession(user: DemoUser): string {
    const token = `demo-session-${++seq}`;
    sessions.set(token, user.id);
    return token;
  }

  return {
    setSessionToken(token) {
      sessionToken = token;
    },

    async getConfig(): Promise<SignupConfig> {
      return delay({
        identityProvider: 'fake',
        terms: TERMS.map((t) => ({ ...t })),
        nicknameMinLength: POLICY_DEFAULTS.NICKNAME_MIN_LENGTH,
        nicknameMaxLength: POLICY_DEFAULTS.NICKNAME_MAX_LENGTH,
        fandomMaxCount: POLICY_DEFAULTS.FANDOM_MAX_COUNT,
        signupMinAge: POLICY_DEFAULTS.SIGNUP_MIN_AGE,
        avatarColors: { ...AVATAR_COLORS },
      });
    },

    async verifyIdentity(token: string, agreedTerms: AgreedTerm[]): Promise<IdentityResult> {
      const m = /^fake:([A-Za-z0-9_-]{1,40}):(\d{4}-\d{2}-\d{2})$/.exec(token);
      const birth = m ? parseCalendarDate(m[2]) : null;
      if (!m || !birth) throw new ApiError('INVALID_VERIFICATION', '생년월일을 다시 확인해 주세요.');

      const outcome = decideSignupAgeOutcome(manAge(birth, todayInSeoul(now())), {
        adultMinAge: POLICY_DEFAULTS.ADULT_MIN_AGE,
        signupMinAge: POLICY_DEFAULTS.SIGNUP_MIN_AGE,
      });
      if (outcome !== 'ADULT') return delay({ outcome });

      const existing = users.find((u) => u.person === m[1]);
      if (existing) {
        return delay({ outcome: 'LOGGED_IN', sessionToken: newSession(existing), nextStep: toMe(existing).nextStep });
      }
      if (!hasAgreedToRequiredTerms(agreedTerms)) {
        throw new ApiError('TERMS_REQUIRED', '필수 약관에 동의해 주세요.');
      }
      const user: DemoUser = {
        id: `demo-user-${users.length + 1}`,
        person: m[1],
        nickname: null,
        avatarColor: null,
        fandomIds: [],
        fandomPublic: false,
        notificationChoice: null,
        profileDone: false,
        fandomDone: false,
        signupDone: false,
      };
      users.push(user);
      return delay({ outcome: 'SIGNED_UP', sessionToken: newSession(user), nextStep: 'PROFILE' });
    },

    async getMe() {
      return delay(toMe(currentUser()));
    },

    async updateProfile(rawNickname, avatarColor) {
      const user = currentUser();
      if (!AVATAR_COLOR_KEYS.includes(avatarColor as AvatarColor)) {
        throw new ApiError('INVALID_AVATAR_COLOR', '색을 다시 골라 주세요.');
      }
      const check = checkNickname(rawNickname, {
        minLength: POLICY_DEFAULTS.NICKNAME_MIN_LENGTH,
        maxLength: POLICY_DEFAULTS.NICKNAME_MAX_LENGTH,
      });
      if (!check.ok) {
        throw new ApiError('NICKNAME_INVALID', NICKNAME_PROBLEM_MESSAGES[check.problem], { problem: check.problem });
      }
      const mine = user.nickname ? nicknameKey(user.nickname) : null;
      if (check.key !== mine && takenKeys.has(check.key)) {
        throw new ApiError('NICKNAME_TAKEN', NICKNAME_PROBLEM_MESSAGES.TAKEN);
      }
      if (mine) takenKeys.delete(mine);
      takenKeys.add(check.key);
      user.nickname = check.nickname;
      user.avatarColor = avatarColor;
      user.profileDone = true;
      return delay(toMe(user));
    },

    async searchFandoms(q) {
      const query = q.trim().toLowerCase();
      return delay(DEMO_FANDOMS.filter((f) => f.name.toLowerCase().includes(query)));
    },

    async setFandoms(fandomIds, isPublic) {
      const user = currentUser();
      if (!user.profileDone) throw new ApiError('STEP_ORDER', '별명을 먼저 정해 주세요.');
      const ids = [...new Set(fandomIds)];
      const max = POLICY_DEFAULTS.FANDOM_MAX_COUNT;
      if (ids.length > max) {
        throw new ApiError('FANDOM_LIMIT', `팬덤은 최대 ${max}개까지 고를 수 있어요.`, { max });
      }
      if (!ids.every((id) => DEMO_FANDOMS.some((f) => f.id === id))) {
        throw new ApiError('FANDOM_NOT_FOUND', '고른 팬덤을 찾을 수 없어요.');
      }
      user.fandomIds = ids;
      user.fandomPublic = isPublic;
      user.fandomDone = true;
      return delay(toMe(user));
    },

    async setNotificationChoice(granted) {
      const user = currentUser();
      if (!user.profileDone || !user.fandomDone) throw new ApiError('STEP_ORDER', '앞 단계를 먼저 마쳐 주세요.');
      if (user.notificationChoice) {
        throw new ApiError('NOTIFICATION_ALREADY_ASKED', '알림 설정은 이미 골랐어요.');
      }
      user.notificationChoice = granted ? 'ALLOWED' : 'DENIED';
      user.signupDone = true;
      return delay(toMe(user));
    },
  };
}
