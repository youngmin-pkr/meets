import { Inject, Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import {
  normalizeReservationNumber,
  todayInSeoul,
  type AttendanceGrade,
  type MyTicketStatus,
  type TicketConfirmResult,
  type TicketFailReason,
  type TicketKind,
} from '@meets/shared';
import { AppError } from '../common/app-error';
import { CLOCK, type Clock } from '../common/clock';
import { SERVER_CONFIG, type ServerConfig } from '../config';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { maskTicketImage } from './ticket-image';
import { RANDOM, TICKET_RECOGNIZER, type RandomSource, type TicketRecognizer } from './ticket-recognizer';
import { TicketStateService } from './ticket-state.service';
import { TrustService } from '../trust/trust.service';
import type { MaskBoxDto } from './tickets.dto';

/** 사용자 앱의 티켓 인증 */
@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly state: TicketStateService,
    @Inject(TICKET_RECOGNIZER) private readonly recognizer: TicketRecognizer,
    @Inject(RANDOM) private readonly random: RandomSource,
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly trust: TrustService,
  ) {}

  private todayIso() {
    const t = todayInSeoul(this.clock.now());
    return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  }

  /** 예매번호 해시: 행사마다 따로 (원문은 저장하지 않음) */
  hashReservation(eventId: string, normalized: string): string {
    return createHmac('sha256', this.config.ciHashSecret).update(`ticket:${eventId}:${normalized}`).digest('hex');
  }

  private async visibleEvent(eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, status: { in: ['REGISTERED', 'CHANGED'] } },
      include: { days: { orderBy: { date: 'asc' } } },
    });
    if (!event || !event.days.some((d) => d.date >= this.todayIso())) {
      throw new AppError('NOT_FOUND', '행사를 찾을 수 없어요.');
    }
    return event;
  }

  private async own(userId: string, verificationId: string) {
    const v = await this.prisma.ticketVerification.findUnique({ where: { id: verificationId } });
    // 다른 사람의 인증은 있는지조차 알려 주지 않습니다.
    if (!v || v.userId !== userId) throw new AppError('NOT_FOUND', '인증을 찾을 수 없어요.');
    return v;
  }

  async myStatus(userId: string, eventId: string): Promise<MyTicketStatus> {
    const event = await this.visibleEvent(eventId);
    const latest = await this.prisma.ticketVerification.findFirst({
      where: { userId, eventId },
      orderBy: { createdAt: 'desc' },
    });
    const plan = await this.prisma.attendancePlan.findUnique({ where: { userId_eventId: { userId, eventId } } });
    const grade: AttendanceGrade | null = latest?.status === 'VERIFIED' ? 'VERIFIED' : plan ? 'PLANNED' : null;
    return {
      verification: latest
        ? {
            id: latest.id,
            kind: latest.kind,
            status: latest.status,
            failReason: (latest.failReason as TicketFailReason | null) ?? null,
            admissibleDayIds: latest.admissibleDayIds,
          }
        : null,
      grade,
      canPlanWithoutTicket: !event.ticketRequired,
    };
  }

  /** 인증 시작. 진행 중이던 인증이 끝나지 않았으면 지우고 새로 시작합니다. */
  async start(userId: string, eventId: string, kind: TicketKind) {
    await this.visibleEvent(eventId);
    const done = await this.prisma.ticketVerification.findFirst({
      where: { userId, eventId, status: { in: ['REVIEW_PENDING', 'VERIFIED', 'REVERIFYING'] } },
    });
    if (done) throw new AppError('TICKET_STATE', '이미 인증했거나 확인 중이에요.');
    return this.prisma.$transaction(async (tx) => {
      // 끝내지 않고 멈춘 인증(시작·업로드·확인)은 이미지와 함께 지웁니다.
      await tx.ticketVerification.deleteMany({
        where: { userId, eventId, status: { in: ['STARTED', 'UPLOADED', 'CONFIRMED'] } },
      });
      const v = await this.state.start(tx, userId, eventId, kind);
      return { id: v.id, status: v.status };
    });
  }

  /** 캡처 올리기: 가릴 영역을 칠한 이미지만 저장합니다. (시작 → 업로드) */
  async uploadImage(userId: string, verificationId: string, imageBase64: string, mimeType: string, masks: MaskBoxDto[]) {
    const v = await this.own(userId, verificationId);
    // 재검증 중에는 이미지만 다시 올리고, 검수자가 결과를 정합니다.
    if (v.status !== 'STARTED' && v.status !== 'UPLOADED' && v.status !== 'REVERIFYING') {
      throw new AppError('TICKET_STATE', '지금은 이미지를 올릴 수 없어요.');
    }
    const maxMb = await this.policy.getNumber('TICKET_IMAGE_MAX_MB');
    const masked = await maskTicketImage(imageBase64, mimeType, masks, maxMb * 1024 * 1024);
    await this.prisma.$transaction(async (tx) => {
      await tx.ticketImage.upsert({
        where: { verificationId },
        update: { data: new Uint8Array(masked), mimeType: 'image/jpeg' },
        create: { verificationId, data: new Uint8Array(masked), mimeType: 'image/jpeg' },
      });
      // 다시 올리는 경우(업로드 상태)는 이미지만 바꿉니다.
      if (v.status === 'STARTED') await this.state.transition(tx, verificationId, 'STARTED', 'UPLOADED');
    });
    return { id: verificationId, status: v.status === 'REVERIFYING' ? ('REVERIFYING' as const) : ('UPLOADED' as const) };
  }

  /**
   * 인식 결과 확인 (업로드 → 확인 → 인증 완료 / 검수 대기 / 실패)
   * - 같은 예매번호가 다른 계정에 인증되어 있으면 사람이 확인합니다. (중복 의심)
   * - 일부는 무작위로 사람이 확인합니다. (정책 값)
   */
  async confirm(userId: string, verificationId: string, rawNumber: string, admissibleDayIds: string[]): Promise<TicketConfirmResult> {
    const v = await this.own(userId, verificationId);
    if (v.status !== 'UPLOADED') throw new AppError('TICKET_STATE', '먼저 캡처를 올려 주세요.');
    const event = await this.visibleEvent(v.eventId);
    const number = normalizeReservationNumber(rawNumber);
    if (!number) throw new AppError('TICKET_INVALID', '예매번호를 다시 확인해 주세요.', { field: 'reservationNumber' });

    // 하루짜리 행사는 그날이 입장 가능한 날입니다.
    const dayIds = event.days.length === 1 ? [event.days[0].id] : [...new Set(admissibleDayIds)];
    if (dayIds.length === 0 || !dayIds.every((id) => event.days.some((d) => d.id === id))) {
      throw new AppError('TICKET_INVALID', '입장할 수 있는 날을 골라 주세요.', { field: 'admissibleDayIds' });
    }
    const today = this.todayIso();
    const notPast = event.days.some((d) => dayIds.includes(d.id) && d.date >= today);

    const image = await this.prisma.ticketImage.findUnique({ where: { verificationId } });
    const recognition = await this.recognizer.recognize({
      image: image?.data ? Buffer.from(image.data) : Buffer.alloc(0),
      eventName: event.name,
      claimedNumber: number,
    });
    const hash = this.hashReservation(event.id, number);
    const owner = await this.prisma.ticketHash.findUnique({ where: { hash }, include: { verification: true } });
    const usedElsewhere = !!owner && owner.verification.userId !== userId;
    const checks = { sameEvent: recognition.sameEvent, notPast, notUsedElsewhere: !usedElsewhere };

    const failReason: TicketFailReason | null = !recognition.readable
      ? 'UNREADABLE'
      : !recognition.sameEvent || !notPast
        ? 'WRONG_EVENT'
        : null;
    const reviewReason = usedElsewhere
      ? 'DUPLICATE_SUSPECT'
      : !recognition.confident
        ? 'LOW_CONFIDENCE'
        : this.random() * 100 < (await this.policy.getNumber('TICKET_REVIEW_SAMPLE_PERCENT'))
          ? 'RANDOM'
          : null;

    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.state.transition(tx, verificationId, 'UPLOADED', 'CONFIRMED', {
        reservationHash: hash,
        admissibleDayIds: dayIds,
      });
      if (failReason) {
        await this.state.transition(tx, verificationId, 'CONFIRMED', 'FAILED', { failReason });
        return 'FAILED' as const;
      }
      if (reviewReason) {
        await this.state.transition(tx, verificationId, 'CONFIRMED', 'REVIEW_PENDING', { reviewReason });
        return 'REVIEW_PENDING' as const;
      }
      await this.state.transition(tx, verificationId, 'CONFIRMED', 'VERIFIED');
      // 내 예전 인증이 같은 번호를 갖고 있었다면 이번 인증으로 옮깁니다.
      await tx.ticketHash.upsert({ where: { hash }, update: { verificationId }, create: { hash, verificationId } });
      return 'VERIFIED' as const;
    });
    // 인증이 끝났으면 신뢰 단계(3단계)에 반영됩니다.
    if (outcome === 'VERIFIED') await this.trust.recompute(userId);
    return { status: outcome, failReason, checks };
  }

  /** 티켓이 필요 없는 행사의 '참석 예정' */
  async planWithoutTicket(userId: string, eventId: string) {
    const event = await this.visibleEvent(eventId);
    if (event.ticketRequired) {
      throw new AppError('PLAN_NOT_ALLOWED', '티켓이 필요한 행사는 티켓 인증을 해 주세요.');
    }
    await this.prisma.attendancePlan.upsert({
      where: { userId_eventId: { userId, eventId } },
      update: {},
      create: { userId, eventId },
    });
    await this.trust.recompute(userId); // 참석 예정은 신뢰 단계(2단계)에 반영됩니다.
    return this.myStatus(userId, eventId);
  }
}
