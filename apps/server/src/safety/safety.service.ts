import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  formatSeoulShort,
  groupName,
  rangeOf,
  shareLinkExpiresAt,
  sharedStatusOf,
  type AppointmentStatus,
  type SafetySettings,
  type ShareLinkView,
  type SharedAppointmentView,
} from '@meets/shared';
import { AppError } from '../common/app-error';
import { orderedOthers } from '../common/participants';
import { CLOCK, type Clock } from '../common/clock';
import { SERVER_CONFIG, type ServerConfig } from '../config';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';

/** 링크를 만들 수 있는 약속: 아직 끝나지 않은 것 */
const SHAREABLE: AppointmentStatus[] = ['PENDING_CONFIRM', 'CONFIRMED', 'IN_PROGRESS'];

/**
 * 만남 중 안전의 설정과 '믿는 사람에게 알리기' 링크 (정리문서 2장 안전)
 * - 링크에는 행사·시간·장소·동행 별명만 보입니다. 연락처·계정·채팅·프로필은 없습니다.
 * - 링크 주소는 약속 번호에 서명을 붙인 값입니다. (DB에 따로 저장하지 않고, 서명이 틀리면 열리지 않습니다)
 * - 만든 사람이 끌 수 있고, 약속이 끝나고 N시간 뒤 사라집니다.
 */
@Injectable()
export class SafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // ───────────── 설정 ─────────────

  async getSettings(userId: string): Promise<SafetySettings> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { safetyCheckEnabled: true, safetyAlertTrusted: true } });
    return { checkEnabled: u.safetyCheckEnabled, alertTrusted: u.safetyAlertTrusted };
  }

  async updateSettings(userId: string, patch: Partial<SafetySettings>): Promise<SafetySettings> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(patch.checkEnabled === undefined ? {} : { safetyCheckEnabled: patch.checkEnabled }),
        ...(patch.alertTrusted === undefined ? {} : { safetyAlertTrusted: patch.alertTrusted }),
      },
    });
    return this.getSettings(userId);
  }

  // ───────────── 링크 주소 (서명) ─────────────

  private sign(id: string) {
    return createHmac('sha256', this.config.ciHashSecret).update(`share:${id}`).digest('base64url').slice(0, 22);
  }

  private tokenOf(id: string) {
    return `${id}.${this.sign(id)}`;
  }

  private idOf(token: string): string | null {
    const i = token.lastIndexOf('.');
    if (i < 1) return null;
    const id = token.slice(0, i);
    const given = Buffer.from(token.slice(i + 1));
    const want = Buffer.from(this.sign(id));
    if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
    return id;
  }

  // ───────────── 링크 만들기·끄기 ─────────────

  private async viewOf(linkId: string, now: Date): Promise<{ link: ShareLinkView; expired: boolean } | null> {
    const l = await this.prisma.shareLink.findUnique({
      where: { id: linkId },
      include: {
        creator: { select: { id: true } },
        appointment: { include: { event: { select: { name: true } }, participants: { include: { user: { select: { nickname: true } } } } } },
      },
    });
    if (!l) return null;
    const a = l.appointment;
    const mine = a.participants.find((p) => p.userId === l.creatorId)!;
    const others = orderedOthers(a.participants, l.creatorId);
    const { endsAt } = rangeOf(a.date, a.startTime, a.endTime);
    const basis = a.endedAt && a.endedAt < endsAt ? a.endedAt : endsAt;
    const expiresAt = shareLinkExpiresAt(basis, l.expireHours);
    const preview: SharedAppointmentView = {
      eventName: a.event.name,
      when: formatSeoulShort(rangeOf(a.date, a.startTime, a.endTime).startsAt),
      spotName: a.meetingSpotName ?? '',
      companion: groupName(others.map((p) => p.user.nickname ?? '')),
      status: l.showStatus ? sharedStatusOf(a.status as AppointmentStatus, mine.arrivedAt) : null,
      arrivedAt: l.showStatus && mine.arrivedAt ? mine.arrivedAt.toISOString() : null,
      alert: l.alertKind && l.alertAt ? { kind: l.alertKind as 'HELP' | 'NO_RESPONSE', at: l.alertAt.toISOString() } : null,
      expiresAt: expiresAt.toISOString(),
    };
    return {
      expired: !!l.revokedAt || now >= expiresAt,
      link: {
        id: l.id,
        appointmentId: a.id,
        url: `${this.config.publicBaseUrl}/share/${this.tokenOf(l.id)}`,
        showStatus: l.showStatus,
        expiresAt: expiresAt.toISOString(),
        preview,
        eventName: a.event.name,
      },
    };
  }

  /** 내가 이 약속에 만든 링크들 (끄지 않았고 아직 살아 있는 것) */
  async listLinks(userId: string, appointmentId: string): Promise<ShareLinkView[]> {
    const now = this.clock.now();
    const rows = await this.prisma.shareLink.findMany({
      where: { creatorId: userId, appointmentId, revokedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const out: ShareLinkView[] = [];
    for (const r of rows) {
      const v = await this.viewOf(r.id, now);
      if (v && !v.expired) out.push(v.link);
    }
    return out;
  }

  async createLink(userId: string, appointmentId: string, showStatus: boolean): Promise<ShareLinkView> {
    const a = await this.prisma.appointment.findFirst({ where: { id: appointmentId, participants: { some: { userId } } }, select: { id: true, status: true } });
    if (!a) throw new AppError('NOT_FOUND', '약속을 찾을 수 없어요.');
    if (!SHAREABLE.includes(a.status as AppointmentStatus)) {
      throw new AppError('SHARE_NOT_ALLOWED', '이미 끝났거나 취소된 약속은 믿는 사람에게 알릴 수 없어요.');
    }
    const expireHours = await this.policy.getNumber('SHARE_LINK_EXPIRE_HOURS_AFTER_END');
    const created = await this.prisma.shareLink.create({ data: { appointmentId, creatorId: userId, showStatus, expireHours } });
    return (await this.viewOf(created.id, this.clock.now()))!.link;
  }

  /** 링크 끄기. 내 링크가 아니면 '찾을 수 없어요' */
  async revokeLink(userId: string, linkId: string) {
    const done = await this.prisma.shareLink.updateMany({ where: { id: linkId, creatorId: userId, revokedAt: null }, data: { revokedAt: this.clock.now() } });
    if (done.count !== 1) throw new AppError('NOT_FOUND', '링크를 찾을 수 없어요.');
    return { revoked: true as const };
  }

  // ───────────── 받는 사람이 여는 화면 (로그인 없음) ─────────────

  /** 서명이 틀렸거나, 꺼졌거나, 기간이 지난 링크는 모두 같은 '열 수 없어요'로 답합니다. */
  async openShared(token: string): Promise<SharedAppointmentView> {
    const id = this.idOf(token);
    const v = id ? await this.viewOf(id, this.clock.now()) : null;
    if (!v || v.expired) throw new AppError('NOT_FOUND', '열 수 없는 링크예요. 보낸 분께 새 링크를 부탁해 보세요.');
    return v.link.preview;
  }
}
