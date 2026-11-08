/**
 * 데모 모드용 가짜 서버 (GitHub Pages 웹 버전용)
 *
 * 실제 서버 없이 브라우저 메모리 안에서 동작합니다. 새로고침하면 처음으로 돌아갑니다.
 * 나이 판정·별명 규칙·약관·정책 값은 실제 서버와 같은 @meets/shared 코드를 씁니다.
 * 실제 서비스의 보안(권한 검사, DB 제약)은 apps/server에 있고, 여기는 화면 시연용입니다.
 */
import {
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
}

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
    const all = profiles(eventId);
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
      // 데모 전용: 예시 상대는 확인 요청이 열리면 몇 초 뒤 '갈 수 있어요'를 누릅니다.
      for (const u of a.users.filter(isSample)) {
        if (!appointmentActions(factsOf(a), u, now(), { newScheduleAvailable: false }).confirm) continue;
        if (a.sampleConfirmAt === null) a.sampleConfirmAt = t + autoAcceptDelayMs;
        else if (a.sampleConfirmAt <= t) confirmInternal(a, u);
      }
    }
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
        a.status = 'CANCELLED';
        a.endReason = 'NO_CONFIRM';
        for (const u of a.users) {
          const silent = step.noResponseUserIds.includes(u);
          a.parts[u].noResponse = silent;
          notify(u, silent ? 'NO_CONFIRM_SELF' : 'NO_CONFIRM_PARTNER', base, target);
        }
        return;
      case 'START':
        a.status = 'IN_PROGRESS';
        return;
      case 'END':
        a.status = 'ENDED';
        return;
      case 'HOLD':
        a.status = 'ON_HOLD';
        for (const u of a.users) notify(u, 'APPOINTMENT_ON_HOLD', base, target);
        return;
    }
  }

  function confirmInternal(a: DemoAppointment, userId: string) {
    a.parts[userId].confirmedAt = now();
    if (a.users.every((u) => a.parts[u].confirmedAt)) {
      a.status = 'CONFIRMED';
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
    };
    appointments.push(a);
    notify(p.senderId, 'PROPOSAL_ACCEPTED', { nickname: nicknameOf(p.receiverId), eventName: eventName(p.eventId) }, { appointmentId: a.id });
    return a;
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
      needsAction: actions.confirm || actions.reconfirm || actions.arrive || actions.reportNoShow,
    };
  }

  /** 내 약속 하나 (약속에 없는 사람에게는 '찾을 수 없어요') */
  function myAppointment(id: string) {
    const user = currentUser();
    settle();
    const a = appointments.find((x) => x.id === id && x.users.includes(user.id));
    if (!a) throw new ApiError('NOT_FOUND', '약속을 찾을 수 없어요.');
    return { user, a };
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
      if (!user.signupDone) seedTomorrowAppointment(user.id);
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
      a.status = 'CANCELLED';
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
      notify(a.users.find((u) => u !== user.id)!, 'PARTNER_ARRIVED', { nickname: nicknameOf(user.id), spotName: a.meetingSpotName }, { appointmentId: a.id });
      return delay(appointmentView(a, user.id));
    },

    async reportNoShow(id) {
      const { user, a } = myAppointment(id);
      if (!appointmentActions(factsOf(a), user.id, now(), { newScheduleAvailable: false }).reportNoShow) {
        throw new ApiError('APPOINTMENT_NOT_NOW', "지금은 '안 나왔어요'를 누를 수 없어요.");
      }
      a.status = 'ENDED_EARLY';
      a.endReason = 'NO_SHOW';
      a.parts[user.id].noShowReportedAt = now();
      notify(a.users.find((u) => u !== user.id)!, 'APPOINTMENT_ENDED_EARLY', { eventName: eventName(a.eventId) }, { appointmentId: a.id });
      return delay(appointmentView(a, user.id));
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
