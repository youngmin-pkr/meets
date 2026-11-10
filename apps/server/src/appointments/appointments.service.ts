import { Inject, Injectable } from '@nestjs/common';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  groupName,
  noShowOutcome,
  otherSide,
  outcomeOfLeaving,
  type AppointmentCompanion,
  type AppointmentSide,
  type RescheduleReason,
  arrivedLine,
  canRequestHelp,
  type HelpResult,
  APPOINTMENT_POLICY_KEYS,
  appointmentActions,
  appointmentPolicyFrom,
  appointmentWindow,
  AVATAR_COLORS,
  CANCEL_REASONS,
  dueAppointmentSteps,
  factsTimes,
  formatSeoulShort,
  freeCancelUntil,
  rangeOf,
  rangesOverlap,
  rescheduleDeadline,
  reviewDeadline,
  seoulDateTime,
  type AppointmentEndReason,
  type AppointmentFacts,
  type AppointmentPolicy,
  type AppointmentStatus,
  type AppointmentStep,
  type AppointmentView,
  type CancelReason,
  type Counterpart,
  type TimeRange,
} from '@meets/shared';
import { chatSystemLine, unreadCounts } from '../chat/chat-unread';
import { orderedOthers } from '../common/participants';
import { AppError } from '../common/app-error';
import { CLOCK, type Clock } from '../common/clock';
import type { Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PolicyService } from '../policy/policy.service';
import { ReportStateService } from '../reports/report-state.service';
import { SafetyChecksService } from '../safety/safety-checks.service';
import { TrustService } from '../trust/trust.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStateService } from './appointment-state.service';

const userPublic = { select: { id: true, nickname: true, avatarInitial: true, avatarColor: true } } as const;

const include = {
  participants: { include: { user: userPublic } },
  event: { select: { id: true, name: true } },
  eventDay: { include: { segments: { orderBy: { sortOrder: 'asc' } } } },
  reviews: { select: { authorId: true, targetId: true } },
  safetyChecks: { select: { id: true, userId: true, seq: true, askedAt: true, answeredAt: true } },
} satisfies Prisma.AppointmentInclude;

type Row = Prisma.AppointmentGetPayload<{ include: typeof include }>;
type Segment = { id: string; label: string; startTime: string; endTime: string };

/** 약속한 날짜·시간·구간 */
export interface Schedule {
  date: string;
  startTime: string;
  endTime: string;
  segments: Segment[];
}

/** 진행 중인 약속 (시간 규칙을 적용할 대상) */
const OPEN: AppointmentStatus[] = ['PENDING_CONFIRM', 'CONFIRMED', 'IN_PROGRESS', 'RESCHEDULING'];
/** 행사 일정이 바뀌면 다시 정해야 하는 약속 */
const RESCHEDULABLE: AppointmentStatus[] = ['PENDING_CONFIRM', 'CONFIRMED', 'RESCHEDULING'];
/** 행사가 취소되면 자동 종료되는 약속 */
const ENDABLE: AppointmentStatus[] = ['PENDING_CONFIRM', 'CONFIRMED', 'IN_PROGRESS', 'RESCHEDULING', 'ON_HOLD'];

/**
 * 약속한 구간을 (바뀐) 행사 날에서 다시 찾습니다. 구간은 이름으로 찾습니다.
 * 날이 없어졌거나 약속한 구간이 하나라도 없어졌으면 null
 */
export function scheduleOnDay(
  snap: { segments: Segment[] },
  day: { date: string; startTime: string; endTime: string; segments: Array<{ id: string; label: string; startTime: string; endTime: string }> } | null | undefined,
): Schedule | null {
  if (!day) return null;
  const used = new Set<string>();
  const found: Segment[] = [];
  for (const s of snap.segments) {
    const match = day.segments.find((x) => x.label === s.label && !used.has(x.id));
    if (!match) return null;
    used.add(match.id);
    found.push({ id: match.id, label: match.label, startTime: match.startTime, endTime: match.endTime });
  }
  return { date: day.date, ...appointmentWindow(day, found), segments: found };
}

export function sameSchedule(a: Schedule, b: Schedule | null): boolean {
  if (!b) return false;
  const key = (s: Schedule) => JSON.stringify([s.date, s.startTime, s.endTime, s.segments.map((x) => [x.label, x.startTime, x.endTime])]);
  return key(a) === key(b);
}

function counterpart(u: { id: string; nickname: string | null; avatarInitial: string | null; avatarColor: string | null }): Counterpart {
  return {
    userId: u.id,
    nickname: u.nickname ?? '',
    avatarInitial: u.avatarInitial ?? '',
    avatarColor: AVATAR_COLORS[(u.avatarColor ?? 'ink') as keyof typeof AVATAR_COLORS] ?? AVATAR_COLORS.ink,
  };
}

const snapshotOf = (a: Row): Schedule => ({
  date: a.date,
  startTime: a.startTime,
  endTime: a.endTime,
  segments: a.segmentsSnapshot as unknown as Segment[],
});

/** 약속에서 아직 빠지지 않은 사람들 */
const liveOf = (a: Row) => a.participants.filter((p) => !p.leftAt);
const sideOf = (p: { side: string }) => (p.side === 'B' ? 'B' : 'A') as AppointmentSide;
const peopleOf = (a: Row) => liveOf(a).map((p) => ({ userId: p.userId, side: sideOf(p), confirmedAt: p.dayBeforeConfirmedAt }));

function factsOf(a: Row): AppointmentFacts {
  return {
    status: a.status as AppointmentStatus,
    date: a.date,
    startTime: a.startTime,
    endTime: a.endTime,
    policy: a.policy as unknown as AppointmentPolicy,
    rescheduleDeadline: a.rescheduleDeadline,
    participants: liveOf(a).map((p) => ({
      userId: p.userId,
      side: sideOf(p),
      noShowReportedAt: p.noShowReportedAt,
      confirmedAt: p.dayBeforeConfirmedAt,
      rescheduleConfirmedAt: p.rescheduleConfirmedAt,
      arrivedAt: p.arrivedAt,
      dayBeforeNotifiedAt: p.dayBeforeNotifiedAt,
      reminderNotifiedAt: p.reminderNotifiedAt,
      soonNotifiedAt: p.soonNotifiedAt,
    })),
  };
}

