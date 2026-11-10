import { Inject, Injectable } from '@nestjs/common';
import { dueSafetySteps, rangeOf, type SafetyCheckFacts, type SafetyPolicy, type SafetyStep } from '@meets/shared';
import { CLOCK, type Clock } from '../common/clock';
import { NotificationsService } from '../notifications/notifications.service';
import { PolicyService } from '../policy/policy.service';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service';

/**
 * 안전 확인 (정리문서 정책 값 10): 만남 중에 최대 2번, 60분 간격으로 '잘 만나고 계세요?'
 * 답이 없으면 10분 뒤 한 번 더, 그래도 없으면 믿는 사람 링크에 알립니다. (미리 켜 둔 경우에만)
 * 상대에게는 보이지 않습니다. 방해 금지 시간에도 바로 알립니다. (안전이 먼저)
 */
@Injectable()
export class SafetyChecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly notifications: NotificationsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async safetyPolicy(): Promise<SafetyPolicy> {
    const p = await this.policy.getNumbers(['SAFETY_CHECK_MAX_COUNT', 'SAFETY_CHECK_INTERVAL_MINUTES', 'SAFETY_CHECK_REASK_MINUTES']);
    return { maxCount: p.SAFETY_CHECK_MAX_COUNT, intervalMinutes: p.SAFETY_CHECK_INTERVAL_MINUTES, reaskMinutes: p.SAFETY_CHECK_REASK_MINUTES };
  }

  /** 만남 중인 약속들의 안전 확인을 챙깁니다. (1분마다, 그리고 약속을 볼 때마다) */
  async run(appointmentIds: string[]) {
    if (appointmentIds.length === 0) return;
    const rows = await this.prisma.appointment.findMany({
      where: { id: { in: appointmentIds }, status: { in: ['IN_PROGRESS'] } },
      include: {
        event: { select: { name: true } },
        participants: { include: { user: { select: { id: true, safetyCheckEnabled: true, safetyAlertTrusted: true } } } },
        safetyChecks: true,
      },
    });
    if (rows.length === 0) return;
    const policy = await this.safetyPolicy();
    const now = this.clock.now();
    for (const a of rows) {
      const { startsAt, endsAt } = rangeOf(a.date, a.startTime, a.endTime);
      for (const part of a.participants) {
        if (!part.user.safetyCheckEnabled) continue;
        const facts: SafetyCheckFacts[] = a.safetyChecks
          .filter((c) => c.userId === part.userId)
          .map((c) => ({ seq: c.seq, askedAt: c.askedAt, remindedAt: c.remindedAt, answeredAt: c.answeredAt, alertedAt: c.alertedAt }));
        // 앞의 확인이 아직 진행 중이면(답도 알림도 아직) 다음 확인은 묻지 않습니다. (서버가 오래 멈췄다 돌아와도 한꺼번에 묻지 않도록)
        const busy = facts.some((c) => !c.answeredAt && !c.alertedAt);
        for (const step of dueSafetySteps(startsAt, endsAt, facts, now, policy)) {
          if (step.kind === 'ASK' && busy) continue;
          await this.apply(a, part.user, step, now);
          if (step.kind === 'ASK') break; // 한 번에 한 건만
        }
      }
    }
  }

  private async apply(
    a: { id: string; event: { name: string } },
    user: { id: string; safetyAlertTrusted: boolean },
    step: SafetyStep,
    now: Date,
  ) {
    const target = { appointmentId: a.id };
    const params = { eventName: a.event.name };
    switch (step.kind) {
      case 'ASK':
        try {
          await this.prisma.$transaction(async (tx) => {
            await tx.safetyCheck.create({ data: { appointmentId: a.id, userId: user.id, seq: step.seq, askedAt: now } });
            await this.notifications.notify(tx, user.id, 'SAFETY_CHECK', params, target, { urgent: true });
          });
        } catch (error) {
          if (!isUniqueViolation(error)) throw error; // 동시에 물은 경우: 한 번만
        }
        return;
      case 'REMIND':
        return this.prisma.$transaction(async (tx) => {
          const done = await tx.safetyCheck.updateMany({
            where: { appointmentId: a.id, userId: user.id, seq: step.seq, remindedAt: null, answeredAt: null },
            data: { remindedAt: now },
          });
          if (done.count === 1) await this.notifications.notify(tx, user.id, 'SAFETY_CHECK_REMIND', params, target, { urgent: true });
        });
      case 'ALERT':
        return this.prisma.$transaction(async (tx) => {
          const done = await tx.safetyCheck.updateMany({
            where: { appointmentId: a.id, userId: user.id, seq: step.seq, alertedAt: null, answeredAt: null },
            data: { alertedAt: now },
          });
          // 믿는 사람 알림을 미리 켜 둔 경우에만, 내가 만든 링크 화면에 안내를 띄웁니다.
          if (done.count === 1 && user.safetyAlertTrusted) {
            await tx.shareLink.updateMany({
              where: { creatorId: user.id, appointmentId: a.id, revokedAt: null },
              data: { alertKind: 'NO_RESPONSE', alertAt: now },
            });
          }
        });
    }
  }
}
