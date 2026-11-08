/**
 * 데모 모드용 가짜 서버 (GitHub Pages 웹 버전용)
 *
 * 실제 서버 없이 브라우저 메모리 안에서 동작합니다. 새로고침하면 처음으로 돌아갑니다.
 * 나이 판정·별명 규칙·약관·정책 값은 실제 서버와 같은 @meets/shared 코드를 씁니다.
 * 실제 서비스의 보안(권한 검사, DB 제약)은 apps/server에 있고, 여기는 화면 시연용입니다.
 */
import {
  checkPreference,
  describeCandidate,
  expectedCounts,
  explainMatch,
  immersionLevel,
  matchCandidates,
  PREFERENCE_PROBLEM_MESSAGES,
  PROMISE_SHORT_LABELS,
  SAMPLE_PEOPLE,
  tempoLevel,
  type CalendarDate,
  type CandidateCard,
  type MatchCandidate,
  type MatchDay,
  type MatchPolicy,
  type MatchProfile,
  type PreferenceInput,
  type PreferenceView,
  checkEventReport,
  EVENT_REPORT_PROBLEM_MESSAGES,
  EVENT_TYPE_CATEGORY,
  officialUrlKey,
  sampleEvents,
  type EventDetail,
  type EventReportResult,
  type EventSummary,
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
  birth: CalendarDate;
  gender: 'M' | 'F' | null;
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

interface DemoEvent {
  detail: EventDetail;
  urlKey: string;
  status: 'REPORTED' | 'REGISTERED';
  reporters: Set<string>;
}

function isoOf(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/** 데모용 예시 행사 (오늘 기준 날짜). 등록된 행사로 시작합니다. */
function buildDemoEvents(today: { year: number; month: number; day: number }): DemoEvent[] {
  return sampleEvents(today).map((e, i) => ({
    urlKey: officialUrlKey(e.officialUrl)!,
    status: 'REGISTERED',
    reporters: new Set<string>(),
    detail: {
      id: `demo-event-${i + 1}`,
      name: e.name,
      category: EVENT_TYPE_CATEGORY[e.type],
      type: e.type,
      venue: e.venue,
      officialUrl: e.officialUrl,
      ticketRequired: e.ticketRequired,
      changed: false,
      days: e.days.map((d, j) => ({
        id: `demo-event-${i + 1}-day-${j + 1}`,
        date: d.date,
        startTime: d.startTime,
        endTime: d.endTime,
        segments: d.segments.map((s, k) => ({ id: `demo-seg-${i + 1}-${j + 1}-${k + 1}`, ...s })),
      })),
      // 사용자에게는 공개된 만날 장소만 보여 줍니다.
      meetingSpots: e.meetingSpots
        .filter((s) => s.isPublicPlace)
        .map((s, k) => ({ id: `demo-spot-${i + 1}-${k + 1}`, name: s.name })),
    },
  }));
}

function toSummary(d: EventDetail): EventSummary {
  return { ...d, days: d.days.map(({ id, date, startTime, endTime }) => ({ id, date, startTime, endTime })) };
}

export function createDemoBackend(options: { now?: () => Date } = {}): Backend {
  const now = options.now ?? (() => new Date());
  const users: DemoUser[] = [];
  const events = buildDemoEvents(todayInSeoul(now()));
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

  const POLICY: MatchPolicy = {
    tempoMaxGap: POLICY_DEFAULTS.MATCH_TEMPO_MAX_GAP,
    immersionMaxGap: POLICY_DEFAULTS.MATCH_IMMERSION_MAX_GAP,
    immersionRelaxedGap: POLICY_DEFAULTS.MATCH_IMMERSION_RELAXED_GAP,
    fewCandidates: POLICY_DEFAULTS.MATCH_FEW_CANDIDATES,
    minOverlapMinutes: POLICY_DEFAULTS.MATCH_MIN_OVERLAP_MINUTES,
    shortOverlapMinutes: POLICY_DEFAULTS.MATCH_SHORT_OVERLAP_MINUTES,
  };
  /** 사용자 id|행사 id → 입력 흐름 결과 */
  const preferences = new Map<string, PreferenceView>();
  const waits = new Map<string, { endsOn: string; includeImmersionPlus: boolean }>();
  const fandomIdByName = new Map(DEMO_FANDOMS.map((f) => [f.name, f.id]));

  /** 데모 행사 (사용자에게 보이는 것만) */
  function visibleEvent(eventId: string) {
    const found = events.find((e) => e.detail.id === eventId && e.status === 'REGISTERED');
    if (!found) throw new ApiError('NOT_FOUND', '행사를 찾을 수 없어요.');
    const days: MatchDay[] = found.detail.days.map((d) => ({ ...d, segments: d.segments.map((x) => ({ ...x })) }));
    return { event: found.detail, days };
  }

  /** 예시 사용자 정보 (카드에 보여 줄 것) */
  const people = new Map(
    SAMPLE_PEOPLE.map((p) => [
      `demo-sample-${p.key}`,
      {
        nickname: p.nickname,
        avatarInitial: avatarInitial(p.nickname),
        avatarColor: AVATAR_COLORS[p.avatarColor],
        fandomPublic: p.fandomPublic,
        fandoms: p.fandoms,
      },
    ]),
  );

  /** 이 행사의 매칭 정보: 예시 사용자 + 이 데모에서 입력을 마친 사용자 */
  function profiles(eventId: string): MatchProfile[] {
    const index = events.findIndex((e) => e.detail.id === eventId);
    const event = events[index].detail;
    const today = todayInSeoul(now());
    const samples: MatchProfile[] = SAMPLE_PEOPLE.flatMap((p) =>
      p.plans
        .filter((plan) => plan.event === index)
        .map((plan) => ({
          userId: `demo-sample-${p.key}`,
          age: p.age,
          gender: p.gender,
          tempo: tempoLevel(p.tempoAnswers),
          immersion: immersionLevel(p.immersionAnswers, event.category),
          must: { gender: p.mustGender, age: p.mustAge, promises: p.promises },
          fandomIds: p.fandoms.map((n) => fandomIdByName.get(n)).filter((x): x is string => !!x),
          days: plan.days
            .filter((i) => event.days[i])
            .map((i) => ({
              eventDayId: event.days[i].id,
              arriveTime: plan.arrive,
              leaveTime: plan.leave,
              togetherSegmentIds: plan.together.map((j) => event.days[i].segments[j]?.id).filter((x): x is string => !!x),
            })),
        })),
    );
    const mine: MatchProfile[] = users
      .filter((u) => u.signupDone && preferences.has(`${u.id}|${eventId}`))
      .map((u) => {
        const pref = preferences.get(`${u.id}|${eventId}`)!;
        return {
          userId: u.id,
          age: manAge(u.birth, today),
          gender: u.gender,
          tempo: pref.tempoLevel,
          immersion: pref.immersionLevel,
          must: pref.must,
          fandomIds: u.fandomIds,
          days: pref.days,
        };
      });
    return [...samples, ...mine];
  }

  function cardOf(c: MatchCandidate): CandidateCard {
    const sample = people.get(c.userId);
    const demoUser = users.find((u) => u.id === c.userId);
    return {
      userId: c.userId,
      nickname: sample?.nickname ?? demoUser?.nickname ?? '',
      avatarInitial: sample?.avatarInitial ?? (demoUser?.nickname ? avatarInitial(demoUser.nickname) : ''),
      avatarColor:
        sample?.avatarColor ?? AVATAR_COLORS[(demoUser?.avatarColor as AvatarColor) ?? 'ink'] ?? AVATAR_COLORS.ink,
      tempoGap: c.tempoGap,
      immersionGap: c.immersionGap,
      sameFan: c.sameFan,
      overlaps: c.overlaps,
      bestOverlapMinutes: c.bestOverlapMinutes,
      shortStart: c.shortStart,
      summary: describeCandidate(c),
    };
  }

  function matchContext(eventId: string) {
    const user = currentUser();
    const { days } = visibleEvent(eventId);
    const all = profiles(eventId);
    const viewer = all.find((p) => p.userId === user.id);
    if (!viewer) throw new ApiError('PREFERENCE_REQUIRED', '먼저 일정과 스타일을 알려 주세요.');
    const today = isoOf(todayInSeoul(now()));
    return { days: days.filter((d) => d.date >= today), all, viewer };
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
      const m = /^fake:([A-Za-z0-9_-]{1,40}):(\d{4}-\d{2}-\d{2})(?::([MF]))?$/.exec(token);
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
        birth,
        gender: (m[3] as 'M' | 'F' | undefined) ?? null,
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

    async listEvents({ q, category }) {
      currentUser();
      const today = isoOf(todayInSeoul(now()));
      const query = (q ?? '').trim().toLowerCase();
      const list = events
        .filter((e) => e.status === 'REGISTERED')
        .map((e) => e.detail)
        .filter((d) => d.days.some((day) => day.date >= today))
        .filter((d) => !category || d.category === category)
        .filter((d) => !query || d.name.toLowerCase().includes(query) || d.venue.toLowerCase().includes(query))
        .sort((a, b) => a.days[0].date.localeCompare(b.days[0].date) || a.name.localeCompare(b.name));
      return delay(list.map(toSummary));
    },

    async getEvent(id) {
      currentUser();
      const found = events.find((e) => e.detail.id === id && e.status === 'REGISTERED');
      if (!found) throw new ApiError('NOT_FOUND', '행사를 찾을 수 없어요.');
      return delay(found.detail);
    },

    async reportEvent(input): Promise<EventReportResult> {
      const user = currentUser();
      const check = checkEventReport(input);
      if (!check.ok) {
        throw new ApiError('EVENT_REPORT_INVALID', EVENT_REPORT_PROBLEM_MESSAGES[check.problem], {
          problem: check.problem,
        });
      }
      const existing = events.find((e) => e.urlKey === check.urlKey);
      if (existing) {
        existing.reporters.add(user.id);
        return delay({ merged: true, progress: existing.status === 'REGISTERED' ? 'REGISTERED' : 'RECEIVED' });
      }
      // 제보된 행사는 운영팀 검수 전까지 목록에 나오지 않습니다.
      events.push({
        urlKey: check.urlKey,
        status: 'REPORTED',
        reporters: new Set([user.id]),
        detail: {
          id: `demo-report-${events.length + 1}`,
          name: input.name.trim(),
          category: input.category,
          type: input.category === 'PERFORMANCE' ? 'CONCERT' : 'EXHIBITION',
          venue: input.placeText?.trim() ?? '',
          officialUrl: input.officialUrl.trim(),
          ticketRequired: true,
          changed: false,
          days: [],
          meetingSpots: [],
        },
      });
      return delay({ merged: false, progress: 'RECEIVED' });
    },

    async getPreference(eventId) {
      const user = currentUser();
      visibleEvent(eventId);
      return delay(preferences.get(`${user.id}|${eventId}`) ?? null);
    },

    async savePreference(eventId, input: PreferenceInput) {
      const user = currentUser();
      const { event, days } = visibleEvent(eventId);
      const today = isoOf(todayInSeoul(now()));
      const check = checkPreference(input, days.filter((d) => d.date >= today));
      if (!check.ok) {
        throw new ApiError('PREFERENCE_INVALID', PREFERENCE_PROBLEM_MESSAGES[check.problem], { problem: check.problem });
      }
      const view: PreferenceView = {
        ...input,
        tempoLevel: tempoLevel(input.tempoAnswers),
        immersionLevel: immersionLevel(input.immersionAnswers, event.category),
      };
      preferences.set(`${user.id}|${eventId}`, view);
      return delay(view);
    },

    async getCandidates(eventId, options) {
      const { days, all, viewer } = matchContext(eventId);
      const result = matchCandidates(viewer, all, days, POLICY, options);
      const cards = result.candidates.map(cardOf);
      return delay({
        total: cards.length,
        immersionRelaxed: result.immersionRelaxed,
        candidates: cards,
        widen: cards.length === 0 ? expectedCounts(viewer, all, days, POLICY, options) : null,
      });
    },

    async getCandidate(eventId, userId) {
      const { days, all, viewer } = matchContext(eventId);
      const c = matchCandidates(viewer, all, days, POLICY, { shortTime: true, immersionPlus: true }).candidates.find(
        (x) => x.userId === userId,
      );
      if (!c) throw new ApiError('NOT_FOUND', '후보를 찾을 수 없어요.');
      const sample = people.get(userId);
      return delay({
        ...cardOf(c),
        reasons: explainMatch(c, days, PROMISE_SHORT_LABELS),
        publicFandoms: sample?.fandomPublic ? sample.fandoms : [],
      });
    },

    async registerWait(eventId, includeImmersionPlus) {
      const user = currentUser();
      matchContext(eventId);
      const { days } = visibleEvent(eventId);
      const [y, m, d] = days[0].date.split('-').map(Number);
      const endsOn = new Date(Date.UTC(y, m - 1, d - POLICY_DEFAULTS.WAIT_ALERT_END_DAYS_BEFORE)).toISOString().slice(0, 10);
      if (isoOf(todayInSeoul(now())) > endsOn) {
        throw new ApiError('WAIT_TOO_LATE', `행사 ${POLICY_DEFAULTS.WAIT_ALERT_END_DAYS_BEFORE}일 전부터는 알림을 신청할 수 없어요.`);
      }
      const result = { endsOn, includeImmersionPlus };
      waits.set(`${user.id}|${eventId}`, result);
      return delay(result);
    },
  };
}
