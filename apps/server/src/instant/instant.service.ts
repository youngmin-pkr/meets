import { Inject, Injectable } from '@nestjs/common';
import {
  AVATAR_COLORS,
  explainMatch,
  immersionLevel,
  INSTANT_CLOSED_MESSAGES,
  instantMatchDay,
  instantMatchPolicy,
  instantProfileDay,
  instantUntil,
  instantWaiting,
  instantWindowNow,
  manAge,
  matchCandidates,
  parseCalendarDate,
  presenceWindow,
  PROMISE_SHORT_LABELS,
  seoulDateOf,
  tempoLevel,
  type AnswerValue,
  type CandidateDetail,
  type CandidatesResponse,
  type InstantClosedReason,
  type InstantDay,
  type InstantEventView,
  type InstantPolicy,
  type InstantStatusView,
  type InstantStyleInput,
  type InstantWindow,
  type MatchProfile,
  type MustAge,
  type MustGender,
  type PromiseCode,
} from '@meets/shared';
import { blockedWith } from '../blocks/block-queries';
import { AppError } from '../common/app-error';
import { CLOCK, type Clock } from '../common/clock';
import type { Prisma } from '../generated/prisma/client';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 즉석 동행 (정리문서 2장 "즉석 동행")
 * - 위치(좌표)는 받지 않습니다. 사용자가 행사 당일 '지금 행사장에 있어요'를 직접 켜고, 일정 시간 뒤 저절로 꺼집니다.
 *   TODO(법률 검토): GPS로 행사장 안인지 확인하는 방식은 위치 정보 이용 동의를 정한 뒤에 넣습니다.
 * - 나를 뺀 대기 인원이 기준(5명) 미만이면 사람 수만 알려 주고, 개인은 보여 주지 않습니다.
 * - 이용 중인 성인만, 그리고 최근 확인된 노쇼나 이용 제한이 없을 때만 쓸 수 있습니다. 서로 차단한 사람은 보이지 않습니다.
 */
