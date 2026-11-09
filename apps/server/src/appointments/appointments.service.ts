import { Inject, Injectable } from '@nestjs/common';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  arrivedLine,
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
import { AppError } from '../common/app-error';
import { CLOCK, type Clock } from '../common/clock';
import type { Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PolicyService } from '../policy/policy.service';
import { ReportStateService } from '../reports/report-state.service';
import { TrustService } from '../trust/trust.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStateService } from './appointment-state.service';

const userPublic = { select: { id: true, nickname: true, avatarInitial: true, avatarColor: true } } as const;

const include = {
  participants: { include: { user: userPublic } },
  event: { select: { id: true, name: true } },
  eventDay: { include: { segments: { orderBy: { sortOrder: 'asc' } } } },
  reviews: { select: { authorId: true } },
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

function factsOf(a: Row): AppointmentFacts {
  return {
    status: a.status as AppointmentStatus,
    date: a.date,
    startTime: a.startTime,
    endTime: a.endTime,
    policy: a.policy as unknown as AppointmentPolicy,
    rescheduleDeadline: a.rescheduleDeadline,
    participants: a.participants.map((p) => ({
      userId: p.userId,
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
  const done = a.reviews.some((r) => r.authorId === me);
  return { canWrite: a.status === 'ENDED' && !done && now < deadline, done, deadline: deadline.toISOString() };
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
  ) {
    return this.state.create(tx, {
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
      policy: { ...(await this.policySnapshot()) },
      participants: { create: [{ userId: p.senderId }, { userId: p.receiverId }] },
    });
  }

  /** 이 사람의 진행 중인 약속 중 시간이 겹치는 것 */
  async findOverlap(userId: string, range: TimeRange, excludeId?: string) {
    const rows = await this.prisma.appointment.findMany({
      where: {
        status: { in: ACTIVE_APPOINTMENT_STATUSES },
        participants: { some: { userId } },
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
          for (const p of a.participants) {
            const silent = step.noResponseUserIds.includes(p.userId);
            await this.notifications.notify(tx, p.userId, silent ? 'NO_CONFIRM_SELF' : 'NO_CONFIRM_PARTNER', base, target);
          }
        }).then(async () => {
          // 무응답은 신뢰 단계에 반영됩니다. (정책 값 12)
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
          for (const p of a.participants) {
            const other = a.participants.find((x) => x.userId !== p.userId)!;
            await this.notifications.notify(tx, p.userId, 'REVIEW_REQUEST', { nickname: other.user.nickname ?? '', eventName: a.event.name, deadline }, target);
          }
        });
      }
      case 'HOLD':
        return this.prisma.$transaction(async (tx) => {
          await this.state.transition(tx, a.id, 'RESCHEDULING', 'ON_HOLD');
          for (const p of a.participants) await this.notifications.notify(tx, p.userId, 'APPOINTMENT_ON_HOLD', base, target);
        });
    }
  }

  // ───────────── 조회 ─────────────

  private toView(a: Row, me: string, now: Date, reviewDays: number, unreadMessages = 0): AppointmentView {
    const f = factsOf(a);
    const t = factsTimes(f);
    const mine = a.participants.find((p) => p.userId === me)!;
    const other = a.participants.find((p) => p.userId !== me)!;
    const snap = snapshotOf(a);
    const ns = a.status === 'RESCHEDULING' ? scheduleOnDay(snap, a.eventDay) : null;
    const actions = appointmentActions(f, me, now, { newScheduleAvailable: !!ns });
    const reason = a.endReason as AppointmentEndReason | null;
    const byMe =
      reason === 'CANCELLED' ? a.cancelledById === me : reason === 'NO_CONFIRM' ? mine.noResponse : reason === 'NO_SHOW' ? !!mine.noShowReportedAt : false;
    return {
      id: a.id,
      status: a.status as AppointmentStatus,
      counterpart: counterpart(other.user),
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
        theirs: !!other.dayBeforeConfirmedAt,
      },
      arrival: { mine: mine.arrivedAt?.toISOString() ?? null, theirs: other.arrivedAt?.toISOString() ?? null },
      freeCancelUntil: freeCancelUntil(a.date, a.startTime, f.policy).toISOString(),
      reschedule:
        (a.status === 'RESCHEDULING' || a.status === 'ON_HOLD') && a.rescheduleDeadline
          ? {
              deadline: a.rescheduleDeadline.toISOString(),
              mine: !!mine.rescheduleConfirmedAt,
              theirs: !!other.rescheduleConfirmedAt,
              newSchedule: ns && { date: ns.date, startTime: ns.startTime, endTime: ns.endTime },
            }
          : null,
      end: reason
        ? {
            reason,
            byMe,
            cancelReason: a.cancelReason ? (CANCEL_REASONS[a.cancelReason as CancelReason] ?? null) : null,
            late: reason === 'CANCELLED' && a.cancelledById === me && mine.lateCancel === true,
          }
        : null,
      actions,
      needsAction: actions.confirm || actions.reconfirm || actions.arrive || actions.reportNoShow,
      unreadMessages,
      review: reviewState(a, me, now, reviewDays, t.endsAt),
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
    const other = a.participants.find((p) => p.userId !== userId)!;
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
          where: { appointmentId: a.id, userId, dayBeforeConfirmedAt: null },
          data: { dayBeforeConfirmedAt: now },
        });
        const confirmed = await tx.appointmentParticipant.count({ where: { appointmentId: a.id, dayBeforeConfirmedAt: { not: null } } });
        if (confirmed === a.participants.length) {
          await this.state.transition(tx, a.id, 'PENDING_CONFIRM', 'CONFIRMED', { confirmedAt: now });
          await this.notifications.notify(
            tx,
            other.userId,
            'APPOINTMENT_CONFIRMED',
            { nickname: this.nickname(a, userId), when: formatSeoulShort(t.startsAt), spotName: a.meetingSpotName },
            target,
          );
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
          where: { appointmentId: a.id, userId, rescheduleConfirmedAt: null },
          data: { rescheduleConfirmedAt: now },
        });
        const confirmed = await tx.appointmentParticipant.count({ where: { appointmentId: a.id, rescheduleConfirmedAt: { not: null } } });
        if (confirmed === a.participants.length) {
          // 둘 다 확인하면 바뀐 일정으로 확정
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
          await this.notifications.notify(
            tx,
            other.userId,
            'APPOINTMENT_CONFIRMED',
            { nickname: this.nickname(a, userId), when: formatSeoulShort(seoulDateTime(ns.date, ns.startTime)), spotName: a.meetingSpotName },
            target,
          );
        }
      });
      return this.get(userId, id);
    }

    throw new AppError('APPOINTMENT_STATE', '지금은 확인할 수 없는 약속이에요.', { status: a.status });
  }

  /** 약속 취소. 약속 24시간 전이 지나면 '임박 취소'로 기록합니다. (신뢰 단계 반영은 7단계) */
  async cancel(userId: string, id: string, reason?: CancelReason): Promise<AppointmentView> {
    await this.settle({ id });
    const a = await this.load(userId, id);
    const now = this.clock.now();
    const f = factsOf(a);
    if (!appointmentActions(f, userId, now, { newScheduleAvailable: false }).cancel) {
      throw new AppError('APPOINTMENT_STATE', '지금은 취소할 수 없는 약속이에요.', { status: a.status });
    }
    const late = now >= freeCancelUntil(a.date, a.startTime, f.policy);
    const other = a.participants.find((p) => p.userId !== userId)!;
    await this.prisma.$transaction(async (tx) => {
      await this.state.transition(tx, a.id, a.status as AppointmentStatus, 'CANCELLED', {
        endReason: 'CANCELLED' satisfies AppointmentEndReason,
        cancelledById: userId,
        cancelReason: reason ?? null,
      });
      await tx.appointmentParticipant.update({
        where: { appointmentId_userId: { appointmentId: a.id, userId } },
        data: { cancelledAt: now, lateCancel: late },
      });
      await this.notifications.notify(
        tx,
        other.userId,
        'APPOINTMENT_CANCELLED',
        { nickname: this.nickname(a, userId), eventName: a.event.name, reason: reason ? CANCEL_REASONS[reason] : null },
        { appointmentId: a.id },
      );
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
    const other = a.participants.find((p) => p.userId !== userId)!;
    await this.prisma.$transaction(async (tx) => {
      const marked = await tx.appointmentParticipant.updateMany({ where: { appointmentId: a.id, userId, arrivedAt: null }, data: { arrivedAt: now } });
      if (marked.count === 1) {
        await chatSystemLine(tx, a.id, arrivedLine(this.nickname(a, userId)), now);
        await this.notifications.notify(tx, other.userId, 'PARTNER_ARRIVED', { nickname: this.nickname(a, userId), spotName: a.meetingSpotName }, { appointmentId: a.id });
      }
    });
    return this.get(userId, id);
  }

  /**
   * '안 나왔어요'. 내 도착 기록이 있고 상대 기록이 없을 때, 약속 15분 뒤부터.
   * 바로 노쇼로 확정하지 않고 양쪽 도착 기록을 남겨 두며, 판단은 운영팀의 신고 처리에서 합니다.
   */
  async reportNoShow(userId: string, id: string): Promise<AppointmentView> {
    await this.settle({ id });
    const a = await this.load(userId, id);
    const now = this.clock.now();
    if (!appointmentActions(factsOf(a), userId, now, { newScheduleAvailable: false }).reportNoShow) {
      throw new AppError('APPOINTMENT_NOT_NOW', "지금은 '안 나왔어요'를 누를 수 없어요.");
    }
    const other = a.participants.find((p) => p.userId !== userId)!;
    await this.prisma.$transaction(async (tx) => {
      await this.state.transition(tx, a.id, 'IN_PROGRESS', 'ENDED_EARLY', { endReason: 'NO_SHOW' satisfies AppointmentEndReason });
      await tx.appointmentParticipant.update({
        where: { appointmentId_userId: { appointmentId: a.id, userId } },
        data: { noShowReportedAt: now },
      });
      await this.notifications.notify(tx, other.userId, 'APPOINTMENT_ENDED_EARLY', { eventName: a.event.name }, { appointmentId: a.id });
      // 바로 노쇼로 정하지 않고, 양쪽 도착 기록을 운영팀이 함께 보고 판단하도록 신고 대기열에 올립니다. (정리문서 2장 약속)
      await this.reports.createQueued(tx, { reporterId: userId, targetId: other.userId, appointmentId: a.id, category: 'NO_SHOW', detail: null });
    });
    return this.get(userId, id);
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
   * 차단하면 둘 사이의 진행 중인 약속을 끝냅니다. (같은 트랜잭션 안)
   * 차단한 사람에게는 임박 취소 기록을 남기지 않고, 상대에게는 이유 없이 '약속이 취소됐어요'만 알립니다. (2026-11-09 사용자 확인)
   * 만남 중이면 '중간 종료'로 끝납니다.
   */
  async endForBlock(tx: Prisma.TransactionClient, blockerId: string, otherId: string) {
    return this.endEach(tx, blockerId, {
      AND: [{ participants: { some: { userId: blockerId } } }, { participants: { some: { userId: otherId } } }],
    });
  }

  /**
   * 이용 정지되면 그 사람의 진행 중인 약속을 모두 끝냅니다. 상대에게는 이유 없이 '약속이 취소됐어요'만 알립니다.
   * 정지된 사람에게는 임박 취소 기록을 남기지 않습니다. (이미 다른 제재를 받았으므로)
   */
  async endForSuspension(tx: Prisma.TransactionClient, userId: string) {
    return this.endEach(tx, userId, { participants: { some: { userId } } });
  }

  private async endEach(tx: Prisma.TransactionClient, byUserId: string, where: Prisma.AppointmentWhereInput) {
    const now = this.clock.now();
    const rows = await tx.appointment.findMany({ where: { ...where, status: { in: ENDABLE } }, include });
    for (const a of rows) {
      const to: AppointmentStatus = a.status === 'IN_PROGRESS' ? 'ENDED_EARLY' : 'CANCELLED';
      await this.state.transition(tx, a.id, a.status as AppointmentStatus, to, {
        endReason: 'CANCELLED' satisfies AppointmentEndReason,
        cancelledById: byUserId,
      });
      await tx.appointmentParticipant.update({
        where: { appointmentId_userId: { appointmentId: a.id, userId: byUserId } },
        data: { cancelledAt: now, lateCancel: false },
      });
      const other = a.participants.find((p) => p.userId !== byUserId)!;
      await this.notifications.notify(
        tx,
        other.userId,
        'APPOINTMENT_CANCELLED',
        { nickname: this.nickname(a, byUserId), eventName: a.event.name, reason: null },
        { appointmentId: a.id },
      );
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
      for (const u of a.participants) {
        await this.notifications.notify(tx, u.userId, 'EVENT_CANCELLED', { eventName: a.event.name }, { appointmentId: a.id });
      }
    }
    return rows.length;
  }
}