/** 후기: 정상적으로 끝난 만남만, 끝나고 N일 동안, 한 번만 */
function reviewState(a: Row, me: string, now: Date, reviewDays: number, endsAt: Date) {
  const deadline = reviewDeadline(endsAt, reviewDays);
  const mine = a.participants.find((p) => p.userId === me);
  // 후기는 함께한 사람마다 따로 남깁니다. 같은 쪽(일행)끼리는 남기지 않고, 중간에 빠진 사람과는 남기지 않습니다.
  const targets = mine && !mine.leftAt ? liveOf(a).filter((p) => p.userId !== me && sideOf(p) !== sideOf(mine)) : [];
  const pending = targets.filter((t) => !a.reviews.some((r) => r.authorId === me && r.targetId === t.userId));
  const done = targets.length > 0 && pending.length === 0;
  return {
    canWrite: a.status === 'ENDED' && pending.length > 0 && now < deadline,
    done,
    deadline: deadline.toISOString(),
    targets: a.status === 'ENDED' && now < deadline ? pending.map((t) => counterpart(t.user)) : [],
  };
}

/**
 * 약속: 전날 확인, 취소, 도착·노쇼, 행사 변경·취소에 따른 변경 (정리문서 5장 "약속")
 * 시간이 되면 저절로 일어나는 일(확인 요청, 마감, 시작·끝, 보류)은 settle()에서 처리합니다.
 * settle()은 1분마다(main.ts) 그리고 사용자가 약속을 볼 때마다 먼저 불립니다.
 */