@Injectable()
export class InstantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly matching: MatchingService,
    private readonly notifications: NotificationsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async instantPolicy(): Promise<InstantPolicy> {
    const p = await this.policy.getNumbers(['INSTANT_MIN_WAITING', 'INSTANT_END_HOUR', 'INSTANT_PRESENCE_MINUTES', 'INSTANT_WINDOW_MINUTES', 'INSTANT_MIN_OVERLAP_MINUTES']);
    return {
      minWaiting: p.INSTANT_MIN_WAITING,
      endHour: p.INSTANT_END_HOUR,
      presenceMinutes: p.INSTANT_PRESENCE_MINUTES,
      windowMinutes: p.INSTANT_WINDOW_MINUTES,
      minOverlapMinutes: p.INSTANT_MIN_OVERLAP_MINUTES,
    };
  }

  private async loadEvent(eventId: string) {
    const e = await this.prisma.event.findFirst({
      where: { id: eventId, status: { in: ['REGISTERED', 'CHANGED'] } },
      include: { days: { orderBy: { date: 'asc' }, include: { segments: { orderBy: { sortOrder: 'asc' } } } } },
    });
    if (!e) throw new AppError('NOT_FOUND', '행사를 찾을 수 없어요.');
    const days: InstantDay[] = e.days.map((d) => ({
      id: d.id,
      date: d.date,
      startTime: d.startTime,
      endTime: d.endTime,
      segments: d.segments.map((s) => ({ id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime })),
    }));
    return { id: e.id, name: e.name, venue: e.venue ?? '', days };
  }

  /** 이용 중인 성인만, 그리고 최근 확인된 노쇼나 이용 제한이 없을 때만 쓸 수 있습니다. (신뢰 단계 기준을 그대로 씀) */
  private async allowed(userId: string): Promise<boolean> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { ageClass: true, status: true, signupCompletedAt: true } });
    if (!u || u.status !== 'ACTIVE' || !u.signupCompletedAt || u.ageClass !== 'ADULT') return false;
    const now = this.clock.now();
    const days = await this.policy.getNumber('TRUST_DOWN_WINDOW_DAYS');
    const since = new Date(now.getTime() - days * DAY_MS);
    const [noShow, restricted] = await Promise.all([
      this.prisma.appointmentParticipant.count({ where: { userId, noShowConfirmed: true, appointment: { endedAt: { gte: since } } } }),
      this.prisma.userRestriction.count({ where: { userId, endsAt: { gt: now } } }),
    ]);
    return noShow === 0 && restricted === 0;
  }

  private async myPresence(userId: string, eventId: string) {
    const p = await this.prisma.instantPresence.findUnique({ where: { userId_eventId: { userId, eventId } } });
    return p && !p.endedAt && p.until > this.clock.now() ? p : null;
  }

  /** 이 행사에서 지금 켜 둔 다른 사람들 (서로 차단한 사람·쓸 수 없는 사람은 뺌) */
  private async others(userId: string, eventId: string) {
    const now = this.clock.now();
    const blocked = await blockedWith(this.prisma, userId);
    const rows = await this.prisma.instantPresence.findMany({
      where: {
        eventId,
        userId: { not: userId },
        endedAt: null,
        until: { gt: now },
        user: { status: { equals: 'ACTIVE' }, ageClass: { equals: 'ADULT' }, signupCompletedAt: { not: null } },
      },
      include: {
        user: { include: { identity: true, fandoms: { include: { fandom: true } }, preferences: { orderBy: { updatedAt: 'desc' }, take: 1 } } },
      },
    });
    const visible = rows.filter((r) => !blocked.has(r.userId));
    // 최근 확인된 노쇼나 이용 제한이 있는 사람은 후보에서도 뺍니다.
    const ok: typeof visible = [];
    for (const r of visible) if (await this.allowed(r.userId)) ok.push(r);
    return ok;
  }

  /** 켜 둔 사람의 매칭 정보. 저장된 입력(스타일·필수 조건)이 있으면 그대로, 없으면 켤 때 간단히 답한 스타일 */
  private profileOf(
    r: { userId: string; tempoLevel: number | null; immersionLevel: number | null; user: { identity: { birthDate: string | null; gender: string | null } | null; fandoms: Array<{ fandomId: string }>; preferences: Array<{ tempoLevel: number; immersionLevel: number; mustGender: string; mustAge: string; promises: string[] }> } },
    day: InstantDay,
    window: InstantWindow,
    until: Date,
  ): MatchProfile | null {
    const w = presenceWindow(window, until);
    if (!w) return null;
    const pref = r.user.preferences[0];
    const tempo = pref?.tempoLevel ?? r.tempoLevel;
    const immersion = pref?.immersionLevel ?? r.immersionLevel;
    if (!tempo || !immersion) return null;
    const birth = r.user.identity?.birthDate ? parseCalendarDate(r.user.identity.birthDate) : null;
    const t = new Date(this.clock.now().getTime() + 9 * 3600 * 1000);
    return {
      userId: r.userId,
      age: birth ? manAge(birth, { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() }) : null,
      gender: r.user.identity?.gender ?? null,
      tempo,
      immersion,
      must: pref
        ? { gender: pref.mustGender as MustGender, age: pref.mustAge as MustAge, promises: pref.promises as PromiseCode[] }
        : { gender: 'ANY', age: 'ANY', promises: [] },
      fandomIds: r.user.fandoms.map((f) => f.fandomId),
      days: [instantProfileDay(day, w)],
      grade: null,
    };
  }

  // ───────────── 상태 ─────────────

  async status(userId: string, eventId: string): Promise<InstantStatusView> {
    const event = await this.loadEvent(eventId);
    const p = await this.instantPolicy();
    const now = this.clock.now();
    const a = instantWindowNow(event.days, now, p);
    const ok = await this.allowed(userId);
    const mine = await this.myPresence(userId, eventId);
    const others = a.ok && ok ? await this.others(userId, eventId) : [];
    const reason: InstantClosedReason | null = !ok ? 'NOT_ALLOWED' : a.ok ? null : a.reason;
    return {
      event: { id: event.id, name: event.name, venue: event.venue },
      available: reason === null,
      closedReason: reason,
      closedMessage: reason ? INSTANT_CLOSED_MESSAGES[reason] : null,
      mine: { active: !!mine && reason === null, until: mine && reason === null ? mine.until.toISOString() : null },
      waiting: instantWaiting(others.length, p.minWaiting),
      window: a.ok ? { from: a.window.from, to: a.window.to, minutes: a.window.minutes } : null,
      needsStyle: await this.needsStyle(userId),
    };
  }

  /** 저장된 입력(어느 행사든)도, 이전에 간단히 답한 스타일도 없으면 간단한 스타일 질문이 필요합니다. */
  private async needsStyle(userId: string) {
    const [pref, quick] = await Promise.all([
      this.prisma.preference.count({ where: { userId } }),
      this.prisma.instantPresence.count({ where: { userId, tempoLevel: { not: null } } }),
    ]);
    return pref === 0 && quick === 0;
  }

  /** 오늘 즉석 동행을 쓸 수 있는 행사들 (홈의 '지금 갈래요') */
  async todayEvents(userId: string): Promise<InstantEventView[]> {
    if (!(await this.allowed(userId))) return [];
    const p = await this.instantPolicy();
    const now = this.clock.now();
    const today = seoulDateOf(now);
    const events = await this.prisma.event.findMany({
      where: { status: { in: ['REGISTERED', 'CHANGED'] }, days: { some: { date: today } } },
      include: { days: { include: { segments: true } } },
    });
    const out: InstantEventView[] = [];
    for (const e of events) {
      const days: InstantDay[] = e.days.map((d) => ({ id: d.id, date: d.date, startTime: d.startTime, endTime: d.endTime, segments: d.segments.map((s) => ({ id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime })) }));
      if (!instantWindowNow(days, now, p).ok) continue;
      out.push({ event: { id: e.id, name: e.name, venue: e.venue ?? '' }, active: !!(await this.myPresence(userId, e.id)) });
    }
    return out;
  }

  // ───────────── 켜기·끄기 ─────────────

  /** '지금 행사장에 있어요'를 켭니다. (이미 켰으면 시간을 다시 60분으로) */
  async turnOn(userId: string, eventId: string, style?: InstantStyleInput): Promise<InstantStatusView> {
    const event = await this.loadEvent(eventId);
    const p = await this.instantPolicy();
    const now = this.clock.now();
    if (!(await this.allowed(userId))) throw new AppError('INSTANT_NOT_NOW', INSTANT_CLOSED_MESSAGES.NOT_ALLOWED);
    const a = instantWindowNow(event.days, now, p);
    if (!a.ok) throw new AppError('INSTANT_NOT_NOW', INSTANT_CLOSED_MESSAGES[a.reason]);
    let levels: { tempoLevel: number; immersionLevel: number } | null = null;
    if (await this.needsStyle(userId)) {
      if (!style) throw new AppError('INSTANT_NEEDS_STYLE', '간단한 질문에 먼저 답해 주세요.');
      levels = { tempoLevel: tempoLevel(style.tempoAnswers as AnswerValue[]), immersionLevel: immersionLevel(style.immersionAnswers as AnswerValue[]) };
    }
    const others = await this.others(userId, eventId);
    const waiting = others.length < p.minWaiting;
    const until = instantUntil(now, a.day, p);
    const prev = await this.prisma.instantPresence.findUnique({ where: { userId_eventId: { userId, eventId } } });
    const sameDayAlert = prev?.readyNotifiedAt && seoulDateOf(prev.readyNotifiedAt) === seoulDateOf(now) ? prev.readyNotifiedAt : null;
    const data = {
      eventDayId: a.day.id,
      startedAt: now,
      until,
      endedAt: null,
      ...(levels ?? {}),
      // 대기 중에 켰으면 후보가 열릴 때 한 번 알립니다. (하루 한 번)
      waitingSince: waiting && !sameDayAlert ? now : null,
      readyNotifiedAt: sameDayAlert,
    };
    await this.prisma.instantPresence.upsert({ where: { userId_eventId: { userId, eventId } }, create: { userId, eventId, ...data }, update: data });
    return this.status(userId, eventId);
  }

  async turnOff(userId: string, eventId: string): Promise<InstantStatusView> {
    await this.loadEvent(eventId);
    await this.prisma.instantPresence.updateMany({ where: { userId, eventId, endedAt: null }, data: { endedAt: this.clock.now(), waitingSince: null } });
    return this.status(userId, eventId);
  }

  // ───────────── 제안·수락에서 쓰는 확인 (10-2단계) ─────────────

  /** 지금 이 행사에서 즉석 동행을 켜 둔 상태인지 */
  async isActive(userId: string, eventId: string): Promise<boolean> {
    return !!(await this.myPresence(userId, eventId));
  }

  /** 두 사람이 모두 이 행사에서 켜 둔 상태이고, 쓸 수 있는 사람이며, 서로 차단하지 않았는지 (수락할 때 다시 확인) */
  async pairStillValid(aId: string, bId: string, eventId: string): Promise<boolean> {
    const [a, b] = await Promise.all([this.isActive(aId, eventId), this.isActive(bId, eventId)]);
    if (!a || !b) return false;
    if (!(await this.allowed(aId)) || !(await this.allowed(bId))) return false;
    return !(await blockedWith(this.prisma, aId)).has(bId);
  }

  /** 오늘의 행사 날(약속에 저장할 날). 즉석 동행을 쓸 수 있는 때가 아니면 null */
  async todayDay(eventId: string) {
    const event = await this.loadEvent(eventId);
    const p = await this.instantPolicy();
    const a = instantWindowNow(event.days, this.clock.now(), p);
    return a.ok ? { day: a.day, policy: p } : null;
  }

  /** 즉석 약속이 만들어지면 두 사람 모두 더 이상 후보 풀에 있지 않습니다. */
  async turnOffMany(tx: Prisma.TransactionClient, userIds: string[], eventId: string) {
    await tx.instantPresence.updateMany({ where: { userId: { in: userIds }, eventId, endedAt: null }, data: { endedAt: this.clock.now(), waitingSince: null } });
  }

  // ───────────── 후보 ─────────────

  private async context(userId: string, eventId: string) {
    const event = await this.loadEvent(eventId);
    const p = await this.instantPolicy();
    const now = this.clock.now();
    if (!(await this.allowed(userId))) throw new AppError('INSTANT_NOT_NOW', INSTANT_CLOSED_MESSAGES.NOT_ALLOWED);
    const a = instantWindowNow(event.days, now, p);
    if (!a.ok) throw new AppError('INSTANT_NOT_NOW', INSTANT_CLOSED_MESSAGES[a.reason]);
    const mine = await this.myPresence(userId, eventId);
    if (!mine) throw new AppError('INSTANT_NOT_NOW', "먼저 '지금 행사장에 있어요'를 켜 주세요.");
    return { event, p, now, a, mine };
  }

  private async pool(userId: string, eventId: string) {
    const { p, a, mine } = await this.context(userId, eventId);
    const me = await this.prisma.instantPresence.findUniqueOrThrow({
      where: { userId_eventId: { userId, eventId } },
      include: { user: { include: { identity: true, fandoms: { include: { fandom: true } }, preferences: { orderBy: { updatedAt: 'desc' }, take: 1 } } } },
    });
    const others = await this.others(userId, eventId);
    const waiting = instantWaiting(others.length, p.minWaiting);
    const viewer = this.profileOf(me, a.day, a.window, mine.until);
    const profiles = others.map((r) => this.profileOf(r, a.day, a.window, r.until)).filter((x): x is MatchProfile => !!x);
    const users = new Map(
      others.map((r) => [
        r.userId,
        {
          nickname: r.user.nickname ?? '',
          avatarInitial: r.user.avatarInitial ?? '',
          avatarColor: r.user.avatarColor ?? 'ink',
          fandomPublic: r.user.fandomPublic,
          fandoms: r.user.fandoms.map((f) => f.fandom.name),
        },
      ]),
    );
    return { p, a, waiting, viewer, profiles, users };
  }

  /** 후보 목록. 대기 인원이 기준보다 적으면 후보를 보여 주지 않습니다. */
  async candidates(userId: string, eventId: string): Promise<CandidatesResponse> {
    const { p, a, waiting, viewer, profiles, users } = await this.pool(userId, eventId);
    if (!waiting.open) throw new AppError('INSTANT_NOT_NOW', `지금 만날 수 있는 사람이 ${p.minWaiting}명이 되면 후보를 볼 수 있어요.`, { count: waiting.count, min: waiting.min });
    if (!viewer) throw new AppError('INSTANT_NEEDS_STYLE', '간단한 질문에 먼저 답해 주세요.');
    const base = await this.matching.matchPolicy();
    const result = matchCandidates(viewer, profiles, [instantMatchDay(a.day)], instantMatchPolicy(base, p));
    const cards = result.candidates.map((c) => this.matching.toCard(c, users));
    return { total: cards.length, immersionRelaxed: result.immersionRelaxed, candidates: cards, widen: null };
  }

  async candidateDetail(userId: string, eventId: string, candidateId: string): Promise<CandidateDetail> {
    const { p, a, waiting, viewer, profiles, users } = await this.pool(userId, eventId);
    if (!waiting.open) throw new AppError('INSTANT_NOT_NOW', `지금 만날 수 있는 사람이 ${p.minWaiting}명이 되면 후보를 볼 수 있어요.`, { count: waiting.count, min: waiting.min });
    if (!viewer) throw new AppError('INSTANT_NEEDS_STYLE', '간단한 질문에 먼저 답해 주세요.');
    const base = await this.matching.matchPolicy();
    const result = matchCandidates(viewer, profiles, [instantMatchDay(a.day)], instantMatchPolicy(base, p), { shortTime: true, immersionPlus: true });
    const c = result.candidates.find((x) => x.userId === candidateId);
    if (!c) throw new AppError('NOT_FOUND', '후보를 찾을 수 없어요.');
    const u = users.get(c.userId)!;
    return { ...this.matching.toCard(c, users), reasons: explainMatch(c, [instantMatchDay(a.day)], PROMISE_SHORT_LABELS), publicFandoms: u.fandomPublic ? u.fandoms : [] };
  }

  // ───────────── 시간 작업 ─────────────

  /** 1분마다: 대기 중에 켠 사람에게, 후보가 열리면 한 번(하루 한 번) 알립니다. 오래된 기록은 정리합니다. */
  async settleAll() {
    const now = this.clock.now();
    const p = await this.instantPolicy();
    const waiting = await this.prisma.instantPresence.findMany({
      where: { waitingSince: { not: null }, endedAt: null, until: { gt: now } },
      include: { event: { select: { name: true } } },
    });
    for (const r of waiting) {
      const others = await this.others(r.userId, r.eventId);
      if (others.length < p.minWaiting) continue;
      await this.prisma.$transaction(async (tx) => {
        const done = await tx.instantPresence.updateMany({ where: { id: r.id, waitingSince: { not: null } }, data: { waitingSince: null, readyNotifiedAt: now } });
        if (done.count === 1) await this.notifications.notify(tx, r.userId, 'INSTANT_READY', { eventName: r.event.name });
      });
    }
    // 하루가 지난 기록은 지웁니다. (개인정보를 오래 두지 않음)
    await this.prisma.instantPresence.deleteMany({ where: { until: { lt: new Date(now.getTime() - DAY_MS) } } });
  }
}
