import { Inject, Injectable } from '@nestjs/common';
import {
  appointmentWindow,
  AVATAR_COLORS,
  formatSeoulShort,
  groupName,
  proposalExpiresAt,
  rangeOf,
  type AppointmentView,
  type Counterpart,
  type ProposalInput,
  type ProposalStatus,
  type ProposalView,
} from '@meets/shared';
import { AppointmentsService } from '../appointments/appointments.service';
import { AppError } from '../common/app-error';
import { CLOCK, type Clock } from '../common/clock';
import type { Prisma } from '../generated/prisma/client';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { ProposalStateService } from './proposal-state.service';

const userPublic = { select: { id: true, nickname: true, avatarInitial: true, avatarColor: true } } as const;
type PublicUser = { id: string; nickname: string | null; avatarInitial: string | null; avatarColor: string | null };

function counterpart(u: PublicUser): Counterpart {
  return {
    userId: u.id,
    nickname: u.nickname ?? '',
    avatarInitial: u.avatarInitial ?? '',
    avatarColor: AVATAR_COLORS[(u.avatarColor ?? 'ink') as keyof typeof AVATAR_COLORS] ?? AVATAR_COLORS.ink,
  };
}

const proposalInclude = {
  sender: userPublic,
  receiver: userPublic,
  event: { select: { id: true, name: true } },
  eventDay: { include: { segments: { orderBy: { sortOrder: 'asc' } } } },
  meetingSpot: { select: { id: true, name: true } },
  senderParty: { select: { id: true, status: true, members: { where: { active: true }, orderBy: { joinedAt: 'asc' as const }, include: { user: userPublic } } } },
  consents: { select: { userId: true, agreedAt: true, user: userPublic } },
} satisfies Prisma.ProposalInclude;

type ProposalRow = Prisma.ProposalGetPayload<{ include: typeof proposalInclude }>;

