import { Inject, Injectable } from '@nestjs/common';
import {
  AVATAR_COLORS,
  checkPreference,
  describeCandidate,
  expectedCounts,
  explainMatch,
  immersionLevel,
  manAge,
  matchCandidates,
  parseCalendarDate,
  PREFERENCE_PROBLEM_MESSAGES,
  PROMISE_SHORT_LABELS,
  tempoLevel,
  todayInSeoul,
  type AnswerValue,
  type CandidateCard,
  type CandidateDetail,
  type CandidatesResponse,
  type MatchCandidate,
  type MatchDay,
  type MatchOptions,
  type MatchPolicy,
  type MatchProfile,
  type MustAge,
  type MustGender,
  type PreferenceView,
  type PromiseCode,
} from '@meets/shared';
import { AppError } from '../common/app-error';
import { CLOCK, type Clock } from '../common/clock';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import type { PreferenceDto } from './matching.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

function isoOf(d: { year: number; month: number; day: number }) {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/** 입력 흐름 저장, 후보 매칭, 후보 없음 알림 신청 */
@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private today() {
    return todayInSeoul(this.clock.now());
  }

  /** 사용자에게 보이는(등록·변경된, 끝나지 않은) 행사와 날짜·구간 */
  private async visibleEvent(eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, status: { in: ['REGISTERED', 'CHANGED'] } },
      include: {
        days: { orderBy: { date: 'asc' }, include: { segments: { orderBy: { sortOrder: 'asc' } } } },
      },
    });
    const today = isoOf(this.today());
    if (!event || !event.days.some((d) => d.date >= today)) {
      throw new AppError('NOT_FOUND', '행사를 찾을 수 없어요.');
    }
    const days: MatchDay[] = event.days.map((d) => ({
      id: d.id,
      date: d.date,
      startTime: d.startTime,
      endTime: d.endTime,
      segments: d.segments.map((s) => ({ id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime })),
    }));
    return { event, days };
  }

  private async matchPolicy(): Promise<MatchPolicy> {
    const p = await this.policy.getNumbers([
      'MATCH_TEMPO_MAX_GAP',
      'MATCH_IMMERSION_MAX_GAP',
      'MATCH_IMMERSION_RELAXED_GAP',
      'MATCH_FEW_CANDIDATES',
      'MATCH_MIN_OVERLAP_MINUTES',
      'MATCH_SHORT_OVERLAP_MINUTES',
    ]);
    return {
      tempoMaxGap: p.MATCH_TEMPO_MAX_GAP,
      immersionMaxGap: p.MATCH_IMMERSION_MAX_GAP,
      immersionRelaxedGap: p.MATCH_IMMERSION_RELAXED_GAP,
      fewCandidates: p.MATCH_FEW_CANDIDATES,
      minOverlapMinutes: p.MATCH_MIN_OVERLAP_MINUTES,
      shortOverlapMinutes: p.MATCH_SHORT_OVERLAP_MINUTES,
    };
  }

  async getPreference(userId: string, eventId: string): Promise<PreferenceView | null> {
    await this.visibleEvent(eventId);
    const pref = await this.prisma.preference.findUnique({
      where: { userId_eventId: { userId, eventId } },
      include: { days: true },
    });
    if (!pref) return null;
    return {
      days: pref.days.map((d) => ({
        eventDayId: d.eventDayId,
        arriveTime: d.arriveTime,
        leaveTime: d.leaveTime,
        togetherSegmentIds: d.togetherSegmentIds,
      })),
      tempoAnswers: pref.tempoAnswers as AnswerValue[],
      immersionAnswers: pref.immersionAnswers as AnswerValue[],
      must: { gender: pref.mustGender as MustGender, age: pref.mustAge as MustAge, promises: pref.promises as PromiseCode[] },
      tempoLevel: pref.tempoLevel as AnswerValue,
      immersionLevel: pref.immersionLevel as AnswerValue,
    };
  }

  async savePreference(userId: string, eventId: string, input: PreferenceDto): Promise<PreferenceView> {
    const { event, days } = await this.visibleEvent(eventId);
    const today = isoOf(this.today());
    const check = checkPreference(input, days.filter((d) => d.date >= today));
    if (!check.ok) {
      throw new AppError('PREFERENCE_INVALID', PREFERENCE_PROBLEM_MESSAGES[check.problem], { problem: check.problem });
    }
    const data = {
      tempoAnswers: input.tempoAnswers,
      immersionAnswers: input.immersionAnswers,
      tempoLevel: tempoLevel(input.tempoAnswers),
      immersionLevel: immersionLevel(input.immersionAnswers, event.category),
      mustGender: input.must.gender,
      mustAge: input.must.age,
      promises: input.must.promises,
    };
    await this.prisma.$transaction(async (tx) => {
      const pref = await tx.preference.upsert({
        where: { userId_eventId: { userId, eventId } },
        update: data,
        create: { userId, eventId, ...data },
      });
      await tx.preferenceDay.deleteMany({ where: { preferenceId: pref.id } });
      await tx.preferenceDay.createMany({
        data: input.days.map((d) => ({
          preferenceId: pref.id,
          eventDayId: d.eventDayId,
          arriveTime: d.arriveTime,
          leaveTime: d.leaveTime,
          togetherSegmentIds: d.togetherSegmentIds,
        })),
      });
    });
    return (await this.getPreference(userId, eventId))!;
  }

  /** 이 행사에 입력을 마친 사람들의 매칭 정보 */
  private async profiles(eventId: string): Promise<{ profiles: MatchProfile[]; users: Map<string, { nickname: string; avatarInitial: string; avatarColor: string; fandomPublic: boolean; fandoms: string[] }> }> {
    const today = this.today();
    const prefs = await this.prisma.preference.findMany({
      where: {
        eventId,
        // 이용 중이고 가입을 마친 성인만 후보가 됩니다. (청소년은 성인 후보에 보이지 않음)
        user: { status: { equals: 'ACTIVE' }, ageClass: { equals: 'ADULT' }, signupCompletedAt: { not: null } },
      },
      include: {
        days: true,
        user: { include: { identity: true, fandoms: { include: { fandom: true } } } },
      },
    });
    // TODO(7단계): 서로 차단한 사람은 후보에서 숨깁니다.
    // TODO(6단계): 티켓으로 입장할 수 있는 날만 후보에 나오게 합니다.
    const users = new Map<string, { nickname: string; avatarInitial: string; avatarColor: string; fandomPublic: boolean; fandoms: string[] }>();
    const profiles = prefs.map((p) => {
      const birth = p.user.identity?.birthDate ? parseCalendarDate(p.user.identity.birthDate) : null;
      users.set(p.userId, {
        nickname: p.user.nickname ?? '',
        avatarInitial: p.user.avatarInitial ?? '',
        avatarColor: p.user.avatarColor ?? 'ink',
        fandomPublic: p.user.fandomPublic,
        fandoms: p.user.fandoms.map((f) => f.fandom.name),
      });
      return {
        userId: p.userId,
        age: birth ? manAge(birth, today) : null,
        gender: p.user.identity?.gender ?? null,
        tempo: p.tempoLevel,
        immersion: p.immersionLevel,
        must: { gender: p.mustGender as MustGender, age: p.mustAge as MustAge, promises: p.promises as PromiseCode[] },
        fandomIds: p.user.fandoms.map((f) => f.fandomId),
        days: p.days.map((d) => ({
          eventDayId: d.eventDayId,
          arriveTime: d.arriveTime,
          leaveTime: d.leaveTime,
          togetherSegmentIds: d.togetherSegmentIds,
        })),
      } satisfies MatchProfile;
    });
    return { profiles, users };
  }

  private async context(userId: string, eventId: string) {
    const { days } = await this.visibleEvent(eventId);
    const { profiles, users } = await this.profiles(eventId);
    const viewer = profiles.find((p) => p.userId === userId);
    if (!viewer) throw new AppError('PREFERENCE_REQUIRED', '먼저 일정과 스타일을 알려 주세요.');
    const today = isoOf(this.today());
    // 지난 날짜는 매칭하지 않습니다.
    const upcoming = days.filter((d) => d.date >= today);
    return { days: upcoming, profiles, users, viewer, policy: await this.matchPolicy() };
  }

  private toCard(c: MatchCandidate, users: Awaited<ReturnType<MatchingService['profiles']>>['users']): CandidateCard {
    const u = users.get(c.userId)!;
    return {
      userId: c.userId,
      nickname: u.nickname,
      avatarInitial: u.avatarInitial,
      avatarColor: AVATAR_COLORS[u.avatarColor as keyof typeof AVATAR_COLORS] ?? AVATAR_COLORS.ink,
      tempoGap: c.tempoGap,
      immersionGap: c.immersionGap,
      sameFan: c.sameFan,
      overlaps: c.overlaps,
      bestOverlapMinutes: c.bestOverlapMinutes,
      shortStart: c.shortStart,
      summary: describeCandidate(c),
    };
  }

  async candidates(userId: string, eventId: string, options: MatchOptions): Promise<CandidatesResponse> {
    const { days, profiles, users, viewer, policy } = await this.context(userId, eventId);
    const result = matchCandidates(viewer, profiles, days, policy, options);
    const cards = result.candidates.map((c) => this.toCard(c, users));
    return {
      total: cards.length,
      immersionRelaxed: result.immersionRelaxed,
      candidates: cards,
      widen: cards.length === 0 ? expectedCounts(viewer, profiles, days, policy, options) : null,
    };
  }

  /** 후보 상세. 조건을 넓혀서 보이는 후보까지 볼 수 있고, 그 밖의 사람은 볼 수 없습니다. */
  async candidateDetail(userId: string, eventId: string, candidateId: string): Promise<CandidateDetail> {
    const { days, profiles, users, viewer, policy } = await this.context(userId, eventId);
    const result = matchCandidates(viewer, profiles, days, policy, { shortTime: true, immersionPlus: true });
    const c = result.candidates.find((x) => x.userId === candidateId);
    if (!c) throw new AppError('NOT_FOUND', '후보를 찾을 수 없어요.');
    const u = users.get(c.userId)!;
    return {
      ...this.toCard(c, users),
      reasons: explainMatch(c, days, PROMISE_SHORT_LABELS),
      publicFandoms: u.fandomPublic ? u.fandoms : [],
    };
  }

  /** 후보 없음 → 알림 신청 (행사 3일 전까지) */
  async registerWait(userId: string, eventId: string, includeImmersionPlus: boolean) {
    const { viewer } = await this.context(userId, eventId);
    const { days } = await this.visibleEvent(eventId);
    const daysBefore = await this.policy.getNumber('WAIT_ALERT_END_DAYS_BEFORE');
    const first = parseCalendarDate(days[0].date)!;
    const ends = new Date(Date.UTC(first.year, first.month - 1, first.day) - daysBefore * DAY_MS);
    const endsOn = ends.toISOString().slice(0, 10);
    if (isoOf(this.today()) > endsOn) {
      throw new AppError('WAIT_TOO_LATE', `행사 ${daysBefore}일 전부터는 알림을 신청할 수 없어요.`, { daysBefore });
    }
    const conditions = { dayIds: viewer.days.map((d) => d.eventDayId), includeImmersionPlus };
    await this.prisma.waitRegistration.upsert({
      where: { userId_eventId: { userId, eventId } },
      update: { conditions, endsOn },
      create: { userId, eventId, conditions, endsOn },
    });
    // TODO(4단계): 하루 한 번 모아서, 방해금지 시간을 지켜 '후보 도착' 알림을 보냅니다.
    return { endsOn, includeImmersionPlus };
  }
}