@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly state: AppointmentStateService,
    private readonly notifications: NotificationsService,
    private readonly trust: TrustService,
    private readonly reports: ReportStateService,
    private readonly safetyChecks: SafetyChecksService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** 약속을 만들 때 저장해 둘 정책 값 */
  async policySnapshot(): Promise<AppointmentPolicy> {
    return appointmentPolicyFrom(await this.policy.getNumbers([...APPOINTMENT_POLICY_KEYS]));
  }

  /** 제안이 수락되면 약속을 만듭니다. (ProposalsService가 같은 트랜잭션 안에서 부름) */
  async createFromProposal(
    tx: Prisma.TransactionClient,
    p: { id: string; eventId: string; eventDayId: string; meetingSpotId: string; senderId: string; receiverId: string },
    schedule: Schedule,
    meetingSpotName: string,
    /** 일행으로 제안한 경우 함께하는 사람 전원(제안을 보낸 쪽 A, 받은 쪽 B). 없으면 보낸 사람과 받은 사람 둘 */
    people?: Array<{ userId: string; side: AppointmentSide }>,
    /** 즉석 동행이면 수락하는 순간 확정합니다. 전날 확인은 없고, 취소 기한은 freeCancelAt까지입니다. */
    instant?: { freeCancelAt: Date },
  ) {
    const now = this.clock.now();
    const policy = { ...(await this.policySnapshot()) };
    const created = await this.state.create(tx, {
      proposalId: p.id,
      eventId: p.eventId,
      eventDayId: p.eventDayId,
      segmentIds: schedule.segments.map((s) => s.id),
      meetingSpotId: p.meetingSpotId,
      date: schedule.date,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      segmentsSnapshot: schedule.segments,
      meetingSpotName,
      policy: instant ? { ...policy, soonMinutes: 0, freeCancelAt: instant.freeCancelAt.toISOString() } : policy,
      instant: !!instant,
      participants: {
        create: (people ?? [
          { userId: p.senderId, side: 'A' as const },
          { userId: p.receiverId, side: 'B' as const },
        ]).map((x) => ({ ...x, ...(instant ? { dayBeforeConfirmedAt: now } : {}) })),
      },
    });
    if (instant) {
      await this.state.transition(tx, created.id, 'PENDING_CONFIRM', 'CONFIRMED', { confirmedAt: now });
      return { ...created, status: 'CONFIRMED' as const };
    }
    return created;
  }

  /** 이 사람의 진행 중인 약속 중 시간이 겹치는 것 */
  async findOverlap(userId: string, range: TimeRange, excludeId?: string) {
    const rows = await this.prisma.appointment.findMany({
      where: {
        status: { in: ACTIVE_APPOINTMENT_STATUSES },
        participants: { some: { userId, leftAt: null } },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, date: true, startTime: true, endTime: true },
    });
    return rows.find((r) => rangesOverlap(rangeOf(r.date, r.startTime, r.endTime), range)) ?? null;
  }

  // ───────────── 시간이 되면 저절로 일어나는 일 ─────────────

  async settle(where: Prisma.AppointmentWhereInput = {}) {
    const now = this.clock.now();
    const rows = await this.prisma.appointment.findMany({ where: { ...where, status: { in: OPEN } }, include });
    for (const a of rows) {
      // 순서대로 처리합니다. (예: 시작 → 끝)
      for (const step of dueAppointmentSteps(factsOf(a), now)) {
        try {
          await this.applyStep(a, step);
        } catch (error) {
          // 그사이 사용자가 먼저 바꿨으면(취소 등) 다음 기회에 다시 봅니다.
          if (error instanceof AppError) break;
          throw error;
        }
      }
    }
    // 만남 중인 약속은 안전 확인도 챙깁니다. (정해진 시각에 묻고, 답이 없으면 다시 묻고, 믿는 사람에게 알림)
    await this.safetyChecks.run(rows.map((r) => r.id));
  }

  settleForUser(userId: string) {
    return this.settle({ participants: { some: { userId } } });
  }

  private async applyStep(a: Row, step: AppointmentStep) {
    const now = this.clock.now();
    const t = factsTimes(factsOf(a));
    const base = { eventName: a.event.name, when: formatSeoulShort(t.startsAt), spotName: a.meetingSpotName };
    const target = { appointmentId: a.id };
    const once = async (
      userIds: string[],
      field: 'dayBeforeNotifiedAt' | 'reminderNotifiedAt' | 'soonNotifiedAt',
      kind: 'DAY_BEFORE_CONFIRM' | 'DAY_BEFORE_REMINDER' | 'APPOINTMENT_SOON',
    ) => {
      for (const userId of userIds) {
        await this.prisma.$transaction(async (tx) => {
          // 같은 알림은 한 번만 (동시에 두 번 처리되어도 한 번만 기록됨)
          const marked = await tx.appointmentParticipant.updateMany({
            where: { appointmentId: a.id, userId, [field]: null },
            data: { [field]: now },
          });
          if (marked.count === 1) {
            await this.notifications.notify(tx, userId, kind, { ...base, deadline: formatSeoulShort(t.deadline) }, target);
          }
        });
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
        return this.prisma.$transaction(async (tx) => {
          await this.state.transition(tx, a.id, 'PENDING_CONFIRM', 'CANCELLED', { endReason: 'NO_CONFIRM' satisfies AppointmentEndReason });
          await tx.appointmentParticipant.updateMany({
            where: { appointmentId: a.id, userId: { in: step.noResponseUserIds } },
            data: { noResponse: true },
          });
          for (const p of liveOf(a)) {
            const silent = step.noResponseUserIds.includes(p.userId);
            await this.notifications.notify(tx, p.userId, silent ? 'NO_CONFIRM_SELF' : 'NO_CONFIRM_PARTNER', base, target);
          }
        }).then(async () => {
          // 무응답은 신뢰 단계에 반영됩니다. (정책 값 12)
          for (const userId of step.noResponseUserIds) await this.trust.recompute(userId);
        });
      case 'DROP_NO_CONFIRM':
        // 확인하지 않은 사람만 빠지고, 확인한 사람들끼리 확정됩니다. (양쪽에 한 명 이상 남을 때, 정리문서 2장 일행)
        return this.prisma.$transaction(async (tx) => {
          const dropped = liveOf(a).filter((p) => step.noResponseUserIds.includes(p.userId));
          const rest = liveOf(a).filter((p) => !step.noResponseUserIds.includes(p.userId));
          await tx.appointmentParticipant.updateMany({
            where: { appointmentId: a.id, userId: { in: step.noResponseUserIds }, leftAt: null },
            data: { leftAt: now, leftReason: 'NO_CONFIRM', noResponse: true },
          });
          await this.state.transition(tx, a.id, 'PENDING_CONFIRM', 'CONFIRMED', { confirmedAt: now });
          const names = groupName(dropped.map((p) => p.user.nickname ?? ''));
          for (const p of dropped) await this.notifications.notify(tx, p.userId, 'NO_CONFIRM_SELF', { ...base, dropped: true }, target);
          for (const p of rest) await this.notifications.notify(tx, p.userId, 'APPOINTMENT_MEMBER_LEFT', { nickname: names, eventName: a.event.name }, target);
        }).then(async () => {
          for (const userId of step.noResponseUserIds) await this.trust.recompute(userId);
        });
      case 'START':
        return this.prisma.$transaction((tx) => this.state.transition(tx, a.id, 'CONFIRMED', 'IN_PROGRESS'));
      case 'END': {
        // 만남이 정상적으로 끝나면 양쪽에 후기 요청을 보냅니다. (행사 취소·중간 종료는 보내지 않음)
        const days = await this.policy.getNumber('REVIEW_WINDOW_DAYS');
        const deadline = formatSeoulShort(reviewDeadline(t.endsAt, days));
        return this.prisma.$transaction(async (tx) => {
          await this.state.transition(tx, a.id, 'IN_PROGRESS', 'ENDED');
          for (const p of liveOf(a)) {
            const others = orderedOthers(a.participants, p.userId).filter((x) => sideOf(x) !== sideOf(p));
            await this.notifications.notify(tx, p.userId, 'REVIEW_REQUEST', { nickname: groupName(others.map((x) => x.user.nickname ?? '')), eventName: a.event.name, deadline }, target);
          }
        });
      }
      case 'HOLD':
        return this.prisma.$transaction(async (tx) => {
          await this.state.transition(tx, a.id, 'RESCHEDULING', 'ON_HOLD');
          for (const p of liveOf(a)) await this.notifications.notify(tx, p.userId, 'APPOINTMENT_ON_HOLD', base, target);
        });
    }
  }

  // ───────────── 조회 ─────────────

  private toView(a: Row, me: string, now: Date, reviewDays: number, unreadMessages = 0): AppointmentView {
    const f = factsOf(a);
    const t = factsTimes(f);
    const mine = a.participants.find((p) => p.userId === me)!;
    const others = orderedOthers(a.participants, me);
    // 약속에서 이미 빠진 사람에게는 끝난 약속으로 보입니다.
    const left = !!mine.leftAt;
    const snap = snapshotOf(a);
    const ns = a.status === 'RESCHEDULING' && !left ? scheduleOnDay(snap, a.eventDay) : null;
    const actions = left
      ? { confirm: false, reconfirm: false, cancel: false, arrive: false, reportNoShow: false }
      : appointmentActions(f, me, now, { newScheduleAvailable: !!ns });
    // 도움 요청으로 끝난 약속은 화면에서 이유를 드러내지 않고 '취소'로만 보입니다.
    const stored = left ? (mine.leftReason === 'NO_CONFIRM' ? 'NO_CONFIRM' : 'CANCELLED') : a.endReason === 'SAFETY' ? 'CANCELLED' : a.endReason;
    const reason = stored as AppointmentEndReason | null;
    const status: AppointmentStatus = left ? (mine.leftAt! >= t.startsAt ? 'ENDED_EARLY' : 'CANCELLED') : (a.status as AppointmentStatus);
    const pendingCheck = !left && a.status === 'IN_PROGRESS' ? a.safetyChecks.filter((c) => c.userId === me && !c.answeredAt).sort((x, y) => y.seq - x.seq)[0] : undefined;
    const byMe = left
      ? true
      : reason === 'CANCELLED'
        ? a.cancelledById === me
        : reason === 'NO_CONFIRM'
          ? mine.noResponse
          : reason === 'NO_SHOW'
            ? !!mine.noShowReportedAt
            : false;
    const companions: AppointmentCompanion[] = others.map((p) => ({
      ...counterpart(p.user),
      sameSide: sideOf(p) === sideOf(mine),
      confirmed: !!p.dayBeforeConfirmedAt,
      arrivedAt: p.arrivedAt?.toISOString() ?? null,
    }));
    // 도착은 '다른 사람 중 가장 먼저 도착한 시각'으로 보여 줍니다. (1:1이면 상대의 도착)
    const firstArrival = others.map((p) => p.arrivedAt).filter((x): x is Date => !!x).sort((x, y) => x.getTime() - y.getTime())[0];
    return {
      id: a.id,
      status,
      instant: a.instant,
      counterpart: counterpart((others[0] ?? orderedOthers(a.participants, me, { includeLeft: true })[0]).user),
      companions,
      event: { id: a.event.id, name: a.event.name },
      day: { id: a.eventDayId, date: a.date, startTime: a.startTime },
      segments: snap.segments,
      meetingSpot: { id: a.meetingSpotId, name: a.meetingSpotName },
      createdAt: a.createdAt.toISOString(),
      startsAt: t.startsAt.toISOString(),
      endsAt: t.endsAt.toISOString(),
      confirm: {
        opensAt: t.opensAt.toISOString(),
        deadline: t.deadline.toISOString(),
        mine: !!mine.dayBeforeConfirmedAt,
        theirs: others.length > 0 && others.every((p) => !!p.dayBeforeConfirmedAt),
      },
      arrival: { mine: mine.arrivedAt?.toISOString() ?? null, theirs: firstArrival?.toISOString() ?? null },
      freeCancelUntil: freeCancelUntil(a.date, a.startTime, f.policy).toISOString(),
      reschedule:
        !left && (a.status === 'RESCHEDULING' || a.status === 'ON_HOLD') && a.rescheduleDeadline
          ? {
              deadline: a.rescheduleDeadline.toISOString(),
              mine: !!mine.rescheduleConfirmedAt,
              theirs: others.length > 0 && others.every((p) => !!p.rescheduleConfirmedAt),
              newSchedule: ns && { date: ns.date, startTime: ns.startTime, endTime: ns.endTime },
              reason: (a.rescheduleReason === 'MEMBERS_CHANGED' ? 'MEMBERS_CHANGED' : 'EVENT_CHANGED') as RescheduleReason,
            }
          : null,
      end: reason
        ? {
            reason,
            byMe,
            cancelReason: a.cancelReason ? (CANCEL_REASONS[a.cancelReason as CancelReason] ?? null) : null,
            late: reason === 'CANCELLED' && (left || a.cancelledById === me) && mine.lateCancel === true,
          }
        : null,
      actions,
      needsAction: actions.confirm || actions.reconfirm || actions.arrive || actions.reportNoShow || !!pendingCheck,
      unreadMessages,
      review: left ? { canWrite: false, done: false, deadline: reviewDeadline(t.endsAt, reviewDays).toISOString(), targets: [] } : reviewState(a, me, now, reviewDays, t.endsAt),
      safety: {
        canRequestHelp: !left && canRequestHelp(a.status as AppointmentStatus, now, { startsAt: t.startsAt, endsAt: t.endsAt }, f.policy.arrivalOpenMinutes),
        pendingCheck: pendingCheck
          ? { id: pendingCheck.id, askedAt: pendingCheck.askedAt.toISOString(), minutesSinceStart: Math.max(0, Math.floor((now.getTime() - t.startsAt.getTime()) / 60000)) }
          : null,
      },
    };
  }

  async list(userId: string): Promise<AppointmentView[]> {
    await this.settleForUser(userId);
    const rows = await this.prisma.appointment.findMany({
      where: { participants: { some: { userId } } },
      include,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 100,
    });
    const now = this.clock.now();
    const reviewDays = await this.policy.getNumber('REVIEW_WINDOW_DAYS');
    const unread = await unreadCounts(this.prisma, userId, rows.map((a) => a.id));
    return rows.map((a) => this.toView(a, userId, now, reviewDays, unread.get(a.id)));
  }

  /** 내 약속 하나. 약속에 없는 사람에게는 '찾을 수 없어요' (CLAUDE.md 규칙 3) */
  private async load(userId: string, id: string): Promise<Row> {
    const a = await this.prisma.appointment.findFirst({ where: { id, participants: { some: { userId } } }, include });
    if (!a) throw new AppError('NOT_FOUND', '약속을 찾을 수 없어요.');
    return a;
  }

  async get(userId: string, id: string): Promise<AppointmentView> {
    await this.settle({ id, participants: { some: { userId } } });
    const unread = await unreadCounts(this.prisma, userId, [id]);
    const reviewDays = await this.policy.getNumber('REVIEW_WINDOW_DAYS');
    return this.toView(await this.load(userId, id), userId, this.clock.now(), reviewDays, unread.get(id));
  }

  /** 같은 약속을 동시에 바꾸지 않도록 줄을 세웁니다. (둘이 동시에 '갈 수 있어요'를 눌러도 한 번만 확정) */
  private lock(tx: Prisma.TransactionClient, id: string) {
    return tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE "id" = ${id} FOR UPDATE`;
  }

  private nickname(a: Row, userId: string) {
    return a.participants.find((p) => p.userId === userId)?.user.nickname ?? '';
  }

  // ───────────── 사용자가 하는 일 ─────────────

  /** '갈 수 있어요' (전날 확인), 또는 행사 일정이 바뀐 뒤 '바뀐 일정으로 갈게요' */
  async confirm(userId: string, id: string): Promise<AppointmentView> {
    await this.settle({ id });
    const a = await this.load(userId, id);
    const now = this.clock.now();
    const f = factsOf(a);
    const others = liveOf(a).filter((p) => p.userId !== userId);
    const target = { appointmentId: a.id };

    if (a.status === 'PENDING_CONFIRM') {
      const t = factsTimes(f);
      if (!appointmentActions(f, userId, now, { newScheduleAvailable: false }).confirm) {
        const mine = a.participants.find((p) => p.userId === userId)!;
        throw new AppError(
          'APPOINTMENT_NOT_NOW',
          mine.dayBeforeConfirmedAt
            ? '이미 확인했어요.'
            : now < t.opensAt
              ? `${formatSeoulShort(t.opensAt)}부터 확인할 수 있어요.`
              : '확인 마감이 지났어요.',
        );
      }
      await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, a.id);
        await tx.appointmentParticipant.updateMany({
          where: { appointmentId: a.id, userId, leftAt: null, dayBeforeConfirmedAt: null },
          data: { dayBeforeConfirmedAt: now },
        });
        const confirmed = await tx.appointmentParticipant.count({ where: { appointmentId: a.id, leftAt: null, dayBeforeConfirmedAt: { not: null } } });
        if (confirmed === liveOf(a).length) {
          await this.state.transition(tx, a.id, 'PENDING_CONFIRM', 'CONFIRMED', { confirmedAt: now });
          for (const o of others) {
            await this.notifications.notify(
              tx,
              o.userId,
              'APPOINTMENT_CONFIRMED',
              { nickname: this.nickname(a, userId), when: formatSeoulShort(t.startsAt), spotName: a.meetingSpotName },
              target,
            );
          }
        }
      });
      return this.get(userId, id);
    }

    if (a.status === 'RESCHEDULING') {
      const ns = scheduleOnDay(snapshotOf(a), a.eventDay);
      if (!appointmentActions(f, userId, now, { newScheduleAvailable: !!ns }).reconfirm || !ns) {
        const mine = a.participants.find((p) => p.userId === userId)!;
        throw new AppError(
          'APPOINTMENT_NOT_NOW',
          !ns
            ? '약속한 날이나 구간이 행사에서 없어져서 다시 정할 수 없어요. 기한이 지나면 보류돼요.'
            : mine.rescheduleConfirmedAt
              ? '이미 확인했어요.'
              : '다시 정하기 기한이 지났어요.',
        );
      }
      const range = rangeOf(ns.date, ns.startTime, ns.endTime);
      if (await this.findOverlap(userId, range, a.id)) {
        throw new AppError('APPOINTMENT_OVERLAP', '바뀐 시간에 이미 다른 약속이 있어요.');
      }
      await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, a.id);
        await tx.appointmentParticipant.updateMany({
          where: { appointmentId: a.id, userId, leftAt: null, rescheduleConfirmedAt: null },
          data: { rescheduleConfirmedAt: now },
        });
        const confirmed = await tx.appointmentParticipant.count({ where: { appointmentId: a.id, leftAt: null, rescheduleConfirmedAt: { not: null } } });
        if (confirmed === liveOf(a).length) {
          // 모두 확인하면 바뀐 일정으로 확정
          await this.state.transition(tx, a.id, 'RESCHEDULING', 'CONFIRMED', {
            date: ns.date,
            startTime: ns.startTime,
            endTime: ns.endTime,
            segmentIds: ns.segments.map((s) => s.id),
            segmentsSnapshot: ns.segments,
            confirmedAt: now,
            rescheduleDeadline: null,
          });
          await tx.appointmentParticipant.updateMany({ where: { appointmentId: a.id }, data: { soonNotifiedAt: null } });
          for (const o of others) {
            await this.notifications.notify(
              tx,
              o.userId,
              'APPOINTMENT_CONFIRMED',
              { nickname: this.nickname(a, userId), when: formatSeoulShort(seoulDateTime(ns.date, ns.startTime)), spotName: a.meetingSpotName },
              target,
            );
          }
        }
      });
      return this.get(userId, id);
    }

    throw new AppError('APPOINTMENT_STATE', '지금은 확인할 수 없는 약속이에요.', { status: a.status });
  }

  /**
   * 약속에서 한 사람이 빠집니다. (취소·도움 요청·차단·이용 정지에서 함께 씀, 같은 트랜잭션 안)
   * - 빠지는 사람의 쪽에 아무도 남지 않으면 약속이 끝납니다. (취소, 만남 중이면 중간 종료)
   * - 아니면 남은 사람끼리 계속하고, 확정된 약속이면 상대 쪽이 다시 확인합니다. (다시 정하기, 사유 '인원 변경')
   * 돌려주는 값: 약속이 통째로 끝났는지
   */
  private async leaveInternal(
    tx: Prisma.TransactionClient,
    a: Row,
    userId: string,
    why: { reason: 'CANCEL' | 'SAFETY' | 'BLOCK' | 'SUSPENDED'; cancelReason?: CancelReason | null; late?: boolean; notifyEnded: (others: Row['participants']) => Promise<void> },
  ): Promise<{ ended: boolean }> {
    const now = this.clock.now();
    const status = a.status as AppointmentStatus;
    const outcome = outcomeOfLeaving(status, peopleOf(a), userId);
    const others = liveOf(a).filter((p) => p.userId !== userId);
    // 약속이 통째로 끝나면 모두가 그대로 참여자로 남고(끝난 약속으로 보임), 계속되면 이 사람만 '빠진 사람'이 됩니다.
    const marked = await tx.appointmentParticipant.updateMany({
      where: { appointmentId: a.id, userId, leftAt: null },
      data: { cancelledAt: now, lateCancel: why.late ?? false, ...(outcome.kind === 'CONTINUE' ? { leftAt: now, leftReason: why.reason } : {}) },
    });
    if (marked.count !== 1) throw new AppError('APPOINTMENT_STATE', '약속 상태가 그사이 바뀌었어요. 새로고침해 주세요.');

    if (outcome.kind === 'CANCEL_ALL') {
      const to: AppointmentStatus = status === 'IN_PROGRESS' || why.reason === 'SAFETY' ? 'ENDED_EARLY' : 'CANCELLED';
      await this.state.transition(tx, a.id, status, to, {
        endReason: (why.reason === 'SAFETY' ? 'SAFETY' : 'CANCELLED') as string,
        cancelledById: userId,
        cancelReason: why.cancelReason ?? null,
      });
      await why.notifyEnded(others);
      return { ended: true };
    }

    const names = groupName([a.participants.find((p) => p.userId === userId)?.user.nickname ?? '']);
    let deadlineText: string | undefined;
    if (outcome.reconfirmSide) {
      // 확정된 약속에서 한 명이 빠지면 상대 쪽이 다시 확인합니다. 같은 쪽 사람들은 이미 아는 일이라 확인한 것으로 둡니다.
      const p = await this.policy.getNumbers(['RESCHEDULE_DEADLINE_HOURS', 'RESCHEDULE_EVENT_CUTOFF_HOURS']);
      const startsAt = seoulDateTime(a.date, a.startTime);
      // 일정이 바뀐 것이 아니라서 약속 시작 때까지 다시 확인할 시간을 줍니다. (행사 일정 변경 때의 '12시간 전' 여유는 두지 않음)
      const deadline = new Date(Math.min(now.getTime() + p.RESCHEDULE_DEADLINE_HOURS * 3600 * 1000, startsAt.getTime()));
      await this.state.transition(tx, a.id, 'CONFIRMED', 'RESCHEDULING', { rescheduleDeadline: deadline, rescheduleReason: 'MEMBERS_CHANGED' });
      await tx.appointmentParticipant.updateMany({
        where: { appointmentId: a.id, leftAt: null, side: outcome.reconfirmSide },
        data: { rescheduleConfirmedAt: null },
      });
      await tx.appointmentParticipant.updateMany({
        where: { appointmentId: a.id, leftAt: null, side: otherSide(outcome.reconfirmSide) },
        data: { rescheduleConfirmedAt: now },
      });
      deadlineText = formatSeoulShort(deadline);
    } else if (outcome.becomesConfirmed) {
      await this.state.transition(tx, a.id, 'PENDING_CONFIRM', 'CONFIRMED', { confirmedAt: now });
    }
    for (const o of others) {
      // 다시 확인해야 하는 쪽에게만 기한을 안내합니다.
      const ask = !!outcome.reconfirmSide && sideOf(o) === outcome.reconfirmSide;
      await this.notifications.notify(tx, o.userId, 'APPOINTMENT_MEMBER_LEFT', { nickname: names, eventName: a.event.name, ...(ask ? { deadline: deadlineText } : {}) }, { appointmentId: a.id });
    }
    return { ended: false };
  }

  /** 약속 취소(여러 명이면 이 약속에서 빠지기). 약속 24시간 전이 지나면 '임박 취소'로 기록합니다. (신뢰 단계 반영은 7단계) */
  async cancel(userId: string, id: string, reason?: CancelReason): Promise<AppointmentView> {
    await this.settle({ id });
    const a = await this.load(userId, id);
    const now = this.clock.now();
    const f = factsOf(a);
    if (!appointmentActions(f, userId, now, { newScheduleAvailable: false }).cancel) {
      throw new AppError('APPOINTMENT_STATE', '지금은 취소할 수 없는 약속이에요.', { status: a.status });
    }
    const late = now >= freeCancelUntil(a.date, a.startTime, f.policy);
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, a.id);
      await this.leaveInternal(tx, a, userId, {
        reason: 'CANCEL',
        cancelReason: reason ?? null,
        late,
        notifyEnded: async (others) => {
          for (const o of others) {
            await this.notifications.notify(
              tx,
              o.userId,
              'APPOINTMENT_CANCELLED',
              { nickname: this.nickname(a, userId), eventName: a.event.name, reason: reason ? CANCEL_REASONS[reason] : null },
              { appointmentId: a.id },
            );
          }
        },
      });
    });
    // 임박 취소는 신뢰 단계에 반영됩니다. (정책 값 12)
    if (late) await this.trust.recompute(userId);
    return this.get(userId, id);
  }

  /** '도착했어요' (노쇼 판단에 쓰는 도착 기록) */
  async arrive(userId: string, id: string): Promise<AppointmentView> {
    await this.settle({ id });
    const a = await this.load(userId, id);
    const now = this.clock.now();
    if (!appointmentActions(factsOf(a), userId, now, { newScheduleAvailable: false }).arrive) {
      throw new AppError('APPOINTMENT_NOT_NOW', '약속 시간이 가까워지면 누를 수 있어요.');
    }
    const others = liveOf(a).filter((p) => p.userId !== userId);
    await this.prisma.$transaction(async (tx) => {
      const marked = await tx.appointmentParticipant.updateMany({ where: { appointmentId: a.id, userId, leftAt: null, arrivedAt: null }, data: { arrivedAt: now } });
      if (marked.count === 1) {
        await chatSystemLine(tx, a.id, arrivedLine(this.nickname(a, userId)), now);
        for (const o of others) {
          await this.notifications.notify(tx, o.userId, 'PARTNER_ARRIVED', { nickname: this.nickname(a, userId), spotName: a.meetingSpotName }, { appointmentId: a.id });
        }
      }
    });
    return this.get(userId, id);
  }

  /**
   * '안 나왔어요'. 내 도착 기록이 있고 도착하지 않은 사람이 있을 때, 약속 15분 뒤부터.
   * 바로 노쇼로 확정하지 않고 도착 기록을 남겨 두며, 판단은 운영팀의 신고 처리에서 합니다.
   * 여러 명이 만나는 약속에서는 도착하지 않은 사람마다 신고가 접수되고, 다른 사람이 아무도 도착하지 않았을 때만 만남이 끝납니다.
   */
  async reportNoShow(userId: string, id: string): Promise<AppointmentView> {
    await this.settle({ id });
    const a = await this.load(userId, id);
    const now = this.clock.now();
    if (!appointmentActions(factsOf(a), userId, now, { newScheduleAvailable: false }).reportNoShow) {
      throw new AppError('APPOINTMENT_NOT_NOW', "지금은 '안 나왔어요'를 누를 수 없어요.");
    }
    const outcome = noShowOutcome(userId, liveOf(a).map((p) => ({ userId: p.userId, arrivedAt: p.arrivedAt })));
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, a.id);
      const marked = await tx.appointmentParticipant.updateMany({
        where: { appointmentId: a.id, userId, leftAt: null, noShowReportedAt: null },
        data: { noShowReportedAt: now },
      });
      if (marked.count !== 1) throw new AppError('APPOINTMENT_STATE', '이미 눌렀어요.');
      if (outcome.endsMeeting) {
        await this.state.transition(tx, a.id, 'IN_PROGRESS', 'ENDED_EARLY', { endReason: 'NO_SHOW' satisfies AppointmentEndReason });
        for (const o of liveOf(a).filter((p) => p.userId !== userId)) {
          await this.notifications.notify(tx, o.userId, 'APPOINTMENT_ENDED_EARLY', { eventName: a.event.name }, { appointmentId: a.id });
        }
      }
      // 바로 노쇼로 정하지 않고, 도착 기록을 운영팀이 함께 보고 판단하도록 신고 대기열에 올립니다. (정리문서 2장 약속)
      for (const target of outcome.targets) {
        await this.reports.createQueued(tx, { reporterId: userId, targetId: target, appointmentId: a.id, category: 'NO_SHOW', detail: null });
      }
    });
    return this.get(userId, id);
  }

  /**
   * '벗어나고 싶어요' (도움 요청). 도착 버튼이 열린 뒤 약속이 끝날 때까지 누를 수 있습니다.
   * - 약속을 바로 끝내고 채팅을 닫습니다. 상대에게는 사유 없이 '약속이 취소됐어요'만 알립니다.
   * - 운영팀에는 가장 높은 우선순위(도움 요청)로 접수합니다. 차단은 따로 정하지 않습니다.
   * - 믿는 사람 알림을 미리 켜 둔 경우에만, 내가 만든 링크 화면에 안내가 뜹니다.
   * TODO(11단계): 청소년이면 보호자 알림으로 이어집니다.
   */
  async requestHelp(userId: string, id: string): Promise<HelpResult> {
    await this.settle({ id });
    const a = await this.load(userId, id);
    const now = this.clock.now();
    const t = rangeOf(a.date, a.startTime, a.endTime);
    if (!canRequestHelp(a.status as AppointmentStatus, now, t, factsOf(a).policy.arrivalOpenMinutes)) {
      throw new AppError('SAFETY_NOT_NOW', '지금은 도움 요청을 쓸 수 없어요. 나중에 문제가 있었다면 신고로 알려 주세요.');
    }
    const mine = a.participants.find((p) => p.userId === userId)!;
    if (mine.leftAt) throw new AppError('SAFETY_NOT_NOW', '이미 이 약속에서 빠졌어요.');
    // 신고는 상대 쪽(일행이 아닌 쪽) 사람 모두에게 접수합니다. (1:1이면 상대 한 명)
    const targets = liveOf(a).filter((p) => sideOf(p) !== sideOf(mine));
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { safetyAlertTrusted: true } });
    let ended = true;
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, a.id);
      // 일행이 있으면 누른 사람만 빠지고 나머지는 계속합니다. 쪽이 비면 약속이 끝나고 채팅이 닫힙니다.
      const result = await this.leaveInternal(tx, a, userId, {
        reason: 'SAFETY',
        late: false,
        notifyEnded: async (others) => {
          for (const o of others) {
            await this.notifications.notify(
              tx,
              o.userId,
              'APPOINTMENT_CANCELLED',
              { nickname: this.nickname(a, userId), eventName: a.event.name, reason: null },
              { appointmentId: a.id },
            );
          }
        },
      });
      ended = result.ended;
      await tx.safetyCheck.updateMany({
        where: { appointmentId: a.id, userId, answeredAt: null },
        data: { answeredAt: now, answer: 'HELP' },
      });
      if (me.safetyAlertTrusted) {
        await tx.shareLink.updateMany({
          where: { creatorId: userId, appointmentId: a.id, revokedAt: null },
          data: { alertKind: 'HELP', alertAt: now },
        });
      }
      for (const target of targets) {
        await this.reports.createQueued(
          tx,
          { reporterId: userId, targetId: target.userId, appointmentId: a.id, category: 'HELP_REQUEST', detail: null },
          { help: true },
        );
      }
    });
    void ended;
    return { ended: true, reported: true, trustedNotified: me.safetyAlertTrusted };
  }

  /** 안전 확인에 답하기. '네, 괜찮아요'는 기록만 하고, '도움이 필요해요'는 도움 요청으로 이어집니다. */
  async answerSafetyCheck(userId: string, appointmentId: string, checkId: string, answer: 'OK' | 'HELP'): Promise<AppointmentView | HelpResult> {
    await this.settle({ id: appointmentId });
    const check = await this.prisma.safetyCheck.findFirst({ where: { id: checkId, appointmentId, userId } });
    if (!check) throw new AppError('NOT_FOUND', '확인 요청을 찾을 수 없어요.');
    if (answer === 'HELP') return this.requestHelp(userId, appointmentId);
    await this.prisma.safetyCheck.updateMany({
      where: { id: check.id, answeredAt: null },
      data: { answeredAt: this.clock.now(), answer: 'OK' },
    });
    return this.get(userId, appointmentId);
  }

  // ───────────── 행사가 바뀌거나 취소될 때 (운영 콘솔에서 부름) ─────────────

  /**
   * 바뀐 일정(input)으로 시간이 달라지는 약속 수. 저장 전 확인 화면에 보여 줍니다.
   */
  async countAffectedBySchedule(
    eventId: string,
    days: Array<{ date: string; startTime: string; endTime: string; segments: Array<{ label: string; startTime: string; endTime: string }> }>,
  ) {
    const rows = await this.prisma.appointment.findMany({ where: { eventId, status: { in: RESCHEDULABLE } }, include });
    return rows.filter((a) => {
      const day = days.find((d) => d.date === a.date);
      const ns = scheduleOnDay(snapshotOf(a), day && { ...day, segments: day.segments.map((s, i) => ({ id: `new-${i}`, ...s })) });
      return a.status === 'RESCHEDULING' || !sameSchedule(snapshotOf(a), ns);
    }).length;
  }

  /** 행사 일정이 바뀌었을 때: 시간이 달라진 약속은 '다시 정하기'로 바꾸고 안내합니다. (같은 트랜잭션 안) */
  async onEventScheduleChanged(tx: Prisma.TransactionClient, eventId: string) {
    const now = this.clock.now();
    const p = await this.policy.getNumbers(['RESCHEDULE_DEADLINE_HOURS', 'RESCHEDULE_EVENT_CUTOFF_HOURS']);
    const rows = await tx.appointment.findMany({ where: { eventId, status: { in: RESCHEDULABLE } }, include });
    let changed = 0;
    for (const a of rows) {
      const snap = snapshotOf(a);
      const ns = scheduleOnDay(snap, a.eventDay);
      // 다시 정하는 중이 아니고 이 약속의 시간이 그대로면 그대로 둡니다.
      if (a.status !== 'RESCHEDULING' && sameSchedule(snap, ns)) continue;
      const startsAt = ns ? seoulDateTime(ns.date, ns.startTime) : seoulDateTime(a.date, a.startTime);
      const deadline = rescheduleDeadline(now, startsAt, { hours: p.RESCHEDULE_DEADLINE_HOURS, eventCutoffHours: p.RESCHEDULE_EVENT_CUTOFF_HOURS });
      if (a.status === 'RESCHEDULING') {
        // 다시 정하는 중에 또 바뀌면 기한과 확인을 새로 시작합니다. (상태는 그대로)
        await tx.appointment.update({ where: { id: a.id }, data: { rescheduleDeadline: deadline } });
      } else {
        await this.state.transition(tx, a.id, a.status as AppointmentStatus, 'RESCHEDULING', { rescheduleDeadline: deadline });
      }
      await tx.appointmentParticipant.updateMany({ where: { appointmentId: a.id }, data: { rescheduleConfirmedAt: null } });
      for (const u of a.participants) {
        await this.notifications.notify(
          tx,
          u.userId,
          'EVENT_SCHEDULE_CHANGED',
          { eventName: a.event.name, deadline: formatSeoulShort(deadline) },
          { appointmentId: a.id },
        );
      }
      changed++;
    }
    return changed;
  }

  /**
   * 차단하면 둘이 함께하는 진행 중인 약속에서 차단한 사람이 빠집니다. (같은 트랜잭션 안)
   * 1:1이면 약속이 끝나고(만남 중이면 '중간 종료'), 여러 명이면 남은 사람끼리 계속합니다. 쪽이 비면 끝납니다.
   * 차단한 사람에게는 임박 취소 기록을 남기지 않고, 상대에게는 이유 없이 '약속이 취소됐어요'만 알립니다. (2026-11-09 사용자 확인)
   */
  async endForBlock(tx: Prisma.TransactionClient, blockerId: string, otherId: string) {
    return this.endEach(tx, blockerId, 'BLOCK', {
      AND: [{ participants: { some: { userId: blockerId, leftAt: null } } }, { participants: { some: { userId: otherId, leftAt: null } } }],
    });
  }

  /**
   * 이용 정지되면 그 사람의 진행 중인 약속을 모두 끝냅니다. 상대에게는 이유 없이 '약속이 취소됐어요'만 알립니다.
   * 정지된 사람에게는 임박 취소 기록을 남기지 않습니다. (이미 다른 제재를 받았으므로)
   */
  async endForSuspension(tx: Prisma.TransactionClient, userId: string) {
    return this.endEach(tx, userId, 'SUSPENDED', { participants: { some: { userId, leftAt: null } } });
  }

  /**
   * 차단하거나 이용 정지된 사람이 진행 중인 약속에서 빠집니다. (여러 명이 만나는 약속이면 남은 사람끼리 계속,
   * 그 사람의 쪽이 비면 약속이 끝남) 임박 취소 기록은 남기지 않습니다.
   */
  private async endEach(tx: Prisma.TransactionClient, byUserId: string, reason: 'BLOCK' | 'SUSPENDED', where: Prisma.AppointmentWhereInput) {
    const rows = await tx.appointment.findMany({ where: { ...where, status: { in: ENDABLE } }, include });
    for (const a of rows) {
      await this.leaveInternal(tx, a, byUserId, {
        reason,
        late: false,
        notifyEnded: async (others) => {
          for (const o of others) {
            await this.notifications.notify(
              tx,
              o.userId,
              'APPOINTMENT_CANCELLED',
              { nickname: this.nickname(a, byUserId), eventName: a.event.name, reason: null },
              { appointmentId: a.id },
            );
          }
        },
      });
    }
    return rows.length;
  }

  /** 행사가 취소되었을 때: 약속을 모두 자동 종료하고 안내합니다. 후기 요청은 보내지 않습니다. */
  async onEventCancelled(tx: Prisma.TransactionClient, eventId: string) {
    const rows = await tx.appointment.findMany({ where: { eventId, status: { in: ENDABLE } }, include });
    for (const a of rows) {
      await this.state.transition(tx, a.id, a.status as AppointmentStatus, 'AUTO_ENDED', {
        endReason: 'EVENT_CANCELLED' satisfies AppointmentEndReason,
      });
      for (const u of liveOf(a)) {
        await this.notifications.notify(tx, u.userId, 'EVENT_CANCELLED', { eventName: a.event.name }, { appointmentId: a.id });
      }
    }
    return rows.length;
  }
}
