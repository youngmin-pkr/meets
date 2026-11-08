import { Inject, Injectable } from '@nestjs/common';
import {
  AVATAR_COLORS,
  proposalExpiresAt,
  type AppointmentStatus,
  type AppointmentView,
  type Counterpart,
  type ProposalInput,
  type ProposalStatus,
  type ProposalView,
} from '@meets/shared';
import { AppError } from '../common/app-error';
import { CLOCK, type Clock } from '../common/clock';
import type { Prisma } from '../generated/prisma/client';
import { MatchingService } from '../matching/matching.service';
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
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** 만료 시각이 지난 제안을 '만료'로 바꿉니다. (조회·수락할 때마다 먼저 처리) */
  async expireDue(where: Prisma.ProposalWhereInput = {}) {
    const due = await this.prisma.proposal.findMany({
      where: { ...where, status: { in: ['SENT'] }, expiresAt: { lte: this.clock.now() } },
      select: { id: true },
    });
    for (const p of due) {
      await this.prisma.$transaction((tx) => this.state.transition(tx, p.id, 'SENT', 'EXPIRED')).catch(() => undefined);
    }
    // TODO(4단계): 보낸 사람에게 만료 안내를 보냅니다.
    return due.length;
  }

  /** 제안을 보내거나 받을 수 있는지: 티켓 인증, 또는 티켓이 필요 없는 행사의 '참석 예정' */
  private async gradeFor(userId: string, eventId: string) {
    const s = await this.tickets.myStatus(userId, eventId);
    return s.grade;
  }

  private toView(p: ProposalRow, me: string): ProposalView {
    const received = p.receiverId === me;
    return {
      id: p.id,
      direction: received ? 'RECEIVED' : 'SENT',
      status: p.status as ProposalStatus,
      counterpart: counterpart(received ? p.sender : p.receiver),
      event: { id: p.event.id, name: p.event.name },
      day: { id: p.eventDay.id, date: p.eventDay.date },
      segments: p.eventDay.segments
        .filter((s) => p.segmentIds.includes(s.id))
        .map((s) => ({ id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime })),
      meetingSpot: { id: p.meetingSpot.id, name: p.meetingSpot.name },
      expiresAt: p.expiresAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
    };
  }

  async send(senderId: string, eventId: string, input: ProposalInput): Promise<ProposalView> {
    if (input.receiverId === senderId) throw new AppError('PROPOSAL_INVALID', '나에게는 제안할 수 없어요.');

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

    // 3) 고른 날·구간은 둘이 같이할 수 있는 시간 안이어야 함
    const overlap = mine.overlaps.find((o) => o.eventDayId === input.eventDayId);
    if (!overlap) throw new AppError('PROPOSAL_INVALID', '함께할 수 있는 날을 골라 주세요.', { field: 'eventDayId' });
    const day = await this.prisma.eventDay.findUniqueOrThrow({ where: { id: input.eventDayId }, include: { segments: true } });
    const segIds = [...new Set(input.segmentIds)];
    if (day.segments.length > 0) {
      if (segIds.length === 0 || !segIds.every((id) => overlap.segmentIds.includes(id))) {
        throw new AppError('PROPOSAL_INVALID', '둘 다 같이하기로 한 구간 중에서 골라 주세요.', { field: 'segmentIds' });
      }
    } else if (segIds.length > 0) {
      throw new AppError('PROPOSAL_INVALID', '이 날은 구간이 없어요.', { field: 'segmentIds' });
    }

    // 4) 만날 장소는 운영팀이 정한 공개된 장소만 (정리문서 4장 MeetingSpot)
    const spot = await this.prisma.meetingSpot.findFirst({ where: { id: input.meetingSpotId, eventId, isPublicPlace: true } });
    if (!spot) throw new AppError('PROPOSAL_INVALID', '공개된 만날 장소를 골라 주세요.', { field: 'meetingSpotId' });

    // 5) 만료 시각: 24시간, 행사 24시간 전이 더 빠르면 그때까지 (정책 값 2)
    const p = await this.policy.getNumbers(['PROPOSAL_EXPIRE_HOURS', 'PROPOSAL_EVENT_CUTOFF_HOURS']);
    const expiresAt = proposalExpiresAt(this.clock.now(), day, {
      expireHours: p.PROPOSAL_EXPIRE_HOURS,
      eventCutoffHours: p.PROPOSAL_EVENT_CUTOFF_HOURS,
    });
    if (!expiresAt) {
      throw new AppError('PROPOSAL_TOO_LATE', `행사 ${p.PROPOSAL_EVENT_CUTOFF_HOURS}시간 전부터는 제안할 수 없어요.`);
    }

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

    const created = await this.prisma.$transaction((tx) =>
      this.state.createSent(tx, {
        senderId,
        receiverId: input.receiverId,
        eventId,
        eventDayId: input.eventDayId,
        segmentIds: segIds,
        meetingSpotId: spot.id,
        expiresAt,
      }),
    );
    // TODO(4단계): 받는 사람에게 '제안 도착' 알림 (만료까지 응답 기한 표시)
    const row = await this.prisma.proposal.findUniqueOrThrow({ where: { id: created.id }, include: proposalInclude });
    return this.toView(row, senderId);
  }

  async list(userId: string): Promise<ProposalView[]> {
    await this.expireDue({ OR: [{ senderId: userId }, { receiverId: userId }] });
    const rows = await this.prisma.proposal.findMany({
      where: { OR: [{ senderId: userId }, { receiverId: userId }] },
      include: proposalInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.toView(r, userId));
  }

  private async mine(userId: string, id: string, role: 'sender' | 'receiver') {
    await this.expireDue({ id });
    const p = await this.prisma.proposal.findUnique({ where: { id } });
    const ok = p && (role === 'sender' ? p.senderId === userId : p.receiverId === userId);
    if (!p || !ok) throw new AppError('NOT_FOUND', '제안을 찾을 수 없어요.');
    if (p.status !== 'SENT') {
      throw new AppError('PROPOSAL_STATE', p.status === 'EXPIRED' ? '답할 수 있는 시간이 지났어요.' : '이미 처리된 제안이에요.', {
        status: p.status,
      });
    }
    return p;
  }

  /** 수락하면 약속이 만들어집니다. (확정 대기) */
  async accept(userId: string, id: string): Promise<AppointmentView> {
    const p = await this.mine(userId, id, 'receiver');
    // 받는 사람도 인증(또는 참석 예정)을 마쳐야 수락할 수 있습니다.
    if (!(await this.gradeFor(userId, p.eventId))) {
      throw new AppError('PROPOSAL_NEEDS_TICKET', '같은 행사 티켓 인증을 마친 뒤 수락할 수 있어요.');
    }
    // 그사이 조건이 바뀌어 더 이상 맞지 않거나, 제안한 날·구간에 함께할 수 없게 되었으면 수락하지 않습니다.
    const still = await this.matching.candidateDetail(p.senderId, p.eventId, userId).catch(() => null);
    const ov = still?.overlaps.find((o) => o.eventDayId === p.eventDayId);
    if (!ov || !p.segmentIds.every((id) => ov.segmentIds.includes(id))) {
      throw new AppError('PROPOSAL_INVALID', '그사이 일정이나 조건이 바뀌어 이 제안은 수락할 수 없어요.');
    }
    const appointment = await this.prisma.$transaction(async (tx) => {
      await this.state.transition(tx, id, 'SENT', 'ACCEPTED');
      return this.state.createAppointment(tx, p);
    });
    // TODO(4단계): 보낸 사람에게 '수락' 알림
    return (await this.appointments(userId)).find((a) => a.id === appointment.id)!;
  }

  async reject(userId: string, id: string) {
    await this.mine(userId, id, 'receiver');
    await this.prisma.$transaction((tx) => this.state.transition(tx, id, 'SENT', 'REJECTED'));
    // TODO(4단계): 보낸 사람에게 '거절' 알림
    return { id, status: 'REJECTED' as const };
  }

  async cancel(userId: string, id: string) {
    await this.mine(userId, id, 'sender');
    await this.prisma.$transaction((tx) => this.state.transition(tx, id, 'SENT', 'CANCELLED'));
    return { id, status: 'CANCELLED' as const };
  }

  async appointments(userId: string): Promise<AppointmentView[]> {
    const rows = await this.prisma.appointment.findMany({
      where: { participants: { some: { userId } } },
      include: {
        participants: { include: { user: userPublic } },
        event: { select: { id: true, name: true } },
        eventDay: { include: { segments: { orderBy: { sortOrder: 'asc' } } } },
        meetingSpot: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((a) => ({
      id: a.id,
      status: a.status as AppointmentStatus,
      counterpart: counterpart(a.participants.find((x) => x.userId !== userId)!.user),
      event: { id: a.event.id, name: a.event.name },
      day: { id: a.eventDay.id, date: a.eventDay.date, startTime: a.eventDay.startTime },
      segments: a.eventDay.segments
        .filter((s) => a.segmentIds.includes(s.id))
        .map((s) => ({ id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime })),
      meetingSpot: { id: a.meetingSpot.id, name: a.meetingSpot.name },
      createdAt: a.createdAt.toISOString(),
    }));
  }
}
