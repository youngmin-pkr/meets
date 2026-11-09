import { Inject, Injectable } from '@nestjs/common';
import { computeTrust, trustView, type TrustFacts, type TrustLevel, type TrustPolicy, type TrustView } from '@meets/shared';
import { CLOCK, type Clock } from '../common/clock';
import type { Prisma } from '../generated/prisma/client';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 신뢰 단계 (정리문서 1장, 정책 값 11·12)
 * User.trustLevel을 쓰는 곳은 여기뿐입니다. 단계가 바뀔 때마다 이유와 함께 기록합니다. 숫자 점수는 저장하지 않습니다.
 * 지금은 보여 주기만 합니다. (단계에 따라 기능을 열고 닫는 것은 10단계 때 정함)
 */
@Injectable()
export class TrustService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async trustPolicy(): Promise<TrustPolicy & { windowDays: number }> {
    const p = await this.policy.getNumbers(['TRUST_UP_REVIEW_COUNT', 'TRUST_DOWN_COUNT', 'TRUST_DOWN_WINDOW_DAYS']);
    return { upReviewCount: p.TRUST_UP_REVIEW_COUNT, downCount: p.TRUST_DOWN_COUNT, windowDays: p.TRUST_DOWN_WINDOW_DAYS };
  }

  async facts(userId: string, windowDays: number, db: Db = this.prisma): Promise<TrustFacts> {
    const since = new Date(this.clock.now().getTime() - windowDays * DAY_MS);
    const [planned, verified, positiveReviews, upheldReports, lateCancels, noResponses, noShows] = await Promise.all([
      db.attendancePlan.count({ where: { userId } }),
      db.ticketVerification.count({ where: { userId, status: { in: ['VERIFIED'] } } }),
      db.review.count({ where: { targetId: userId, overall: { in: ['GREAT', 'OK'] } } }),
      // 운영팀이 사실로 확인한 불편 신고 (노쇼 확인은 아래에서 따로 셈)
      db.report.count({ where: { targetId: userId, upheld: true, category: { not: 'NO_SHOW' } } }),
      // 임박 취소: 약속 24시간 안에 내가 취소한 것
      db.appointmentParticipant.count({ where: { userId, lateCancel: true, cancelledAt: { gte: since } } }),
      // 무응답: 확인 마감까지 확인하지 않아 약속이 취소된 것
      db.appointmentParticipant.count({ where: { userId, noResponse: true, appointment: { endedAt: { gte: since } } } }),
      // 운영팀이 사실로 확인한 노쇼
      db.appointmentParticipant.count({ where: { userId, noShowConfirmed: true, appointment: { endedAt: { gte: since } } } }),
    ]);
    return {
      everPlanned: planned > 0,
      everVerified: verified > 0,
      positiveReviews,
      upheldReports,
      recentBadRecords: lateCancels + noResponses + noShows,
    };
  }

  /** 단계를 다시 계산해서, 달라졌으면 저장하고 기록을 남깁니다. */
  async recompute(userId: string, db: Db = this.prisma): Promise<TrustLevel> {
    const p = await this.trustPolicy();
    const { level, reason } = computeTrust(await this.facts(userId, p.windowDays, db), p);
    const user = await db.user.findUnique({ where: { id: userId }, select: { trustLevel: true } });
    if (!user) return level;
    if (user.trustLevel !== level) {
      await db.user.update({ where: { id: userId }, data: { trustLevel: level } });
      await db.trustChange.create({ data: { userId, fromLevel: user.trustLevel, toLevel: level, reason, createdAt: this.clock.now() } });
    }
    return level;
  }

  /** 내 신뢰 단계 화면 */
  async view(userId: string): Promise<TrustView> {
    const level = await this.recompute(userId);
    const p = await this.trustPolicy();
    return trustView(level, await this.facts(userId, p.windowDays), p);
  }
}
