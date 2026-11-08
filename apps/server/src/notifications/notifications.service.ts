import { Inject, Injectable } from '@nestjs/common';
import {
  notificationText,
  pushAvailableAt,
  type NotificationKind,
  type NotificationParams,
  type NotificationView,
} from '@meets/shared';
import { CLOCK, type Clock } from '../common/clock';
import type { Prisma } from '../generated/prisma/client';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 앱 안 알림함 (정리문서 8장)
 * 푸시는 아직 없습니다. TODO(푸시 업체): 업체가 정해지면 pushAt이 지난 알림을 푸시로 보냅니다.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async notify(
    db: Prisma.TransactionClient,
    userId: string,
    kind: NotificationKind,
    params: NotificationParams,
    target: { appointmentId?: string; proposalId?: string } = {},
  ) {
    const q = await this.policy.getNumbers(['NOTIFY_QUIET_START_HOUR', 'NOTIFY_QUIET_END_HOUR']);
    const now = this.clock.now();
    const { title, body } = notificationText(kind, params);
    await db.notification.create({
      data: {
        userId,
        kind,
        title,
        body,
        appointmentId: target.appointmentId ?? null,
        proposalId: target.proposalId ?? null,
        pushAt: pushAvailableAt(now, q.NOTIFY_QUIET_START_HOUR, q.NOTIFY_QUIET_END_HOUR),
      },
    });
  }

  async list(userId: string): Promise<{ items: NotificationView[]; unread: number }> {
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.unreadCount(userId),
    ]);
    return {
      items: rows.map((n) => ({
        id: n.id,
        kind: n.kind as NotificationKind,
        title: n.title,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
        read: !!n.readAt,
        appointmentId: n.appointmentId,
        proposalId: n.proposalId,
      })),
      unread,
    };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: this.clock.now() } });
    return { unread: 0 };
  }
}