/** 제안 보내기·받기·수락·거절·취소·만료 */
@Injectable()
export class ProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly state: ProposalStateService,
    private readonly matching: MatchingService,
    private readonly tickets: TicketsService,
    private readonly appointments: AppointmentsService,
    private readonly notifications: NotificationsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** 만료 시각이 지난 제안을 '만료'로 바꿉니다. (조회·수락할 때마다 먼저 처리) */
  async expireDue(where: Prisma.ProposalWhereInput = {}) {
    const due = await this.prisma.proposal.findMany({
      where: { ...where, status: { in: ['DRAFT', 'SENT'] }, expiresAt: { lte: this.clock.now() } },
      select: { id: true },
    });
    for (const p of due) {
      const row = await this.prisma.proposal.findUnique({ where: { id: p.id }, select: { status: true } });
      if (row) await this.prisma.$transaction((tx) => this.state.transition(tx, p.id, row.status as ProposalStatus, 'EXPIRED')).catch(() => undefined);
    }
    return due.length;
  }

  /** 신고 조치로 '기능 제한' 중이면 제안을 보내거나 수락할 수 없습니다. (채팅·열람은 허용) */
  async assertNotRestricted(userId: string) {
    const r = await this.prisma.userRestriction.findFirst({
      where: { userId, kind: 'PROPOSALS', endsAt: { gt: this.clock.now() } },
      orderBy: { endsAt: 'desc' },
    });
    if (r) throw new AppError('RESTRICTED', `운영 안내에 따라 ${formatSeoulShort(r.endsAt)}까지 제안을 보내거나 수락할 수 없어요.`);
  }

  /** 제안을 보내거나 받을 수 있는지: 티켓 인증, 또는 티켓이 필요 없는 행사의 '참석 예정' */
  private async gradeFor(userId: string, eventId: string) {
    const s = await this.tickets.myStatus(userId, eventId);
    return s.grade;
  }

  private toView(p: ProposalRow, me: string): ProposalView {
    const received = p.receiverId === me;
    const party = p.senderParty;
    // 제안을 만든 사람을 맨 앞에 둡니다.
    const members = party ? [...party.members].sort((x, y) => Number(y.userId === p.senderId) - Number(x.userId === p.senderId)) : [];
    const inParty = !!party && party.members.some((m) => m.userId === me);
    const status = p.status as ProposalStatus;
    const mineConsent = p.consents.find((c) => c.userId === me);
    return {
      id: p.id,
      direction: received ? 'RECEIVED' : 'SENT',
      status,
      counterpart: counterpart(received ? p.sender : p.receiver),
      event: { id: p.event.id, name: p.event.name },
      // 행사 일정이 바뀌어 날·장소가 없어져도, 제안할 때 저장해 둔 값으로 보여 줍니다.
      day: { id: p.eventDayId, date: p.eventDay?.date ?? p.date },
      segments: p.eventDay
        ? p.eventDay.segments
            .filter((s) => p.segmentIds.includes(s.id))
            .map((s) => ({ id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime }))
        : (p.segmentsSnapshot as unknown as ProposalView['segments']),
      meetingSpot: { id: p.meetingSpotId, name: p.meetingSpot?.name ?? p.meetingSpotName },
      expiresAt: p.expiresAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
      party: party ? { id: party.id, members: members.map((m) => counterpart(m.user)) } : null,
      consent:
        status === 'DRAFT' && inParty
          ? {
              agreed: 1 + p.consents.filter((c) => !!c.agreedAt).length,
              total: 1 + p.consents.length,
              members: [
                ...members.filter((m) => m.userId === p.senderId).map((m) => ({ userId: m.userId, nickname: m.user.nickname ?? '', agreed: true, isMe: m.userId === me })),
                ...p.consents.map((c) => ({ userId: c.userId, nickname: c.user.nickname ?? '', agreed: !!c.agreedAt, isMe: c.userId === me })),
              ],
              needsMyAgreement: !!mineConsent && !mineConsent.agreedAt,
            }
          : null,
      canCancel: (status === 'DRAFT' || status === 'SENT') && (p.senderId === me || inParty),
    };
  }

  /** 제안한 날·구간·장소가 맞는지 검사하고 저장할 값을 만듭니다. (개인 제안과 일행 제안이 함께 씀) */
  async prepareSchedule(eventId: string, overlaps: Array<{ eventDayId: string; segmentIds: string[] }>, input: ProposalInput) {
    // 고른 날·구간은 같이할 수 있는 시간 안이어야 함
    const overlap = overlaps.find((o) => o.eventDayId === input.eventDayId);
    if (!overlap) throw new AppError('PROPOSAL_INVALID', '함께할 수 있는 날을 골라 주세요.', { field: 'eventDayId' });
    const day = await this.prisma.eventDay.findUniqueOrThrow({ where: { id: input.eventDayId }, include: { segments: true } });
    const segIds = [...new Set(input.segmentIds)];
    if (day.segments.length > 0) {
      if (segIds.length === 0 || !segIds.every((id) => overlap.segmentIds.includes(id))) {
        throw new AppError('PROPOSAL_INVALID', '모두 같이하기로 한 구간 중에서 골라 주세요.', { field: 'segmentIds' });
      }
    } else if (segIds.length > 0) {
      throw new AppError('PROPOSAL_INVALID', '이 날은 구간이 없어요.', { field: 'segmentIds' });
    }
    // 만날 장소는 운영팀이 정한 공개된 장소만 (정리문서 4장 MeetingSpot)
    const spot = await this.prisma.meetingSpot.findFirst({ where: { id: input.meetingSpotId, eventId, isPublicPlace: true } });
    if (!spot) throw new AppError('PROPOSAL_INVALID', '공개된 만날 장소를 골라 주세요.', { field: 'meetingSpotId' });
    // 만료 시각: 24시간, 행사 24시간 전이 더 빠르면 그때까지 (정책 값 2)
    const p = await this.policy.getNumbers(['PROPOSAL_EXPIRE_HOURS', 'PROPOSAL_EVENT_CUTOFF_HOURS']);
    const expiresAt = proposalExpiresAt(this.clock.now(), day, { expireHours: p.PROPOSAL_EXPIRE_HOURS, eventCutoffHours: p.PROPOSAL_EVENT_CUTOFF_HOURS });
    if (!expiresAt) throw new AppError('PROPOSAL_TOO_LATE', `행사 ${p.PROPOSAL_EVENT_CUTOFF_HOURS}시간 전부터는 제안할 수 없어요.`);
    const segments = day.segments.filter((s) => segIds.includes(s.id)).sort((a, b) => a.sortOrder - b.sortOrder);
    const window = appointmentWindow(day, segments);
    return {
      day,
      segIds,
      spot,
      expiresAt,
      segments,
      range: rangeOf(day.date, window.startTime, window.endTime),
      snapshot: segments.map((s) => ({ id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime })),
    };
  }

  async send(senderId: string, eventId: string, input: ProposalInput): Promise<ProposalView> {
    if (input.receiverId === senderId) throw new AppError('PROPOSAL_INVALID', '나에게는 제안할 수 없어요.');
    await this.assertNotRestricted(senderId);

    // 1) 제안 보내기는 인증 후에만 (정리문서 2장)
    const grade = await this.gradeFor(senderId, eventId);
    if (!grade) throw new AppError('PROPOSAL_NEEDS_TICKET', '같은 행사 티켓 인증을 마친 뒤 제안할 수 있어요.');
    if (grade === 'PLANNED') {
      const max = await this.policy.getNumber('PROPOSAL_PLANNED_MAX_SEGMENTS');
      if (input.segmentIds.length > max) {
        throw new AppError('PROPOSAL_INVALID', `'참석 예정'일 때는 구간을 ${max}개까지 제안할 수 있어요.`, { field: 'segmentIds', max });
      }
    }

    // 2) 받는 사람이 내 후보여야 함 — 후보 목록과 같은 규칙.
    //    안전 조건(나이·성별)은 매칭에서 이미 양쪽 모두 확인하고, 상대의 약속 조건은 받는 사람이 보고 판단합니다.
    const mine = await this.matching.candidateDetail(senderId, eventId, input.receiverId);

    // 3~5) 고른 날·구간·장소와 만료 시각
    const prep = await this.prepareSchedule(eventId, mine.overlaps, input);
    const { day, segIds, spot, expiresAt } = prep;

    // 6) 같은 두 사람 사이에 이 행사로 답을 기다리는 제안이 있으면 새로 보내지 않음
    const pair = {
      eventId,
      OR: [
        { senderId, receiverId: input.receiverId },
        { senderId: input.receiverId, receiverId: senderId },
      ],
    };
    await this.expireDue(pair);
    const pending = await this.prisma.proposal.findFirst({ where: { ...pair, status: { in: ['SENT'] } } });
    if (pending) {
      throw new AppError(
        'PROPOSAL_EXISTS',
        pending.senderId === senderId ? '이미 보낸 제안이 있어요.' : '상대가 보낸 제안이 와 있어요. 받은 제안에서 답해 주세요.',
      );
    }
    const accepted = await this.prisma.appointment.findFirst({
      where: { eventDayId: input.eventDayId, proposal: pair, status: { notIn: ['CANCELLED', 'AUTO_ENDED'] } },
    });
    if (accepted) throw new AppError('PROPOSAL_EXISTS', '이 날 이미 약속이 있어요.');

    // 7) 내 다른 약속과 시간이 겹치면 보내지 않음 (2026-11-08 사용자 확인)
    if (await this.appointments.findOverlap(senderId, prep.range)) {
      throw new AppError('APPOINTMENT_OVERLAP', '그 시간에 이미 다른 약속이 있어요.');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const proposal = await this.state.createSent(tx, {
        senderId,
        receiverId: input.receiverId,
        eventId,
        eventDayId: input.eventDayId,
        segmentIds: segIds,
        meetingSpotId: spot.id,
        date: day.date,
        segmentsSnapshot: prep.snapshot,
        meetingSpotName: spot.name,
        expiresAt,
      });
      const sender = await tx.user.findUniqueOrThrow({ where: { id: senderId }, select: { nickname: true } });
      const event = await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true } });
      // 받는 사람에게 '제안 도착' 알림 (만료까지 응답 기한 표시)
      await this.notifications.notify(
        tx,
        input.receiverId,
        'PROPOSAL_RECEIVED',
        { nickname: sender.nickname ?? '', eventName: event.name, deadline: formatSeoulShort(expiresAt) },
        { proposalId: proposal.id },
      );
      return proposal;
    });
    const row = await this.prisma.proposal.findUniqueOrThrow({ where: { id: created.id }, include: proposalInclude });
    return this.toView(row, senderId);
  }

  /** 제안 하나 (내가 보낸 쪽이거나 받는 쪽일 때) */
  async view(userId: string, id: string): Promise<ProposalView> {
    await this.expireDue({ id });
    const row = await this.prisma.proposal.findUnique({ where: { id }, include: proposalInclude });
    const inParty = !!row?.senderParty?.members.some((m) => m.userId === userId);
    if (!row || !(row.senderId === userId || inParty || (row.receiverId === userId && row.status !== 'DRAFT'))) throw new AppError('NOT_FOUND', '제안을 찾을 수 없어요.');
    return this.toView(row, userId);
  }

  async list(userId: string): Promise<ProposalView[]> {
    const mineWhere: Prisma.ProposalWhereInput = {
      OR: [
        { senderId: userId },
        // 일행 제안 초안은 받는 사람에게 보이지 않습니다.
        { receiverId: userId, NOT: { status: { equals: 'DRAFT' } } },
        { senderParty: { members: { some: { userId, active: true } } } },
      ],
    };
    await this.expireDue(mineWhere);
    const rows = await this.prisma.proposal.findMany({
      where: mineWhere,
      include: proposalInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.toView(r, userId));
  }

  /** 보낸 쪽 사람들: 일행이 보낸 제안이면 일행 전원, 아니면 보낸 사람 */
  private async senderSide(p: { senderId: string; senderPartyId: string | null }): Promise<string[]> {
    if (!p.senderPartyId) return [p.senderId];
    const members = await this.prisma.partyMember.findMany({ where: { partyId: p.senderPartyId, active: true }, orderBy: { joinedAt: 'asc' }, select: { userId: true } });
    const ids = members.map((m) => m.userId);
    // 제안을 만든 사람을 맨 앞에 둡니다.
    return [...ids].sort((x, y) => Number(y === p.senderId) - Number(x === p.senderId));
  }

  private async mine(userId: string, id: string, role: 'sender' | 'receiver', allowed: ProposalStatus[] = ['SENT']) {
    await this.expireDue({ id });
    const p = await this.prisma.proposal.findUnique({ where: { id } });
    // 일행이 보낸 제안은 일행원 누구나 '보낸 쪽'입니다. 초안은 받는 사람에게 없는 제안입니다.
    const ok = p && (role === 'sender' ? (await this.senderSide(p)).includes(userId) || p.senderId === userId : p.receiverId === userId && p.status !== 'DRAFT');
    if (!p || !ok) throw new AppError('NOT_FOUND', '제안을 찾을 수 없어요.');
    if (!allowed.includes(p.status as ProposalStatus)) {
      throw new AppError('PROPOSAL_STATE', p.status === 'EXPIRED' ? '답할 수 있는 시간이 지났어요.' : '이미 처리된 제안이에요.', {
        status: p.status,
      });
    }
    return p;
  }

  /** 수락하면 약속이 만들어집니다. (확정 대기) */
  async accept(userId: string, id: string): Promise<AppointmentView> {
    const p = await this.mine(userId, id, 'receiver');
    await this.assertNotRestricted(userId);
    // 받는 사람도 인증(또는 참석 예정)을 마쳐야 수락할 수 있습니다.
    if (!(await this.gradeFor(userId, p.eventId))) {
      throw new AppError('PROPOSAL_NEEDS_TICKET', '같은 행사 티켓 인증을 마친 뒤 수락할 수 있어요.');
    }
    // 그사이 조건이 바뀌어 더 이상 맞지 않거나, 제안한 날·구간에 함께할 수 없게 되었으면 수락하지 않습니다.
    const senders = await this.senderSide(p);
    const still = await (p.senderPartyId
      ? this.matching.partyCandidateDetail(`party:${p.senderPartyId}`, senders, p.eventId, userId)
      : this.matching.candidateDetail(p.senderId, p.eventId, userId)
    ).catch(() => null);
    const ov = still?.overlaps.find((o) => o.eventDayId === p.eventDayId);
    if (!ov || !p.segmentIds.every((id) => ov.segmentIds.includes(id))) {
      throw new AppError('PROPOSAL_INVALID', '그사이 일정이나 조건이 바뀌어 이 제안은 수락할 수 없어요.');
    }
    // 약속한 날이 행사에서 없어졌으면 수락할 수 없습니다.
    const day = p.eventDayId
      ? await this.prisma.eventDay.findUnique({ where: { id: p.eventDayId }, include: { segments: { orderBy: { sortOrder: 'asc' } } } })
      : null;
    const spot = p.meetingSpotId ? await this.prisma.meetingSpot.findUnique({ where: { id: p.meetingSpotId } }) : null;
    if (!day || !spot) throw new AppError('PROPOSAL_INVALID', '그사이 일정이나 조건이 바뀌어 이 제안은 수락할 수 없어요.');
    const segments = day.segments
      .filter((s) => p.segmentIds.includes(s.id))
      .map((s) => ({ id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime }));
    const schedule = { date: day.date, ...appointmentWindow(day, segments), segments };

    // 시간이 겹치는 약속은 만들지 않습니다. (2026-11-08 사용자 확인)
    const range = rangeOf(schedule.date, schedule.startTime, schedule.endTime);
    if (await this.appointments.findOverlap(userId, range)) {
      throw new AppError('APPOINTMENT_OVERLAP', '그 시간에 이미 다른 약속이 있어요.');
    }
    for (const sid of senders) {
      if (await this.appointments.findOverlap(sid, range)) {
        throw new AppError('APPOINTMENT_OVERLAP', '상대에게 그 시간에 다른 약속이 생겨서 지금은 수락할 수 없어요.');
      }
    }

    const appointment = await this.prisma.$transaction(async (tx) => {
      await this.state.transition(tx, id, 'SENT', 'ACCEPTED');
      const created = await this.appointments.createFromProposal(
        tx,
        { id: p.id, eventId: p.eventId, eventDayId: day.id, meetingSpotId: spot.id, senderId: p.senderId, receiverId: p.receiverId },
        schedule,
        spot.name,
        // 일행이 보낸 제안이면 일행 전원이 보낸 쪽(A), 받은 사람이 받은 쪽(B)으로 약속에 함께합니다.
        [...senders.map((u) => ({ userId: u, side: 'A' as const })), { userId: p.receiverId, side: 'B' as const }],
      );
      await this.notifyResult(tx, p, senders, userId, 'PROPOSAL_ACCEPTED', created.id);
      return created;
    });
    return this.appointments.get(userId, appointment.id);
  }

  /** 보낸 사람에게 수락·거절 결과 알림 */
  private async notifyResult(
    tx: Prisma.TransactionClient,
    p: { id: string; senderId: string; eventId: string },
    senders: string[],
    receiverId: string,
    kind: 'PROPOSAL_ACCEPTED' | 'PROPOSAL_REJECTED',
    appointmentId?: string,
  ) {
    const receiver = await tx.user.findUniqueOrThrow({ where: { id: receiverId }, select: { nickname: true } });
    const event = await tx.event.findUniqueOrThrow({ where: { id: p.eventId }, select: { name: true } });
    for (const sid of senders) {
      await this.notifications.notify(
        tx,
        sid,
        kind,
        { nickname: receiver.nickname ?? '', eventName: event.name },
        appointmentId ? { appointmentId } : { proposalId: p.id },
      );
    }
  }

  async reject(userId: string, id: string) {
    const p = await this.mine(userId, id, 'receiver');
    await this.prisma.$transaction(async (tx) => {
      await this.state.transition(tx, id, 'SENT', 'REJECTED');
      await this.notifyResult(tx, p, await this.senderSide(p), userId, 'PROPOSAL_REJECTED');
    });
    return { id, status: 'REJECTED' as const };
  }

  async cancel(userId: string, id: string) {
    const p = await this.mine(userId, id, 'sender', ['DRAFT', 'SENT']);
    await this.prisma.$transaction((tx) => this.state.transition(tx, id, p.status as ProposalStatus, 'CANCELLED'));
    return { id, status: 'CANCELLED' as const };
  }
}
