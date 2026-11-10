/**
 * 데모 모드용 가짜 서버 (GitHub Pages 웹 버전용)
 *
 * 실제 서버 없이 브라우저 메모리 안에서 동작합니다. 새로고침하면 처음으로 돌아갑니다.
 * 나이 판정·별명 규칙·약관·정책 값은 실제 서버와 같은 @meets/shared 코드를 씁니다.
 * 실제 서비스의 보안(권한 검사, DB 제약)은 apps/server에 있고, 여기는 화면 시연용입니다.
 */
import {
  BLOCK_SOURCE_LABELS,
  CHAT_EXTENDED_LINE,
  checkReviewInput,
  computeTrust,
  REPORT_CATEGORY_CODES,
  REVIEW_PROBLEM_MESSAGES,
  reviewDeadline,
  trustView,
  type BlockSource,
  type BlockView,
  type ReportCategory,
  type ReviewAgain,
  type ReviewOverall,
  type TrustView,
  arrivedLine,
  CHAT_STATUS_LINES,
  canRequestHelp,
  combineProfiles,
  isInputDone,
  JOINABLE_PARTY_STATUSES,
  LIVE_PARTY_STATUSES,
  matchPartyCandidates,
  nextPartyStatus,
  PARTY_STATUS_LABELS,
  partyGuide,
  partyInviteExpiresAt,
  passesMust,
  type PartyInvitePreview,
  type PartyStatus,
  type PartyView,
  chatClosesAt,
  dueSafetySteps,
  sharedStatusOf,
  shareLinkExpiresAt,
  DEFAULT_SAFETY_SETTINGS,
  type HelpResult,
  type SafetySettings,
  type SafetyStep,
  type ShareLinkView,
  type SharedAppointmentView,
  checkChatBody,
  CLOSED_APPOINTMENT_STATUSES,
  detectContact,
  isChatOpen,
  seoulDateTime,
  type ChatMessageView,
  type ChatSummary,
  type ChatView,
  ACTIVE_APPOINTMENT_STATUSES,
  appointmentActions,
  appointmentWindow,
  CANCEL_REASONS,
  dueAppointmentSteps,
  factsTimes,
  formatSeoulShort,
  freeCancelUntil,
  notificationText,
  rangeOf,
  rangesOverlap,
  type AppointmentEndReason,
  type AppointmentFacts,
  type AppointmentPolicy,
  type AppointmentStatus,
  type AppointmentStep,
  type NotificationKind,
  type NotificationParams,
  type NotificationView,
  type TimeRange,
  proposalExpiresAt,
  type AppointmentView,
  type Counterpart,
  type ProposalStatus,
  type ProposalView,
  isValidMask,
  normalizeReservationNumber,
  type MyTicketStatus,
  type TicketFailReason,
  type TicketKind,
  type TicketStatus,
  checkPreference,
  describeCandidate,
  expectedCounts,
  explainMatch,
  immersionLevel,
  matchCandidates,
  PREFERENCE_PROBLEM_MESSAGES,
  PROMISE_SHORT_LABELS,
  SAMPLE_PEOPLE,
  sampleImmersionAnswers,
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
  type CancelReason,
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
  safety: SafetySettings;
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

interface DemoProposal {
  id: string;
  senderId: string;
  receiverId: string;
  eventId: string;
  eventDayId: string;
  segmentIds: string[];
  meetingSpotId: string;
  status: ProposalStatus;
  expiresAt: Date;
  createdAt: number;
  /** 데모 전용: 예시 사용자가 자동으로 수락하는 시각 */
  autoAcceptAt: number | null;
}

interface DemoParticipant {
  confirmedAt: Date | null;
  rescheduleConfirmedAt: Date | null;
  arrivedAt: Date | null;
  dayBeforeNotifiedAt: Date | null;
  reminderNotifiedAt: Date | null;
  soonNotifiedAt: Date | null;
  noResponse: boolean;
  lateCancel: boolean;
  noShowReportedAt: Date | null;
}

interface DemoAppointment {
  id: string;
  proposalId: string;
  eventId: string;
  eventDayId: string | null;
  meetingSpotName: string;
  meetingSpotId: string;
  users: [string, string];
  status: AppointmentStatus;
  date: string;
  startTime: string;
  endTime: string;
  segments: Array<{ id: string; label: string; startTime: string; endTime: string }>;
  policy: AppointmentPolicy;
  rescheduleDeadline: Date | null;
  /** 데모 전용: 전날 확인을 바로 열어 둔 예시 약속 */
  confirmOpensAt: Date | null;
  endReason: AppointmentEndReason | null;
  cancelledBy: string | null;
  cancelReason: CancelReason | null;
  parts: Record<string, DemoParticipant>;
  createdAt: number;
  /** 데모 전용: 예시 상대가 '갈 수 있어요'를 누르는 시각 */
  sampleConfirmAt: number | null;
  /** 취소·중간 종료·자동 종료·종료된 시각 (채팅 닫힘 계산) */
  endedAt: Date | null;
  /** 서로 '또 같이 가고 싶어요'를 골라 만남이 끝나도 채팅이 닫히지 않음 */
  chatExtended: boolean;
  /** 도움 요청으로 끝남: 채팅이 바로 닫힘 */
  endedBySafety: boolean;
  /** 앱 안 채팅 */
  messages: DemoMessage[];
  /** 사람별로 어디까지 읽었는지 */
  readSeq: Record<string, number>;
  /** 데모 전용: 예시 상대가 답장하는 시각과 다음 답장 순서 */
  sampleReplyAt: number | null;
  sampleReplies: number;
}

interface DemoParty {
  id: string;
  eventId: string;
  leaderId: string;
  status: PartyStatus;
  inviteExpiresAt: Date;
  members: Array<{ userId: string; joinedAt: Date; active: boolean; remindedAt: Date | null }>;
  /** 데모 전용: 예시 친구가 합류하는 시각 */
  sampleJoinAt: number | null;
}

interface DemoMessage {
  id: string;
  seq: number;
  senderId: string | null;
  kind: 'TEXT' | 'SYSTEM';
  body: string;
  contactDetected: boolean;
  createdAt: Date;
}

/** 데모 전용: 예시 상대의 인사와 답장 (실제 서비스에는 없음) */
const SAMPLE_GREETING = '안녕하세요! 수락해 주셔서 고마워요. 당일에 만날 장소에서 봬요.';
const SAMPLE_REPLIES = ['좋아요! 그때 봬요.', '네, 알겠어요. 도착하면 앱에서 알려 드릴게요.', '천천히 오셔도 괜찮아요.'];

/** 약속을 만들 때 저장해 두는 정책 값 (데모는 기본값) */
const DEMO_APPOINTMENT_POLICY: AppointmentPolicy = {
  dayBeforeHour: POLICY_DEFAULTS.APPOINTMENT_DAY_BEFORE_HOUR,
  confirmDeadlineHours: POLICY_DEFAULTS.APPOINTMENT_CONFIRM_DEADLINE_HOURS,
  confirmReminderHours: POLICY_DEFAULTS.APPOINTMENT_CONFIRM_REMINDER_HOURS,
  freeCancelHours: POLICY_DEFAULTS.APPOINTMENT_FREE_CANCEL_HOURS,
  noShowWaitMinutes: POLICY_DEFAULTS.APPOINTMENT_NO_SHOW_WAIT_MINUTES,
  soonMinutes: POLICY_DEFAULTS.APPOINTMENT_SOON_MINUTES,
  arrivalOpenMinutes: POLICY_DEFAULTS.APPOINTMENT_ARRIVAL_OPEN_MINUTES,
};

const emptyPart = (): DemoParticipant => ({
  confirmedAt: null,
  rescheduleConfirmedAt: null,
  arrivedAt: null,
  dayBeforeNotifiedAt: null,
  reminderNotifiedAt: null,
  soonNotifiedAt: null,
  noResponse: false,
  lateCancel: false,
  noShowReportedAt: null,
});

export function createDemoBackend(options: { now?: () => Date; autoAcceptDelayMs?: number } = {}): Backend {
  const now = options.now ?? (() => new Date());
  const autoAcceptDelayMs = options.autoAcceptDelayMs ?? 3000;
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
  /** 데모 티켓 인증 (이미지는 저장하지 않고, 사람 검수 없이 바로 인증) */
  const tickets = new Map<
    string,
    { userId: string; eventId: string; kind: TicketKind; status: TicketStatus; hash: string | null; admissibleDayIds: string[]; failReason: TicketFailReason | null; createdAt: number }
  >();
  const plans = new Set<string>();
  let ticketSeq = 0;
  const proposals: DemoProposal[] = [];
  const appointments: DemoAppointment[] = [];
  const notifications: Array<NotificationView & { userId: string }> = [];
  /** 차단: 키는 '차단한 사람>차단당한 사람' */
  const blockMap = new Map<string, { blockerId: string; blockedId: string; source: BlockSource; at: Date }>();
  const reviews: Array<{ appointmentId: string; authorId: string; targetId: string; overall: ReviewOverall; again: ReviewAgain }> = [];
  /** 일행 */
  const parties: DemoParty[] = [];
  let partySeq = 0;
  /** 안전 확인 (묻고, 다시 묻고, 믿는 사람에게 알림) */
  const safetyChecks: Array<{ id: string; appointmentId: string; userId: string; seq: number; askedAt: Date; remindedAt: Date | null; answeredAt: Date | null; alertedAt: Date | null }> = [];
  /** 믿는 사람에게 보내는 링크 */
  const shareLinks: Array<{ id: string; appointmentId: string; creatorId: string; showStatus: boolean; revokedAt: Date | null; alertKind: 'HELP' | 'NO_RESPONSE' | null; alertAt: Date | null; createdAt: Date }> = [];
  let safetySeq = 0;
  const safetyPolicy = {
    maxCount: POLICY_DEFAULTS.SAFETY_CHECK_MAX_COUNT,
    intervalMinutes: POLICY_DEFAULTS.SAFETY_CHECK_INTERVAL_MINUTES,
    reaskMinutes: POLICY_DEFAULTS.SAFETY_CHECK_REASK_MINUTES,
  };
  const reports: Array<{ id: string; reporterId: string; appointmentId: string; category: ReportCategory; open: boolean }> = [];
  const isBlockedBetween = (x: string, y: string) => blockMap.has(`${x}>${y}`) || blockMap.has(`${y}>${x}`);
  let notificationSeq = 0;
  /** 데모 전용: 예시 사용자가 이미 제안을 보낸 (사용자|행사) */
  const sampleProposed = new Set<string>();
  let proposalSeq = 0;
  const isSample = (id: string) => id.startsWith('demo-sample-');

  function counterpartOf(userId: string): Counterpart {
    const sample = people.get(userId);
    const u = users.find((x) => x.id === userId);
    return {
      userId,
      nickname: sample?.nickname ?? u?.nickname ?? '',
      avatarInitial: sample?.avatarInitial ?? (u?.nickname ? avatarInitial(u.nickname) : ''),
      avatarColor: sample?.avatarColor ?? AVATAR_COLORS[(u?.avatarColor as AvatarColor) ?? 'ink'] ?? AVATAR_COLORS.ink,
    };
  }

  /** viewer가 보는 후보 중 other (조건을 넓힌 경우까지) */
  function candidateFor(viewerId: string, eventId: string, otherId: string) {
    const { days } = visibleEvent(eventId);
    const all = profilesFor(viewerId, eventId);
    const viewer = all.find((p) => p.userId === viewerId);
    if (!viewer) return null;
    const today = isoOf(todayInSeoul(now()));
    return (
      matchCandidates(viewer, all, days.filter((d) => d.date >= today), POLICY, { shortTime: true, immersionPlus: true }).candidates.find(
        (c) => c.userId === otherId,
      ) ?? null
    );
  }

  /** 만료, 약속 시간 규칙, (데모 전용) 예시 사용자의 자동 수락·자동 확인 */
  function settle() {
    const t = now().getTime();
    for (const p of proposals) {
      if (p.status !== 'SENT') continue;
      if (p.expiresAt.getTime() <= t) p.status = 'EXPIRED';
      else if (p.autoAcceptAt !== null && p.autoAcceptAt <= t) {
        const { day } = dayAndSpot(p.eventId, p.eventDayId, p.meetingSpotId);
        const segs = day.segments.filter((x) => p.segmentIds.includes(x.id));
        const w = appointmentWindow(day, segs);
        // 예시 사용자도 시간이 겹치는 약속은 수락하지 않습니다.
        if (overlapFor(p.senderId, rangeOf(day.date, w.startTime, w.endTime))) p.status = 'REJECTED';
        else acceptInternal(p);
      }
    }
    for (const a of appointments) {
      for (const step of dueAppointmentSteps(factsOf(a), now())) applyStep(a, step);
      // 데모 전용: 내가 메시지를 보내면 예시 상대가 몇 초 뒤 정해진 답장을 보냅니다.
      const sampleUser = a.users.find(isSample);
      if (sampleUser && a.sampleReplyAt !== null && a.sampleReplyAt <= t && isChatOpen(chatClosesAtOf(a), now())) {
        a.sampleReplyAt = null;
        if (a.sampleReplies < SAMPLE_REPLIES.length) addMessage(a, sampleUser, 'TEXT', SAMPLE_REPLIES[a.sampleReplies++]);
      }
      // 데모 전용: 예시 상대는 확인 요청이 열리면 몇 초 뒤 '갈 수 있어요'를 누릅니다.
      for (const u of a.users.filter(isSample)) {
        if (!appointmentActions(factsOf(a), u, now(), { newScheduleAvailable: false }).confirm) continue;
        if (a.sampleConfirmAt === null) a.sampleConfirmAt = t + autoAcceptDelayMs;
        else if (a.sampleConfirmAt <= t) confirmInternal(a, u);
      }
      if (a.status === 'IN_PROGRESS') runSafetyChecks(a);
    }
    for (const party of parties) settleParty(party, t);
  }

  // ───────────── 일행 ─────────────

  const partySize = { minSize: POLICY_DEFAULTS.PARTY_MIN_SIZE, maxSize: POLICY_DEFAULTS.PARTY_MAX_SIZE };
  const activeMembers = (p: DemoParty) => p.members.filter((m) => m.active);

  /** 입력을 마쳤는지: 일정·스타일 입력과 티켓 인증(또는 참석 예정) */
  function partyReady(userId: string, eventId: string): boolean {
    const profile = profiles(eventId).find((x) => x.userId === userId);
    return isInputDone({ hasPreference: !!profile, grade: profile?.grade ?? null });
  }

  function leaveParty(p: DemoParty, userId: string) {
    const m = p.members.find((x) => x.userId === userId && x.active);
    if (m) m.active = false;
  }

  function settleParty(p: DemoParty, t: number) {
    if (p.status === 'DISBANDED') return;
    // 데모 전용: 일행을 만들면 잠시 뒤 예시 친구가 합류합니다.
    if (p.sampleJoinAt !== null && p.sampleJoinAt <= t && now() < p.inviteExpiresAt && JOINABLE_PARTY_STATUSES.includes(p.status) && activeMembers(p).length < partySize.maxSize) {
      p.sampleJoinAt = null;
      const friend = SAMPLE_PEOPLE.map((x) => `demo-sample-${x.key}`).find(
        (id) =>
          partyReady(id, p.eventId) &&
          !parties.some((o) => o.eventId === p.eventId && o.status !== 'DISBANDED' && o.members.some((m) => m.active && m.userId === id)) &&
          !activeMembers(p).some((m) => isBlockedBetween(id, m.userId)),
      );
      if (friend) {
        p.members.push({ userId: friend, joinedAt: now(), active: true, remindedAt: null });
        for (const m of activeMembers(p)) notify(m.userId, 'PARTY_JOINED', { nickname: nicknameOf(friend), eventName: eventName(p.eventId) });
      }
    }
    for (let guard = 0; guard < 4; guard++) {
      const members = activeMembers(p);
      const eventOpen = (() => {
        const ev = events.find((e) => e.detail.id === p.eventId);
        const today = isoOf(todayInSeoul(now()));
        return !!ev && ev.status === 'REGISTERED' && ev.detail.days.some((d) => d.date >= today);
      })();
      const next: { to: PartyStatus } | null = !eventOpen
        ? ({ to: 'DISBANDED' } as const)
        : nextPartyStatus(p.status, members.map((m) => ({ ready: partyReady(m.userId, p.eventId) })), partySize, now() >= p.inviteExpiresAt);
      if (!next) {
        if (p.status === 'CONFIRMING') {
          for (const m of members) {
            if (partyReady(m.userId, p.eventId) || m.remindedAt) continue;
            if (now().getTime() >= m.joinedAt.getTime() + POLICY_DEFAULTS.PARTY_INPUT_REMIND_HOURS * 60 * 60 * 1000) {
              m.remindedAt = now();
              notify(m.userId, 'PARTY_INPUT_REMIND', { eventName: eventName(p.eventId) });
            }
          }
        }
        return;
      }
      p.status = next.to;
      if (next.to === 'DISBANDED') {
        for (const m of members) notify(m.userId, 'PARTY_DISBANDED', { eventName: eventName(p.eventId) });
        for (const m of members) m.active = false;
      } else if (next.to === 'ACTIVE') {
        for (const m of members) notify(m.userId, 'PARTY_READY', { eventName: eventName(p.eventId) });
      }
    }
  }

  function partyView(p: DemoParty, me: string): PartyView {
    const members = activeMembers(p).map((m) => {
      const c = counterpartOf(m.userId);
      return {
        userId: m.userId,
        nickname: c.nickname,
        avatarInitial: c.avatarInitial,
        avatarColor: c.avatarColor,
        isMe: m.userId === me,
        isLeader: m.userId === p.leaderId,
        ready: partyReady(m.userId, p.eventId),
      };
    });
    const isLeader = p.leaderId === me;
    const joinable = JOINABLE_PARTY_STATUSES.includes(p.status) && now() < p.inviteExpiresAt && members.length < partySize.maxSize;
    const notReady = members.filter((m) => !m.ready);
    return {
      id: p.id,
      event: { id: p.eventId, name: eventName(p.eventId) },
      status: p.status,
      statusLabel: PARTY_STATUS_LABELS[p.status],
      members,
      minSize: partySize.minSize,
      maxSize: partySize.maxSize,
      invite: isLeader && joinable ? { url: `https://meets.example.com/party-invite/${p.id}.demo`, expiresAt: p.inviteExpiresAt.toISOString() } : null,
      guide: partyGuide({ status: p.status, isLeader, notReady: notReady.filter((m) => !m.isMe).map((m) => m.nickname), meNotReady: notReady.some((m) => m.isMe), memberCount: members.length, maxSize: partySize.maxSize }),
      actions: {
        proceedWithout: isLeader && p.status === 'CONFIRMING' && notReady.length > 0 && members.length - notReady.length >= partySize.minSize,
        disband: isLeader,
        leave: true,
        candidates: p.status === 'ACTIVE',
      },
    };
  }

  function myParty(id: string) {
    const user = currentUser();
    settle();
    const p = parties.find((x) => x.id === id && x.status !== 'DISBANDED' && x.members.some((m) => m.active && m.userId === user.id));
    if (!p) throw new ApiError('NOT_FOUND', '일행을 찾을 수 없어요.');
    return { user, p };
  }

  function partyByToken(token: string) {
    const id = token.slice(0, token.lastIndexOf('.'));
    const p = parties.find((x) => x.id === id && x.status !== 'DISBANDED');
    if (!p) throw new ApiError('INVITE_UNAVAILABLE', '열 수 없는 초대예요. 보낸 분께 새 링크를 부탁해 보세요.');
    return p;
  }

  function joinProblem(userId: string, p: DemoParty): string | null {
    if (activeMembers(p).some((m) => m.userId === userId)) return '이미 이 일행이에요.';
    if (!JOINABLE_PARTY_STATUSES.includes(p.status)) return '이미 시작한 일행이라 합류할 수 없어요.';
    if (now() >= p.inviteExpiresAt) return '초대 시간이 지났어요. 새 링크를 부탁해 보세요.';
    if (activeMembers(p).length >= partySize.maxSize) return `일행은 최대 ${partySize.maxSize}명이에요.`;
    if (parties.some((o) => o.eventId === p.eventId && o.status !== 'DISBANDED' && o.members.some((m) => m.active && m.userId === userId))) return '이 행사에는 이미 다른 일행이 있어요.';
    return null;
  }

  /** 일행 후보를 찾기 위한 정보 (일행 전원의 입력이 있어야 함) */
  function partyContext(p: DemoParty) {
    const { days } = visibleEvent(p.eventId);
    const all = profiles(p.eventId);
    const memberIds = activeMembers(p).map((m) => m.userId);
    const members = memberIds.map((id) => all.find((x) => x.userId === id));
    if (members.some((m) => !m)) throw new ApiError('PREFERENCE_REQUIRED', '일행 전원이 일정과 스타일을 입력해야 해요.');
    const others = all.filter((x) => !memberIds.some((id) => isBlockedBetween(id, x.userId)));
    const today = isoOf(todayInSeoul(now()));
    return { days: days.filter((d) => d.date >= today), members: members as MatchProfile[], others, memberIds };
  }

  /** 만남 중인 약속의 안전 확인: 정해진 시각에 묻고, 답이 없으면 다시 묻고, 믿는 사람 링크에 알립니다. (서버의 SafetyChecksService와 같은 규칙) */
  function runSafetyChecks(a: DemoAppointment) {
    const { startsAt, endsAt } = rangeOf(a.date, a.startTime, a.endTime);
    for (const userId of a.users) {
      const u = users.find((x) => x.id === userId);
      if (!u || !u.safety.checkEnabled) continue;
      const mine = safetyChecks.filter((c) => c.appointmentId === a.id && c.userId === userId);
      const busy = mine.some((c) => !c.answeredAt && !c.alertedAt);
      for (const step of dueSafetySteps(startsAt, endsAt, mine, now(), safetyPolicy)) {
        if (step.kind === 'ASK' && busy) continue;
        applySafetyStep(a, u, step);
        if (step.kind === 'ASK') break;
      }
    }
  }

  function applySafetyStep(a: DemoAppointment, u: DemoUser, step: SafetyStep) {
    const target = { appointmentId: a.id };
    const params = { eventName: eventName(a.eventId) };
    const c = safetyChecks.find((x) => x.appointmentId === a.id && x.userId === u.id && x.seq === step.seq);
    if (step.kind === 'ASK') {
      if (c) return;
      safetyChecks.push({ id: `demo-safety-${++safetySeq}`, appointmentId: a.id, userId: u.id, seq: step.seq, askedAt: now(), remindedAt: null, answeredAt: null, alertedAt: null });
      notify(u.id, 'SAFETY_CHECK', params, target);
    } else if (step.kind === 'REMIND' && c && !c.remindedAt) {
      c.remindedAt = now();
      notify(u.id, 'SAFETY_CHECK_REMIND', params, target);
    } else if (step.kind === 'ALERT' && c && !c.alertedAt) {
      c.alertedAt = now();
      if (u.safety.alertTrusted) markLinks(a.id, u.id, 'NO_RESPONSE');
    }
  }

  function markLinks(appointmentId: string, creatorId: string, kind: 'HELP' | 'NO_RESPONSE') {
    for (const l of shareLinks) {
      if (l.appointmentId === appointmentId && l.creatorId === creatorId && !l.revokedAt) {
        l.alertKind = kind;
        l.alertAt = now();
      }
    }
  }

  /** 링크 한 건의 화면 내용 (받는 사람이 보는 것과 같음) */
  function shareLinkView(l: (typeof shareLinks)[number]): { view: ShareLinkView; expired: boolean } {
    const a = appointments.find((x) => x.id === l.appointmentId)!;
    const other = a.users.find((x) => x !== l.creatorId)!;
    const { startsAt, endsAt } = rangeOf(a.date, a.startTime, a.endTime);
    const basis = a.endedAt && a.endedAt < endsAt ? a.endedAt : endsAt;
    const expiresAt = shareLinkExpiresAt(basis, POLICY_DEFAULTS.SHARE_LINK_EXPIRE_HOURS_AFTER_END);
    const arrivedAt = a.parts[l.creatorId].arrivedAt;
    const preview: SharedAppointmentView = {
      eventName: eventName(a.eventId),
      when: formatSeoulShort(startsAt),
      spotName: a.meetingSpotName,
      companion: nicknameOf(other),
      status: l.showStatus ? sharedStatusOf(a.status, arrivedAt) : null,
      arrivedAt: l.showStatus && arrivedAt ? arrivedAt.toISOString() : null,
      alert: l.alertKind && l.alertAt ? { kind: l.alertKind, at: l.alertAt.toISOString() } : null,
      expiresAt: expiresAt.toISOString(),
    };
    return {
      expired: !!l.revokedAt || now() >= expiresAt,
      view: {
        id: l.id,
        appointmentId: a.id,
        url: `https://meets.example.com/share/${l.id}`,
        showStatus: l.showStatus,
        expiresAt: expiresAt.toISOString(),
        preview,
        eventName: eventName(a.eventId),
      },
    };
  }

  function factsOf(a: DemoAppointment): AppointmentFacts {
    return {
      status: a.status,
      date: a.date,
      startTime: a.startTime,
      endTime: a.endTime,
      policy: a.policy,
      rescheduleDeadline: a.rescheduleDeadline,
      confirmOpensAt: a.confirmOpensAt,
      participants: a.users.map((userId) => ({ userId, ...a.parts[userId] })),
    };
  }

  /** 알림함 (예시 사용자에게는 쌓지 않습니다) */
  function notify(userId: string, kind: NotificationKind, params: NotificationParams, target: { appointmentId?: string; proposalId?: string } = {}) {
    if (isSample(userId)) return;
    const { title, body } = notificationText(kind, params);
    notifications.push({
      id: `demo-notification-${++notificationSeq}`,
      userId,
      kind,
      title,
      body,
      createdAt: now().toISOString(),
      read: false,
      appointmentId: target.appointmentId ?? null,
      proposalId: target.proposalId ?? null,
    });
  }

  const nicknameOf = (userId: string) => counterpartOf(userId).nickname;
  const eventName = (eventId: string) => events.find((e) => e.detail.id === eventId)!.detail.name;

  function applyStep(a: DemoAppointment, step: AppointmentStep) {
    const t = factsTimes(factsOf(a));
    const base = { eventName: eventName(a.eventId), when: formatSeoulShort(t.startsAt), spotName: a.meetingSpotName, deadline: formatSeoulShort(t.deadline) };
    const target = { appointmentId: a.id };
    const once = (ids: string[], field: 'dayBeforeNotifiedAt' | 'reminderNotifiedAt' | 'soonNotifiedAt', kind: NotificationKind) => {
      for (const u of ids) {
        if (a.parts[u][field]) continue;
        a.parts[u][field] = now();
        notify(u, kind, base, target);
      }
    };
    switch (step.kind) {
      case 'NOTIFY_DAY_BEFORE':
        return once(step.userIds, 'dayBeforeNotifiedAt', 'DAY_BEFORE_CONFIRM');
      case 'NOTIFY_REMINDER':
        return once(step.userIds, 'reminderNotifiedAt', 'DAY_BEFORE_REMINDER');
      case 'NOTIFY_SOON':
        return once(step.userIds, 'soonNotifiedAt', 'APPOINTMENT_SOON');
      case 'CANCEL_NO_CONFIRM':
        setStatus(a, 'CANCELLED');
        a.endReason = 'NO_CONFIRM';
        for (const u of a.users) {
          const silent = step.noResponseUserIds.includes(u);
          a.parts[u].noResponse = silent;
          notify(u, silent ? 'NO_CONFIRM_SELF' : 'NO_CONFIRM_PARTNER', base, target);
        }
        return;
      case 'START':
        setStatus(a, 'IN_PROGRESS');
        return;
      case 'END': {
        // 정상적으로 끝난 만남은 양쪽에 후기 요청을 보냅니다. (취소·중간 종료·행사 취소는 보내지 않음)
        setStatus(a, 'ENDED');
        const deadline = formatSeoulShort(reviewDeadline(t.endsAt, POLICY_DEFAULTS.REVIEW_WINDOW_DAYS));
        for (const u of a.users) notify(u, 'REVIEW_REQUEST', { nickname: nicknameOf(a.users.find((x) => x !== u)!), eventName: eventName(a.eventId), deadline }, target);
        return;
      }
      case 'HOLD':
        setStatus(a, 'ON_HOLD');
        for (const u of a.users) notify(u, 'APPOINTMENT_ON_HOLD', base, target);
        return;
    }
  }

  function confirmInternal(a: DemoAppointment, userId: string) {
    a.parts[userId].confirmedAt = now();
    if (a.users.every((u) => a.parts[u].confirmedAt)) {
      setStatus(a, 'CONFIRMED');
      const other = a.users.find((u) => u !== userId)!;
      notify(other, 'APPOINTMENT_CONFIRMED', { nickname: nicknameOf(userId), when: formatSeoulShort(factsTimes(factsOf(a)).startsAt), spotName: a.meetingSpotName }, { appointmentId: a.id });
    }
  }

  /** 이 사람의 진행 중인 약속 중 시간이 겹치는 것 */
  function overlapFor(userId: string, range: TimeRange, excludeId?: string) {
    return appointments.find(
      (a) =>
        a.id !== excludeId &&
        a.users.includes(userId) &&
        ACTIVE_APPOINTMENT_STATUSES.includes(a.status) &&
        rangesOverlap(rangeOf(a.date, a.startTime, a.endTime), range),
    );
  }

  function acceptInternal(p: DemoProposal, options: { confirmOpensAt?: Date } = {}) {
    p.status = 'ACCEPTED';
    const { day, spot } = dayAndSpot(p.eventId, p.eventDayId, p.meetingSpotId);
    const segments = day.segments.filter((x) => p.segmentIds.includes(x.id));
    const a: DemoAppointment = {
      id: `demo-appointment-${appointments.length + 1}`,
      proposalId: p.id,
      eventId: p.eventId,
      eventDayId: p.eventDayId,
      meetingSpotId: spot.id,
      meetingSpotName: spot.name,
      users: [p.senderId, p.receiverId],
      status: 'PENDING_CONFIRM',
      date: day.date,
      ...appointmentWindow(day, segments),
      segments,
      policy: DEMO_APPOINTMENT_POLICY,
      rescheduleDeadline: null,
      confirmOpensAt: options.confirmOpensAt ?? null,
      endReason: null,
      cancelledBy: null,
      cancelReason: null,
      parts: { [p.senderId]: emptyPart(), [p.receiverId]: emptyPart() },
      createdAt: now().getTime(),
      sampleConfirmAt: null,
      endedAt: null,
      chatExtended: false,
      endedBySafety: false,
      messages: [],
      readSeq: {},
      sampleReplyAt: null,
      sampleReplies: 0,
    };
    appointments.push(a);
    addMessage(a, null, 'SYSTEM', CHAT_STATUS_LINES.PENDING_CONFIRM!);
    // 데모 전용: 예시 상대가 먼저 인사합니다.
    const sample = a.users.find(isSample);
    if (sample) addMessage(a, sample, 'TEXT', SAMPLE_GREETING);
    notify(p.senderId, 'PROPOSAL_ACCEPTED', { nickname: nicknameOf(p.receiverId), eventName: eventName(p.eventId) }, { appointmentId: a.id });
    return a;
  }

  /** '벗어나고 싶어요': 약속을 끝내고 채팅을 닫습니다. 상대에게는 사유 없이 '취소'로만 보입니다. */
  function helpInternal(a: DemoAppointment, user: DemoUser): HelpResult {
    const t = factsTimes(factsOf(a));
    if (!canRequestHelp(a.status, now(), { startsAt: t.startsAt, endsAt: t.endsAt }, a.policy.arrivalOpenMinutes)) {
      throw new ApiError('SAFETY_NOT_NOW', '지금은 도움 요청을 쓸 수 없어요. 나중에 문제가 있었다면 신고로 알려 주세요.');
    }
    setStatus(a, 'ENDED_EARLY');
    a.endReason = 'CANCELLED';
    a.cancelledBy = user.id;
    a.endedBySafety = true;
    a.parts[user.id].lateCancel = false;
    for (const c of safetyChecks) if (c.appointmentId === a.id && c.userId === user.id && !c.answeredAt) c.answeredAt = now();
    if (user.safety.alertTrusted) markLinks(a.id, user.id, 'HELP');
    const other = a.users.find((x) => x !== user.id)!;
    notify(other, 'APPOINTMENT_CANCELLED', { nickname: nicknameOf(user.id), eventName: eventName(a.eventId), reason: null }, { appointmentId: a.id });
    return { ended: true, reported: true, trustedNotified: user.safety.alertTrusted };
  }

  let messageSeq = 0;
  function addMessage(a: DemoAppointment, senderId: string | null, kind: 'TEXT' | 'SYSTEM', body: string, contactDetected = false) {
    const m: DemoMessage = { id: `demo-message-${++messageSeq}`, seq: messageSeq, senderId, kind, body, contactDetected, createdAt: now() };
    a.messages.push(m);
    return m;
  }

  /** 약속 상태 바꾸기: 채팅에 안내 줄을 남기고, 끝난 약속은 끝난 시각을 기록 (서버의 AppointmentStateService와 같음) */
  function setStatus(a: DemoAppointment, to: AppointmentStatus) {
    a.status = to;
    if (CLOSED_APPOINTMENT_STATUSES.includes(to)) a.endedAt = now();
    const line = CHAT_STATUS_LINES[to];
    if (line) addMessage(a, null, 'SYSTEM', line);
  }

  function chatClosesAtOf(a: DemoAppointment) {
    // 차단한 두 사람의 채팅은 닫힙니다. (지난 대화는 읽을 수 있음)
    if (isBlockedBetween(a.users[0], a.users[1])) return now();
    return chatClosesAt(
      { status: a.status, endsAt: seoulDateTime(a.date, a.endTime), endedAt: a.endedAt, extended: a.chatExtended, endedBySafety: a.endedBySafety },
      { closeHoursAfterEnd: POLICY_DEFAULTS.CHAT_CLOSE_HOURS_AFTER_END },
    );
  }

  function unreadOf(a: DemoAppointment, me: string) {
    const read = a.readSeq[me] ?? 0;
    return a.messages.filter((m) => m.kind === 'TEXT' && m.senderId !== me && m.seq > read).length;
  }

  function messageView(m: DemoMessage, me: string): ChatMessageView {
    return {
      id: m.id,
      seq: m.seq,
      kind: m.kind,
      mine: m.senderId === me,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      flagged: m.senderId === me && m.contactDetected,
    };
  }

  function dayAndSpot(eventId: string, dayId: string, spotId: string) {
    const ev = events.find((e) => e.detail.id === eventId)!.detail;
    const day = ev.days.find((d) => d.id === dayId)!;
    const spot = ev.meetingSpots.find((m) => m.id === spotId)!;
    return { ev, day, spot };
  }

  function proposalView(p: DemoProposal, me: string): ProposalView {
    const { ev, day, spot } = dayAndSpot(p.eventId, p.eventDayId, p.meetingSpotId);
    const received = p.receiverId === me;
    return {
      id: p.id,
      direction: received ? 'RECEIVED' : 'SENT',
      status: p.status,
      counterpart: counterpartOf(received ? p.senderId : p.receiverId),
      event: { id: ev.id, name: ev.name },
      day: { id: day.id, date: day.date },
      segments: day.segments.filter((x) => p.segmentIds.includes(x.id)),
      meetingSpot: { id: spot.id, name: spot.name },
      expiresAt: p.expiresAt.toISOString(),
      createdAt: new Date(p.createdAt).toISOString(),
    };
  }

  function appointmentView(a: DemoAppointment, me: string): AppointmentView {
    const f = factsOf(a);
    const t = factsTimes(f);
    const other = a.users.find((u) => u !== me)!;
    const mine = a.parts[me];
    const theirs = a.parts[other];
    const actions = appointmentActions(f, me, now(), { newScheduleAvailable: false });
    const pendingCheck =
      a.status === 'IN_PROGRESS' ? safetyChecks.filter((c) => c.appointmentId === a.id && c.userId === me && !c.answeredAt).sort((x, y) => y.seq - x.seq)[0] : undefined;
    const byMe =
      a.endReason === 'CANCELLED' ? a.cancelledBy === me : a.endReason === 'NO_CONFIRM' ? mine.noResponse : a.endReason === 'NO_SHOW' ? !!mine.noShowReportedAt : false;
    return {
      id: a.id,
      status: a.status,
      counterpart: counterpartOf(other),
      event: { id: a.eventId, name: eventName(a.eventId) },
      day: { id: a.eventDayId, date: a.date, startTime: a.startTime },
      segments: a.segments,
      meetingSpot: { id: a.meetingSpotId, name: a.meetingSpotName },
      createdAt: new Date(a.createdAt).toISOString(),
      startsAt: t.startsAt.toISOString(),
      endsAt: t.endsAt.toISOString(),
      confirm: { opensAt: t.opensAt.toISOString(), deadline: t.deadline.toISOString(), mine: !!mine.confirmedAt, theirs: !!theirs.confirmedAt },
      arrival: { mine: mine.arrivedAt?.toISOString() ?? null, theirs: theirs.arrivedAt?.toISOString() ?? null },
      freeCancelUntil: freeCancelUntil(a.date, a.startTime, a.policy).toISOString(),
      reschedule: null,
      end: a.endReason
        ? {
            reason: a.endReason,
            byMe,
            cancelReason: a.cancelReason ? CANCEL_REASONS[a.cancelReason] : null,
            late: a.endReason === 'CANCELLED' && a.cancelledBy === me && mine.lateCancel,
          }
        : null,
      actions,
      needsAction: actions.confirm || actions.reconfirm || actions.arrive || actions.reportNoShow || !!pendingCheck,
      unreadMessages: unreadOf(a, me),
      review: reviewStateOf(a, me, t.endsAt),
      safety: {
        canRequestHelp: canRequestHelp(a.status, now(), { startsAt: t.startsAt, endsAt: t.endsAt }, a.policy.arrivalOpenMinutes),
        pendingCheck: pendingCheck
          ? { id: pendingCheck.id, askedAt: pendingCheck.askedAt.toISOString(), minutesSinceStart: Math.max(0, Math.floor((now().getTime() - t.startsAt.getTime()) / 60000)) }
          : null,
      },
    };
  }

  /** 후기: 정상적으로 끝난 만남만, 끝나고 N일 동안, 한 번만 */
  function reviewStateOf(a: DemoAppointment, me: string, endsAt: Date) {
    const deadline = reviewDeadline(endsAt, POLICY_DEFAULTS.REVIEW_WINDOW_DAYS);
    const done = reviews.some((r) => r.appointmentId === a.id && r.authorId === me);
    return { canWrite: a.status === 'ENDED' && !done && now() < deadline, done, deadline: deadline.toISOString() };
  }

  /** 내 약속 하나 (약속에 없는 사람에게는 '찾을 수 없어요') */
  function myAppointment(id: string) {
    const user = currentUser();
    settle();
    const a = appointments.find((x) => x.id === id && x.users.includes(user.id));
    if (!a) throw new ApiError('NOT_FOUND', '약속을 찾을 수 없어요.');
    return { user, a };
  }

  /** 내 신뢰 단계 (서버의 TrustService와 같은 규칙) */
  function trustOf(userId: string): TrustView {
    const since = now().getTime() - POLICY_DEFAULTS.TRUST_DOWN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const mineAppointments = appointments.filter((a) => a.users.includes(userId));
    const recent = (a: DemoAppointment) => (a.endedAt?.getTime() ?? 0) >= since;
    const facts = {
      everPlanned: [...plans].some((k) => k.startsWith(`${userId}|`)),
      everVerified: [...tickets.values()].some((t) => t.userId === userId && t.status === 'VERIFIED'),
      positiveReviews: reviews.filter((r) => r.targetId === userId && (r.overall === 'GREAT' || r.overall === 'OK')).length,
      upheldReports: 0,
      recentBadRecords: mineAppointments.filter(
        (a) => recent(a) && ((a.endReason === 'CANCELLED' && a.cancelledBy === userId && a.parts[userId].lateCancel) || a.parts[userId].noResponse),
      ).length,
    };
    const policy = { upReviewCount: POLICY_DEFAULTS.TRUST_UP_REVIEW_COUNT, downCount: POLICY_DEFAULTS.TRUST_DOWN_COUNT };
    return trustView(computeTrust(facts, policy).level, facts, policy);
  }

  /** 차단: 서로 후보에서 숨기고, 답을 기다리는 제안은 조용히 취소하고, 진행 중인 약속은 끝냅니다. 상대에게는 알리지 않습니다. */
  function blockInternal(blockerId: string, blockedId: string, source: BlockSource) {
    if (!blockMap.has(`${blockerId}>${blockedId}`)) blockMap.set(`${blockerId}>${blockedId}`, { blockerId, blockedId, source, at: now() });
    for (const p of proposals) {
      const between = (p.senderId === blockerId && p.receiverId === blockedId) || (p.senderId === blockedId && p.receiverId === blockerId);
      if (between && p.status === 'SENT') p.status = 'CANCELLED';
    }
    for (const a of appointments) {
      if (!a.users.includes(blockerId) || !a.users.includes(blockedId)) continue;
      if (!['PENDING_CONFIRM', 'CONFIRMED', 'IN_PROGRESS', 'RESCHEDULING', 'ON_HOLD'].includes(a.status)) continue;
      // 차단한 사람에게는 임박 취소 기록을 남기지 않고, 상대에게는 이유 없이 '취소'로만 보입니다.
      setStatus(a, a.status === 'IN_PROGRESS' ? 'ENDED_EARLY' : 'CANCELLED');
      a.endReason = 'CANCELLED';
      a.cancelledBy = blockerId;
      a.parts[blockerId].lateCancel = false;
      notify(blockedId, 'APPOINTMENT_CANCELLED', { nickname: nicknameOf(blockerId), eventName: eventName(a.eventId), reason: null }, { appointmentId: a.id });
    }
  }

  /** 차단 관계를 뺀 매칭 정보. 보는 사람에게는 서로 '또 같이 가고 싶어요'를 고른 사람을 붙입니다. */
  function profilesFor(viewerId: string, eventId: string): MatchProfile[] {
    const all = profiles(eventId).filter((p) => p.userId === viewerId || !isBlockedBetween(viewerId, p.userId));
    const reunion = appointments
      .filter((a) => a.chatExtended && a.users.includes(viewerId))
      .map((a) => a.users.find((u) => u !== viewerId)!)
      .filter((u) => !isBlockedBetween(viewerId, u));
    return all.map((p) => (p.userId === viewerId ? { ...p, reunionWith: reunion } : p));
  }

  /**
   * 데모 전용: 가입을 마치면 '어제 끝난 만남'도 하나 넣어 둡니다. 후기 남기기를 바로 해 볼 수 있도록 후기 요청이 와 있고,
   * 예시 상대(지우)는 이미 '또 같이 가고 싶어요'를 골랐습니다. (사용자도 고르면 서로 이어집니다)
   */
  function seedPastAppointment(userId: string) {
    const ev = events[0].detail;
    const spot = ev.meetingSpots[0];
    const partner = `demo-sample-${SAMPLE_PEOPLE[1].key}`;
    const today = todayInSeoul(now());
    const y = new Date(Date.UTC(today.year, today.month - 1, today.day - 1));
    const date = y.toISOString().slice(0, 10);
    if (!spot) return;
    const a: DemoAppointment = {
      id: `demo-appointment-${appointments.length + 1}`,
      proposalId: 'demo-proposal-past',
      eventId: ev.id,
      eventDayId: null,
      meetingSpotId: spot.id,
      meetingSpotName: spot.name,
      users: [partner, userId],
      status: 'ENDED',
      date,
      startTime: '15:00',
      endTime: '17:00',
      segments: [{ id: 'demo-segment-past', label: '굿즈 줄', startTime: '15:00', endTime: '17:00' }],
      policy: DEMO_APPOINTMENT_POLICY,
      rescheduleDeadline: null,
      confirmOpensAt: null,
      endReason: null,
      cancelledBy: null,
      cancelReason: null,
      parts: { [partner]: emptyPart(), [userId]: emptyPart() },
      createdAt: now().getTime() - 3 * 24 * 60 * 60 * 1000,
      sampleConfirmAt: null,
      endedAt: seoulDateTime(date, '17:00'),
      chatExtended: false,
      endedBySafety: false,
      messages: [],
      readSeq: {},
      sampleReplyAt: null,
      sampleReplies: SAMPLE_REPLIES.length,
    };
    appointments.push(a);
    for (const status of ['PENDING_CONFIRM', 'CONFIRMED', 'ENDED'] as const) addMessage(a, null, 'SYSTEM', CHAT_STATUS_LINES[status]!);
    addMessage(a, partner, 'TEXT', '오늘 같이 줄 서서 즐거웠어요! 덕분에 시간이 빨리 갔어요.');
    a.readSeq[userId] = messageSeq;
    reviews.push({ appointmentId: a.id, authorId: partner, targetId: userId, overall: 'GREAT', again: 'YES' });
    const deadline = formatSeoulShort(reviewDeadline(seoulDateTime(date, '17:00'), POLICY_DEFAULTS.REVIEW_WINDOW_DAYS));
    notify(userId, 'REVIEW_REQUEST', { nickname: nicknameOf(partner), eventName: ev.name, deadline }, { appointmentId: a.id });
  }

  /**
   * 데모 전용: 가입을 마치면 '내일 약속'을 하나 넣어 둡니다. 전날 확인을 바로 해 볼 수 있도록 확인 요청을 지금 열어 두고,
   * 예시 상대(하늘)는 이미 '갈 수 있어요'를 누른 상태입니다.
   */
  function seedTomorrowAppointment(userId: string) {
    const index = events.length - 1; // 내일 열리는 '생일 카페'
    const ev = events[index].detail;
    const day = ev.days[0];
    const seg = day.segments[day.segments.length - 1];
    const spot = ev.meetingSpots[0];
    const sky = `demo-sample-${SAMPLE_PEOPLE[0].key}`;
    if (!day || !seg || !spot) return;
    const p: DemoProposal = {
      id: `demo-proposal-${++proposalSeq}`,
      senderId: sky,
      receiverId: userId,
      eventId: ev.id,
      eventDayId: day.id,
      segmentIds: [seg.id],
      meetingSpotId: spot.id,
      status: 'SENT',
      expiresAt: now(),
      createdAt: now().getTime() - 2 * 24 * 60 * 60 * 1000,
      autoAcceptAt: null,
    };
    proposals.push(p);
    const a = acceptInternal(p, { confirmOpensAt: now() });
    a.parts[sky].confirmedAt = now();
    a.parts[sky].dayBeforeNotifiedAt = now();
  }

  /**
   * 데모 전용: '지금 만나는 중'인 약속. 안전 확인과 도움 요청을 바로 해 볼 수 있도록 만남이 시작된 지 55분쯤 지난 상태로 둡니다.
   * (5분쯤 뒤 '잘 만나고 계세요?'가 와요.) 자정 무렵에는 오늘 0시부터 시작한 것으로 둡니다.
   */
  function seedNowAppointment(userId: string) {
    const ev = events[1]?.detail ?? events[0].detail;
    const day = ev.days[0];
    const spot = ev.meetingSpots[0];
    const sound = `demo-sample-${SAMPLE_PEOPLE[2]?.key ?? SAMPLE_PEOPLE[0].key}`;
    if (!day || !spot) return;
    const p: DemoProposal = {
      id: `demo-proposal-${++proposalSeq}`,
      senderId: sound,
      receiverId: userId,
      eventId: ev.id,
      eventDayId: day.id,
      segmentIds: [],
      meetingSpotId: spot.id,
      status: 'SENT',
      expiresAt: now(),
      createdAt: now().getTime() - 2 * 24 * 60 * 60 * 1000,
      autoAcceptAt: null,
    };
    proposals.push(p);
    const a = acceptInternal(p);
    const hhmm = (d: Date) => {
      const k = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      return `${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
    };
    const ymd = (d: Date) => new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let start = new Date(now().getTime() - 55 * 60 * 1000);
    if (ymd(start) !== ymd(now())) start = seoulDateTime(ymd(now()), '00:00');
    const endAt = new Date(Math.min(start.getTime() + 3 * 60 * 60 * 1000, seoulDateTime(ymd(start), '23:59').getTime()));
    a.date = ymd(start);
    a.startTime = hhmm(start);
    a.endTime = hhmm(endAt);
    a.segments = [{ id: 'demo-segment-now', label: '같이 둘러보기', startTime: a.startTime, endTime: a.endTime }];
    a.status = 'IN_PROGRESS';
    for (const u of a.users) {
      a.parts[u].confirmedAt = now();
      a.parts[u].arrivedAt = start;
      a.parts[u].dayBeforeNotifiedAt = now();
    }
    a.messages = [];
    for (const status of ['PENDING_CONFIRM', 'CONFIRMED', 'IN_PROGRESS'] as const) addMessage(a, null, 'SYSTEM', CHAT_STATUS_LINES[status]!);
    addMessage(a, sound, 'TEXT', '저 입구 쪽 포토존 앞에 있어요! 천천히 오세요.');
    a.sampleReplies = 0;
    // 알림함에는 약속이 만들어졌다는 알림만 남기고, 안내는 쌓지 않습니다.
    for (let i = notifications.length - 1; i >= 0; i--) if (notifications[i].appointmentId === a.id) notifications.splice(i, 1);
  }

  function newProposal(senderId: string, receiverId: string, eventId: string, eventDayId: string, segmentIds: string[], meetingSpotId: string): DemoProposal {
    const { day } = dayAndSpot(eventId, eventDayId, meetingSpotId);
    const expiresAt = proposalExpiresAt(now(), day, {
      expireHours: POLICY_DEFAULTS.PROPOSAL_EXPIRE_HOURS,
      eventCutoffHours: POLICY_DEFAULTS.PROPOSAL_EVENT_CUTOFF_HOURS,
    });
    if (!expiresAt) throw new ApiError('PROPOSAL_TOO_LATE', `행사 ${POLICY_DEFAULTS.PROPOSAL_EVENT_CUTOFF_HOURS}시간 전부터는 제안할 수 없어요.`);
    const p: DemoProposal = {
      id: `demo-proposal-${++proposalSeq}`,
      senderId,
      receiverId,
      eventId,
      eventDayId,
      segmentIds,
      meetingSpotId,
      status: 'SENT',
      expiresAt,
      createdAt: now().getTime(),
      autoAcceptAt: isSample(receiverId) ? now().getTime() + autoAcceptDelayMs : null,
    };
    proposals.push(p);
    notify(receiverId, 'PROPOSAL_RECEIVED', { nickname: nicknameOf(senderId), eventName: eventName(eventId), deadline: formatSeoulShort(expiresAt) }, { proposalId: p.id });
    return p;
  }

  function latestTicket(userId: string, eventId: string) {
    return [...tickets.entries()]
      .filter(([, t]) => t.userId === userId && t.eventId === eventId)
      .sort((a, b) => b[1].createdAt - a[1].createdAt)[0];
  }

  function gradeOf(userId: string, eventId: string): 'VERIFIED' | 'PLANNED' | null {
    const t = latestTicket(userId, eventId);
    if (t?.[1].status === 'VERIFIED') return 'VERIFIED';
    return plans.has(`${userId}|${eventId}`) ? 'PLANNED' : null;
  }
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
          immersion: immersionLevel(sampleImmersionAnswers(p, event.category)),
          must: { gender: p.mustGender, age: p.mustAge, promises: p.promises },
          fandomIds: p.fandoms.map((n) => fandomIdByName.get(n)).filter((x): x is string => !!x),
          grade: plan.ticket === 'VERIFIED' ? 'VERIFIED' : plan.ticket === 'PLANNED' && !event.ticketRequired ? 'PLANNED' : null,
          admissibleDayIds: plan.ticket === 'VERIFIED' ? plan.days.map((i) => event.days[i]?.id).filter((x): x is string => !!x) : null,
          trusted: p.trusted ?? false,
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
          grade: gradeOf(u.id, eventId),
          admissibleDayIds: latestTicket(u.id, eventId)?.[1].status === 'VERIFIED' ? latestTicket(u.id, eventId)![1].admissibleDayIds : null,
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
      grade: c.grade,
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
      trusted: c.trusted,
      reunion: c.reunion,
      summary: describeCandidate(c),
    };
  }

  function matchContext(eventId: string) {
    const user = currentUser();
    const { days } = visibleEvent(eventId);
    const all = profilesFor(user.id, eventId);
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
        safety: { ...DEFAULT_SAFETY_SETTINGS },
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
      if (!user.signupDone) {
        seedPastAppointment(user.id);
        seedTomorrowAppointment(user.id);
        seedNowAppointment(user.id);
      }
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
        immersionLevel: immersionLevel(input.immersionAnswers),
      };
      preferences.set(`${user.id}|${eventId}`, view);
      return delay(view);
    },

    async getCandidates(eventId, options) {
      const { days, all, viewer } = matchContext(eventId);
      const result = matchCandidates(viewer, all, days, POLICY, options);
      const cards = result.candidates.map(cardOf);
      // 데모 전용: 처음 후보를 볼 때 예시 사용자 한 명이 나에게 제안을 보냅니다. (받은 제안 흐름을 보여 주기 위해)
      const key = `${viewer.userId}|${eventId}`;
      if (!sampleProposed.has(key)) {
        sampleProposed.add(key);
        for (const c of result.candidates.filter((x) => isSample(x.userId))) {
          const back = candidateFor(c.userId, eventId, viewer.userId);
          const ov = back?.overlaps[0];
          const spot = visibleEvent(eventId).event.meetingSpots[0];
          if (!ov || !spot) continue;
          try {
            newProposal(c.userId, viewer.userId, eventId, ov.eventDayId, ov.segmentIds.slice(0, 1), spot.id);
          } catch {
            /* 행사가 너무 가까우면 건너뜀 */
          }
          break;
        }
      }
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

    async getTicketStatus(eventId): Promise<MyTicketStatus> {
      const user = currentUser();
      const { event } = visibleEvent(eventId);
      const t = latestTicket(user.id, eventId);
      return delay({
        verification: t
          ? { id: t[0], kind: t[1].kind, status: t[1].status, failReason: t[1].failReason, admissibleDayIds: t[1].admissibleDayIds }
          : null,
        grade: gradeOf(user.id, eventId),
        canPlanWithoutTicket: !event.ticketRequired,
      });
    },

    async startTicket(eventId, kind) {
      const user = currentUser();
      visibleEvent(eventId);
      const t = latestTicket(user.id, eventId);
      if (t && ['REVIEW_PENDING', 'VERIFIED', 'REVERIFYING'].includes(t[1].status)) {
        throw new ApiError('TICKET_STATE', '이미 인증했거나 확인 중이에요.');
      }
      const id = `demo-ticket-${++ticketSeq}`;
      tickets.set(id, { userId: user.id, eventId, kind, status: 'STARTED', hash: null, admissibleDayIds: [], failReason: null, createdAt: ticketSeq });
      return delay({ id, status: 'STARTED' });
    },

    async uploadTicketImage(id, imageBase64, mimeType, masks) {
      const user = currentUser();
      const t = tickets.get(id);
      if (!t || t.userId !== user.id) throw new ApiError('NOT_FOUND', '인증을 찾을 수 없어요.');
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType) || !imageBase64) {
        throw new ApiError('IMAGE_INVALID', 'JPG, PNG, WEBP 이미지만 올릴 수 있어요.');
      }
      if (!masks.every(isValidMask)) throw new ApiError('IMAGE_INVALID', '가린 영역을 다시 확인해 주세요.');
      if (imageBase64.length * 0.75 > POLICY_DEFAULTS.TICKET_IMAGE_MAX_MB * 1024 * 1024) {
        throw new ApiError('IMAGE_TOO_LARGE', `이미지는 ${POLICY_DEFAULTS.TICKET_IMAGE_MAX_MB}MB까지 올릴 수 있어요.`);
      }
      // 데모에서는 이미지를 저장하지 않습니다.
      if (t.status === 'STARTED') t.status = 'UPLOADED';
      return delay({ id, status: t.status });
    },

    async confirmTicket(id, rawNumber, admissibleDayIds) {
      const user = currentUser();
      const t = tickets.get(id);
      if (!t || t.userId !== user.id) throw new ApiError('NOT_FOUND', '인증을 찾을 수 없어요.');
      if (t.status !== 'UPLOADED') throw new ApiError('TICKET_STATE', '먼저 캡처를 올려 주세요.');
      const { event } = visibleEvent(t.eventId);
      const number = normalizeReservationNumber(rawNumber);
      if (!number) throw new ApiError('TICKET_INVALID', '예매번호를 다시 확인해 주세요.', { field: 'reservationNumber' });
      const dayIds = event.days.length === 1 ? [event.days[0].id] : [...new Set(admissibleDayIds)];
      if (dayIds.length === 0 || !dayIds.every((d) => event.days.some((x) => x.id === d))) {
        throw new ApiError('TICKET_INVALID', '입장할 수 있는 날을 골라 주세요.', { field: 'admissibleDayIds' });
      }
      const today = isoOf(todayInSeoul(now()));
      const notPast = event.days.some((d) => dayIds.includes(d.id) && d.date >= today);
      const hash = `${t.eventId}:${number}`;
      const usedElsewhere = [...tickets.values()].some((x) => x.hash === hash && x.userId !== user.id && x.status === 'VERIFIED');
      t.hash = hash;
      t.admissibleDayIds = dayIds;
      if (!notPast) {
        t.status = 'FAILED';
        t.failReason = 'WRONG_EVENT';
      } else {
        // 데모에서는 무작위 점검 없이, 중복 의심일 때만 사람이 확인하는 것으로 둡니다.
        t.status = usedElsewhere ? 'REVIEW_PENDING' : 'VERIFIED';
      }
      return delay({
        status: t.status as 'VERIFIED' | 'REVIEW_PENDING' | 'FAILED',
        failReason: t.failReason,
        checks: { sameEvent: true, notPast, notUsedElsewhere: !usedElsewhere },
      });
    },

    async planAttendance(eventId) {
      const user = currentUser();
      const { event } = visibleEvent(eventId);
      if (event.ticketRequired) throw new ApiError('PLAN_NOT_ALLOWED', '티켓이 필요한 행사는 티켓 인증을 해 주세요.');
      plans.add(`${user.id}|${eventId}`);
      return this.getTicketStatus(eventId);
    },

    async sendProposal(eventId, input) {
      const user = currentUser();
      settle();
      if (input.receiverId === user.id) throw new ApiError('PROPOSAL_INVALID', '나에게는 제안할 수 없어요.');
      const grade = gradeOf(user.id, eventId);
      if (!grade) throw new ApiError('PROPOSAL_NEEDS_TICKET', '같은 행사 티켓 인증을 마친 뒤 제안할 수 있어요.');
      if (grade === 'PLANNED' && input.segmentIds.length > POLICY_DEFAULTS.PROPOSAL_PLANNED_MAX_SEGMENTS) {
        throw new ApiError('PROPOSAL_INVALID', `'참석 예정'일 때는 구간을 ${POLICY_DEFAULTS.PROPOSAL_PLANNED_MAX_SEGMENTS}개까지 제안할 수 있어요.`, {
          field: 'segmentIds',
        });
      }
      const mine = candidateFor(user.id, eventId, input.receiverId);
      if (!mine) throw new ApiError('NOT_FOUND', '후보를 찾을 수 없어요.');
      const ov = mine.overlaps.find((o) => o.eventDayId === input.eventDayId);
      if (!ov) throw new ApiError('PROPOSAL_INVALID', '함께할 수 있는 날을 골라 주세요.', { field: 'eventDayId' });
      const { event } = visibleEvent(eventId);
      const day = event.days.find((d) => d.id === input.eventDayId)!;
      const segs = [...new Set(input.segmentIds)];
      if (day.segments.length > 0 ? segs.length === 0 || !segs.every((x) => ov.segmentIds.includes(x)) : segs.length > 0) {
        throw new ApiError('PROPOSAL_INVALID', '둘 다 같이하기로 한 구간 중에서 골라 주세요.', { field: 'segmentIds' });
      }
      if (!event.meetingSpots.some((m) => m.id === input.meetingSpotId)) {
        throw new ApiError('PROPOSAL_INVALID', '공개된 만날 장소를 골라 주세요.', { field: 'meetingSpotId' });
      }
      const between = (p: { senderId: string; receiverId: string; eventId: string }) =>
        p.eventId === eventId &&
        ((p.senderId === user.id && p.receiverId === input.receiverId) || (p.senderId === input.receiverId && p.receiverId === user.id));
      const pending = proposals.find((p) => between(p) && p.status === 'SENT');
      if (pending) {
        throw new ApiError('PROPOSAL_EXISTS', pending.senderId === user.id ? '이미 보낸 제안이 있어요.' : '상대가 보낸 제안이 와 있어요. 받은 제안에서 답해 주세요.');
      }
      if (
        appointments.some(
          (a) => a.eventDayId === input.eventDayId && a.users.includes(user.id) && a.users.includes(input.receiverId) && a.status !== 'CANCELLED' && a.status !== 'AUTO_ENDED',
        )
      ) {
        throw new ApiError('PROPOSAL_EXISTS', '이 날 이미 약속이 있어요.');
      }
      const w = appointmentWindow(day, day.segments.filter((x) => segs.includes(x.id)));
      if (overlapFor(user.id, rangeOf(day.date, w.startTime, w.endTime))) {
        throw new ApiError('APPOINTMENT_OVERLAP', '그 시간에 이미 다른 약속이 있어요.');
      }
      const p = newProposal(user.id, input.receiverId, eventId, input.eventDayId, segs, input.meetingSpotId);
      return delay(proposalView(p, user.id));
    },

    async listProposals() {
      const user = currentUser();
      settle();
      return delay(
        proposals
          .filter((p) => p.senderId === user.id || p.receiverId === user.id)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((p) => proposalView(p, user.id)),
      );
    },

    async acceptProposal(id) {
      const user = currentUser();
      settle();
      const p = proposals.find((x) => x.id === id && x.receiverId === user.id);
      if (!p) throw new ApiError('NOT_FOUND', '제안을 찾을 수 없어요.');
      if (p.status !== 'SENT') throw new ApiError('PROPOSAL_STATE', p.status === 'EXPIRED' ? '답할 수 있는 시간이 지났어요.' : '이미 처리된 제안이에요.');
      if (!gradeOf(user.id, p.eventId)) throw new ApiError('PROPOSAL_NEEDS_TICKET', '같은 행사 티켓 인증을 마친 뒤 수락할 수 있어요.');
      const still = candidateFor(p.senderId, p.eventId, user.id);
      const ov = still?.overlaps.find((o) => o.eventDayId === p.eventDayId);
      if (!ov || !p.segmentIds.every((x) => ov.segmentIds.includes(x))) {
        throw new ApiError('PROPOSAL_INVALID', '그사이 일정이나 조건이 바뀌어 이 제안은 수락할 수 없어요.');
      }
      const { day } = dayAndSpot(p.eventId, p.eventDayId, p.meetingSpotId);
      const w = appointmentWindow(day, day.segments.filter((x) => p.segmentIds.includes(x.id)));
      const range = rangeOf(day.date, w.startTime, w.endTime);
      if (overlapFor(user.id, range)) throw new ApiError('APPOINTMENT_OVERLAP', '그 시간에 이미 다른 약속이 있어요.');
      if (overlapFor(p.senderId, range)) throw new ApiError('APPOINTMENT_OVERLAP', '상대에게 그 시간에 다른 약속이 생겨서 지금은 수락할 수 없어요.');
      return delay(appointmentView(acceptInternal(p), user.id));
    },

    async rejectProposal(id) {
      const user = currentUser();
      settle();
      const p = proposals.find((x) => x.id === id && x.receiverId === user.id);
      if (!p) throw new ApiError('NOT_FOUND', '제안을 찾을 수 없어요.');
      if (p.status !== 'SENT') throw new ApiError('PROPOSAL_STATE', '이미 처리된 제안이에요.');
      p.status = 'REJECTED';
      notify(p.senderId, 'PROPOSAL_REJECTED', { nickname: nicknameOf(user.id), eventName: eventName(p.eventId) }, { proposalId: p.id });
      return delay({ id, status: 'REJECTED' });
    },

    async cancelProposal(id) {
      const user = currentUser();
      settle();
      const p = proposals.find((x) => x.id === id && x.senderId === user.id);
      if (!p) throw new ApiError('NOT_FOUND', '제안을 찾을 수 없어요.');
      if (p.status !== 'SENT') throw new ApiError('PROPOSAL_STATE', '이미 처리된 제안이에요.');
      p.status = 'CANCELLED';
      return delay({ id, status: 'CANCELLED' });
    },

    async listAppointments() {
      const user = currentUser();
      settle();
      return delay(
        appointments
          .filter((a) => a.users.includes(user.id))
          .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
          .map((a) => appointmentView(a, user.id)),
      );
    },

    async getAppointment(id) {
      const { user, a } = myAppointment(id);
      return delay(appointmentView(a, user.id));
    },

    async confirmAppointment(id) {
      const { user, a } = myAppointment(id);
      const f = factsOf(a);
      if (a.status !== 'PENDING_CONFIRM') throw new ApiError('APPOINTMENT_STATE', '지금은 확인할 수 없는 약속이에요.');
      if (!appointmentActions(f, user.id, now(), { newScheduleAvailable: false }).confirm) {
        const t = factsTimes(f);
        throw new ApiError(
          'APPOINTMENT_NOT_NOW',
          a.parts[user.id].confirmedAt ? '이미 확인했어요.' : now() < t.opensAt ? `${formatSeoulShort(t.opensAt)}부터 확인할 수 있어요.` : '확인 마감이 지났어요.',
        );
      }
      confirmInternal(a, user.id);
      return delay(appointmentView(a, user.id));
    },

    async cancelAppointment(id, reason) {
      const { user, a } = myAppointment(id);
      if (!appointmentActions(factsOf(a), user.id, now(), { newScheduleAvailable: false }).cancel) {
        throw new ApiError('APPOINTMENT_STATE', '지금은 취소할 수 없는 약속이에요.');
      }
      setStatus(a, 'CANCELLED');
      a.endReason = 'CANCELLED';
      a.cancelledBy = user.id;
      a.cancelReason = reason ?? null;
      a.parts[user.id].lateCancel = now() >= freeCancelUntil(a.date, a.startTime, a.policy);
      const other = a.users.find((u) => u !== user.id)!;
      notify(other, 'APPOINTMENT_CANCELLED', { nickname: nicknameOf(user.id), eventName: eventName(a.eventId), reason: reason ? CANCEL_REASONS[reason] : null }, { appointmentId: a.id });
      return delay(appointmentView(a, user.id));
    },

    async arriveAppointment(id) {
      const { user, a } = myAppointment(id);
      if (!appointmentActions(factsOf(a), user.id, now(), { newScheduleAvailable: false }).arrive) {
        throw new ApiError('APPOINTMENT_NOT_NOW', '약속 시간이 가까워지면 누를 수 있어요.');
      }
      a.parts[user.id].arrivedAt = now();
      addMessage(a, null, 'SYSTEM', arrivedLine(nicknameOf(user.id)));
      notify(a.users.find((u) => u !== user.id)!, 'PARTNER_ARRIVED', { nickname: nicknameOf(user.id), spotName: a.meetingSpotName }, { appointmentId: a.id });
      return delay(appointmentView(a, user.id));
    },

    async reportNoShow(id) {
      const { user, a } = myAppointment(id);
      if (!appointmentActions(factsOf(a), user.id, now(), { newScheduleAvailable: false }).reportNoShow) {
        throw new ApiError('APPOINTMENT_NOT_NOW', "지금은 '안 나왔어요'를 누를 수 없어요.");
      }
      setStatus(a, 'ENDED_EARLY');
      a.endReason = 'NO_SHOW';
      a.parts[user.id].noShowReportedAt = now();
      notify(a.users.find((u) => u !== user.id)!, 'APPOINTMENT_ENDED_EARLY', { eventName: eventName(a.eventId) }, { appointmentId: a.id });
      return delay(appointmentView(a, user.id));
    },

    async getSafetySettings() {
      return delay({ ...currentUser().safety });
    },

    async updateSafetySettings(patch) {
      const user = currentUser();
      user.safety = { ...user.safety, ...patch };
      return delay({ ...user.safety });
    },

    async requestHelp(id) {
      const { user, a } = myAppointment(id);
      return delay(helpInternal(a, user));
    },

    async answerSafetyCheck(id, checkId, answer) {
      const { user, a } = myAppointment(id);
      const c = safetyChecks.find((x) => x.id === checkId && x.appointmentId === id && x.userId === user.id);
      if (!c) throw new ApiError('NOT_FOUND', '확인 요청을 찾을 수 없어요.');
      if (answer === 'HELP') return delay(helpInternal(a, user));
      if (!c.answeredAt) c.answeredAt = now();
      return delay(appointmentView(a, user.id));
    },

    async listShareLinks(appointmentId) {
      const user = currentUser();
      settle();
      return delay(
        shareLinks
          .filter((l) => l.creatorId === user.id && l.appointmentId === appointmentId && !l.revokedAt)
          .map(shareLinkView)
          .filter((x) => !x.expired)
          .map((x) => x.view),
      );
    },

    async createShareLink(appointmentId, showStatus) {
      const { user, a } = myAppointment(appointmentId);
      if (!['PENDING_CONFIRM', 'CONFIRMED', 'IN_PROGRESS'].includes(a.status)) {
        throw new ApiError('SHARE_NOT_ALLOWED', '이미 끝났거나 취소된 약속은 믿는 사람에게 알릴 수 없어요.');
      }
      const l = { id: `demo-link-${++safetySeq}`, appointmentId, creatorId: user.id, showStatus, revokedAt: null, alertKind: null, alertAt: null, createdAt: now() };
      shareLinks.push(l);
      return delay(shareLinkView(l).view);
    },

    async revokeShareLink(linkId) {
      const user = currentUser();
      const l = shareLinks.find((x) => x.id === linkId && x.creatorId === user.id && !x.revokedAt);
      if (!l) throw new ApiError('NOT_FOUND', '링크를 찾을 수 없어요.');
      l.revokedAt = now();
      return delay({ revoked: true as const });
    },

    async createParty(eventId) {
      const user = currentUser();
      visibleEvent(eventId);
      settle();
      if (parties.some((o) => o.eventId === eventId && o.status !== 'DISBANDED' && o.members.some((m) => m.active && m.userId === user.id))) {
        throw new ApiError('PARTY_EXISTS', '이 행사에는 이미 일행이 있어요. 먼저 일행에서 빠지거나 해체해 주세요.');
      }
      const p: DemoParty = {
        id: `demo-party-${++partySeq}`,
        eventId,
        leaderId: user.id,
        status: 'INVITING',
        inviteExpiresAt: partyInviteExpiresAt(now(), POLICY_DEFAULTS.PARTY_INVITE_EXPIRE_HOURS),
        members: [{ userId: user.id, joinedAt: now(), active: true, remindedAt: null }],
        sampleJoinAt: now().getTime() + autoAcceptDelayMs,
      };
      parties.push(p);
      return delay(partyView(p, user.id));
    },

    async getEventParty(eventId) {
      const user = currentUser();
      settle();
      const p = parties.find((o) => o.eventId === eventId && o.status !== 'DISBANDED' && o.members.some((m) => m.active && m.userId === user.id));
      return delay({ party: p ? partyView(p, user.id) : null });
    },

    async listParties() {
      const user = currentUser();
      settle();
      return delay(parties.filter((p) => p.status !== 'DISBANDED' && p.members.some((m) => m.active && m.userId === user.id)).map((p) => partyView(p, user.id)));
    },

    async getParty(id) {
      const { user, p } = myParty(id);
      return delay(partyView(p, user.id));
    },

    async leaveParty(id) {
      const { user, p } = myParty(id);
      const nick = nicknameOf(user.id);
      leaveParty(p, user.id);
      const rest = activeMembers(p);
      if (p.leaderId === user.id && rest.length > 0) p.leaderId = rest[0].userId;
      if (rest.length >= partySize.minSize) for (const m of rest) notify(m.userId, 'PARTY_MEMBER_LEFT', { nickname: nick, eventName: eventName(p.eventId) });
      settleParty(p, now().getTime());
      return delay({ left: true as const });
    },

    async disbandParty(id) {
      const { user, p } = myParty(id);
      if (p.leaderId !== user.id) throw new ApiError('FORBIDDEN', '대표만 일행을 풀 수 있어요.');
      for (const m of activeMembers(p).filter((x) => x.userId !== user.id)) notify(m.userId, 'PARTY_DISBANDED', { eventName: eventName(p.eventId) });
      p.status = 'DISBANDED';
      for (const m of p.members) m.active = false;
      return delay({ disbanded: true as const });
    },

    async proceedParty(id) {
      const { user, p } = myParty(id);
      if (p.leaderId !== user.id) throw new ApiError('FORBIDDEN', '대표만 진행할 수 있어요.');
      if (p.status !== 'CONFIRMING') throw new ApiError('PARTY_STATE', '지금은 진행할 수 없는 일행이에요.');
      const members = activeMembers(p);
      const notReady = members.filter((m) => !partyReady(m.userId, p.eventId));
      if (members.length - notReady.length < partySize.minSize) {
        throw new ApiError('PARTY_NOT_READY', `입력을 마친 사람이 ${partySize.minSize}명 이상이어야 진행할 수 있어요.`);
      }
      for (const m of notReady) {
        m.active = false;
        notify(m.userId, 'PARTY_REMOVED', { eventName: eventName(p.eventId) });
      }
      settleParty(p, now().getTime());
      return delay(partyView(p, user.id));
    },

    async getPartyCandidates(id, options) {
      const { p } = myParty(id);
      if (p.status !== 'ACTIVE') throw new ApiError('PARTY_NOT_READY', '일행 전원이 입력을 마쳐야 후보를 볼 수 있어요.');
      const c = partyContext(p);
      const result = matchPartyCandidates(`party:${p.id}`, c.members, c.others, c.days, POLICY, options);
      const cards = result.candidates.map(cardOf);
      return delay({
        total: cards.length,
        immersionRelaxed: result.immersionRelaxed,
        candidates: cards,
        widen:
          cards.length === 0
            ? expectedCounts(
                combineProfiles(`party:${p.id}`, c.members, c.days),
                c.others.filter((x) => !c.memberIds.includes(x.userId) && c.members.every((m) => passesMust(m, x))),
                c.days,
                POLICY,
                options,
              )
            : null,
      });
    },

    async getPartyCandidate(id, userId) {
      const { p } = myParty(id);
      if (p.status !== 'ACTIVE') throw new ApiError('PARTY_NOT_READY', '일행 전원이 입력을 마쳐야 후보를 볼 수 있어요.');
      const c = partyContext(p);
      const hit = matchPartyCandidates(`party:${p.id}`, c.members, c.others, c.days, POLICY, { shortTime: true, immersionPlus: true }).candidates.find(
        (x) => x.userId === userId,
      );
      if (!hit) throw new ApiError('NOT_FOUND', '후보를 찾을 수 없어요.');
      const sample = people.get(userId);
      return delay({ ...cardOf(hit), reasons: explainMatch(hit, c.days, PROMISE_SHORT_LABELS), publicFandoms: sample?.fandomPublic ? sample.fandoms : [] });
    },

    async previewPartyInvite(token) {
      const user = currentUser();
      settle();
      const p = partyByToken(token);
      if (activeMembers(p).some((m) => m.userId !== user.id && isBlockedBetween(user.id, m.userId))) {
        throw new ApiError('INVITE_UNAVAILABLE', '열 수 없는 초대예요. 보낸 분께 새 링크를 부탁해 보세요.');
      }
      const problem = joinProblem(user.id, p);
      const preview: PartyInvitePreview = {
        event: { id: p.eventId, name: eventName(p.eventId) },
        leaderNickname: nicknameOf(p.leaderId),
        memberCount: activeMembers(p).length,
        maxSize: partySize.maxSize,
        joinable: problem === null,
        problem,
      };
      return delay(preview);
    },

    async joinParty(token) {
      const user = currentUser();
      settle();
      const p = partyByToken(token);
      if (activeMembers(p).some((m) => m.userId !== user.id && isBlockedBetween(user.id, m.userId))) {
        throw new ApiError('INVITE_UNAVAILABLE', '열 수 없는 초대예요. 보낸 분께 새 링크를 부탁해 보세요.');
      }
      if (!activeMembers(p).some((m) => m.userId === user.id)) {
        const problem = joinProblem(user.id, p);
        if (problem) throw new ApiError('INVITE_UNAVAILABLE', problem);
        for (const m of activeMembers(p)) notify(m.userId, 'PARTY_JOINED', { nickname: nicknameOf(user.id), eventName: eventName(p.eventId) });
        p.members.push({ userId: user.id, joinedAt: now(), active: true, remindedAt: null });
        settleParty(p, now().getTime());
      }
      return delay(partyView(p, user.id));
    },

    async listNotifications() {
      const user = currentUser();
      settle();
      const mine = notifications.filter((n) => n.userId === user.id).reverse();
      return delay({ items: mine.slice(0, 50).map(({ userId: _u, ...n }) => n), unread: mine.filter((n) => !n.read).length });
    },

    async markNotificationsRead() {
      const user = currentUser();
      for (const n of notifications) if (n.userId === user.id) n.read = true;
      return delay({ unread: 0 });
    },

    async listChats() {
      const user = currentUser();
      settle();
      const list: Array<ChatSummary & { sortKey: number }> = appointments
        .filter((a) => a.users.includes(user.id))
        .map((a) => {
          const last = a.messages[a.messages.length - 1];
          return {
            appointmentId: a.id,
            counterpart: counterpartOf(a.users.find((u) => u !== user.id)!),
            event: { id: a.eventId, name: eventName(a.eventId) },
            date: a.date,
            open: isChatOpen(chatClosesAtOf(a), now()),
            unread: unreadOf(a, user.id),
            lastMessage: last ? { body: last.body, createdAt: last.createdAt.toISOString(), mine: last.senderId === user.id } : null,
            sortKey: last?.seq ?? 0,
          };
        });
      return delay(list.sort((x, y) => Number(y.open) - Number(x.open) || y.sortKey - x.sortKey).map(({ sortKey: _s, ...c }) => c));
    },

    async getChat(id, after) {
      const { user, a } = myAppointment(id);
      const messages = a.messages.filter((m) => after === undefined || m.seq > after);
      const last = a.messages[a.messages.length - 1];
      if (last) a.readSeq[user.id] = last.seq;
      const closesAt = chatClosesAtOf(a);
      const view: ChatView = {
        appointmentId: a.id,
        counterpart: counterpartOf(a.users.find((u) => u !== user.id)!),
        event: { id: a.eventId, name: eventName(a.eventId) },
        date: a.date,
        appointmentStatus: a.status,
        closesAt: closesAt?.toISOString() ?? null,
        open: isChatOpen(closesAt, now()),
        messages: messages.map((m) => messageView(m, user.id)),
      };
      return delay(view);
    },

    async sendChat(id, body, confirmContact) {
      const { user, a } = myAppointment(id);
      if (!isChatOpen(chatClosesAtOf(a), now())) throw new ApiError('CHAT_CLOSED', '채팅이 닫혀서 더 보낼 수 없어요.');
      const max = POLICY_DEFAULTS.CHAT_MESSAGE_MAX_LENGTH;
      const problem = checkChatBody(body, max);
      if (problem === 'EMPTY') throw new ApiError('CHAT_INVALID', '보낼 내용을 적어 주세요.');
      if (problem === 'TOO_LONG') throw new ApiError('CHAT_INVALID', `한 번에 ${max}자까지 보낼 수 있어요.`);
      const contact = detectContact(body);
      if (contact.detected && !confirmContact) {
        throw new ApiError('CONTACT_DETECTED', '번호나 SNS가 들어 있어요. 처음 만나기 전에는 연락처를 주고받지 않는 게 안전해요.', { kinds: contact.kinds });
      }
      const m = addMessage(a, user.id, 'TEXT', body.trim(), contact.detected);
      a.readSeq[user.id] = m.seq;
      if (a.users.some(isSample) && a.sampleReplyAt === null) a.sampleReplyAt = now().getTime() + autoAcceptDelayMs;
      return delay(messageView(m, user.id));
    },

    async submitReview(id, input) {
      const { user, a } = myAppointment(id);
      if (a.status !== 'ENDED') throw new ApiError('REVIEW_NOT_ALLOWED', '정상적으로 끝난 만남에만 후기를 남길 수 있어요.');
      const view = reviewStateOf(a, user.id, factsTimes(factsOf(a)).endsAt);
      if (view.done) throw new ApiError('REVIEW_EXISTS', '이미 후기를 남겼어요.');
      if (!view.canWrite) throw new ApiError('REVIEW_NOT_ALLOWED', `후기는 만남이 끝나고 ${POLICY_DEFAULTS.REVIEW_WINDOW_DAYS}일 안에 남길 수 있어요.`);
      const problem = checkReviewInput(input);
      if (problem) throw new ApiError('REVIEW_INVALID', REVIEW_PROBLEM_MESSAGES[problem]);
      const other = a.users.find((u) => u !== user.id)!;
      const again: ReviewAgain = input.overall === 'UNCOMFORTABLE' || input.hideTarget ? 'NO' : input.again;
      reviews.push({ appointmentId: a.id, authorId: user.id, targetId: other, overall: input.overall, again });
      // 서로 '또 같이 가고 싶어요'를 골랐을 때만 연결됩니다. 한쪽만 고르면 상대에게 아무것도 알려지지 않습니다.
      const theirs = reviews.find((r) => r.appointmentId === a.id && r.authorId === other);
      const mutual = again === 'YES' && theirs?.again === 'YES' && !isBlockedBetween(user.id, other);
      if (mutual) {
        a.chatExtended = true;
        addMessage(a, null, 'SYSTEM', CHAT_EXTENDED_LINE);
        notify(user.id, 'REVIEW_MUTUAL_AGAIN', { nickname: nicknameOf(other), eventName: eventName(a.eventId) }, { appointmentId: a.id });
      }
      if (input.hideTarget) blockInternal(user.id, other, 'REVIEW');
      return delay({ done: true as const, mutual });
    },

    async blockUser(userId) {
      const user = currentUser();
      if (userId === user.id) throw new ApiError('BLOCK_INVALID', '나 자신은 차단할 수 없어요.');
      if (!people.has(userId) && !users.some((u) => u.id === userId)) throw new ApiError('NOT_FOUND', '사용자를 찾을 수 없어요.');
      settle();
      blockInternal(user.id, userId, 'ME');
      return delay({ blocked: true as const });
    },

    async blockCounterpart(appointmentId) {
      const { user, a } = myAppointment(appointmentId);
      blockInternal(user.id, a.users.find((u) => u !== user.id)!, 'CHAT');
      return delay({ blocked: true as const });
    },

    async unblockUser(userId) {
      const user = currentUser();
      blockMap.delete(`${user.id}>${userId}`);
      return delay({ blocked: false as const });
    },

    async listBlocks() {
      const user = currentUser();
      const list: BlockView[] = [...blockMap.values()]
        .filter((b) => b.blockerId === user.id)
        .sort((x, y) => y.at.getTime() - x.at.getTime())
        .map((b) => {
          const c = counterpartOf(b.blockedId);
          const last = appointments
            .filter((a) => a.users.includes(user.id) && a.users.includes(b.blockedId))
            .sort((x, y) => y.createdAt - x.createdAt)[0];
          return {
            userId: b.blockedId,
            nickname: c.nickname,
            avatarInitial: c.avatarInitial,
            avatarColor: c.avatarColor,
            blockedAt: b.at.toISOString(),
            sourceLabel: BLOCK_SOURCE_LABELS[b.source],
            lastAppointmentId: last?.id ?? null,
          };
        });
      return delay(list);
    },

    async sendReport(input) {
      const { user, a } = myAppointment(input.appointmentId);
      if (!REPORT_CATEGORY_CODES.includes(input.category)) throw new ApiError('REPORT_INVALID', '어떤 일이었는지 골라 주세요.');
      const detail = input.detail?.trim() ?? '';
      if ([...detail].length > POLICY_DEFAULTS.REPORT_DETAIL_MAX_LENGTH) {
        throw new ApiError('REPORT_INVALID', `자세한 내용은 ${POLICY_DEFAULTS.REPORT_DETAIL_MAX_LENGTH}자까지 적을 수 있어요.`);
      }
      if (reports.some((r) => r.reporterId === user.id && r.appointmentId === a.id && r.open)) {
        throw new ApiError('REPORT_EXISTS', '이 약속은 이미 신고했어요. 운영팀이 확인하고 있어요.');
      }
      const id = `demo-report-${reports.length + 1}`;
      reports.push({ id, reporterId: user.id, appointmentId: a.id, category: input.category, open: true });
      if (input.alsoBlock) blockInternal(user.id, a.users.find((u) => u !== user.id)!, 'REPORT');
      return delay({ id, received: true as const, blocked: input.alsoBlock });
    },

    async getTrust() {
      const user = currentUser();
      settle();
      return delay(trustOf(user.id));
    },

    async getHomeSummary() {
      const user = currentUser();
      settle();
      return delay({
        unreadNotifications: notifications.filter((n) => n.userId === user.id && !n.read).length,
        hasVerifiedTicket: [...tickets.values()].some((t) => t.userId === user.id && t.status === 'VERIFIED'),
      });
    },
  };
}
