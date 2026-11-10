import { Inject, Injectable } from '@nestjs/common';
import {
  LIVE_PARTY_STATUSES,
  formatSeoulShort,
  groupName,
  isInputDone,
  proposalExpiresAt,
  type ProposalInput,
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
import { ProposalStateService } from '../proposals/proposal-state.service';
import { ProposalsService } from '../proposals/proposals.service';

/**
 * 일행 제안 (정리문서 2장 일행: 전원이 동의해야 제안이 나감, 5장 일행·제안 상태)
 * - 일행원 한 명이 초안을 만들면 나머지 전원이 동의해야 제안이 나가고, 그때 일행이 '제안 중'이 됩니다.
 * - 한 명이라도 동의하지 않거나 시간이 지나면 초안이 취소·만료됩니다.
 * - 초안이나 제안을 보내는 동안 일행원이 빠져도 남은 사람끼리 계속하고, 한 명만 남아 일행이 풀리면 초안은 취소되고 보낸 제안은 개인 제안으로 바뀝니다.
 * 제안과 일행의 상태는 각 상태 모듈(ProposalStateService, PartyStateService)에서만 바꿉니다.
 */
@Injectable()
export class PartyProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly state: ProposalStateService,
    private readonly proposals: ProposalsService,
    private readonly matching: MatchingService,
    private readonly appointments: AppointmentsService,
    private readonly notifications: NotificationsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** 일행의 초안·제안 중 시간이 지난 것을 만료 처리 */
  expireDue(partyId: string) {
    return this.proposals.expireDue({ senderPartyId: partyId });
  }

  /** 일행원이 초안을 만듭니다. 나머지 일행원에게 동의 요청이 갑니다. */
  async create(userId: string, partyId: string, input: ProposalInput): Promise<ProposalView> {
    await this.expireDue(partyId);
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, status: { in: LIVE_PARTY_STATUSES }, members: { some: { userId, active: true } } },
      include: { members: { where: { active: true }, orderBy: { joinedAt: 'asc' }, include: { user: { select: { id: true, nickname: true } } } }, event: { select: { id: true, name: true } } },
    });
    if (!party) throw new AppError('NOT_FOUND', '일행을 찾을 수 없어요.');
    const open = await this.prisma.proposal.findFirst({ where: { senderPartyId: partyId, status: { in: ['DRAFT', 'SENT'] } }, select: { id: true } });
    if (party.status === 'PROPOSING' || open) throw new AppError('PROPOSAL_EXISTS', '이미 진행 중인 일행 제안이 있어요. 끝난 뒤에 새로 만들 수 있어요.');
    if (party.status !== 'ACTIVE') throw new AppError('PARTY_NOT_READY', '일행 전원이 입력을 마쳐야 제안할 수 있어요.');

    const memberIds = party.members.map((m) => m.userId);
    if (input.receiverId === userId || memberIds.includes(input.receiverId)) throw new AppError('PROPOSAL_INVALID', '일행에게는 제안할 수 없어요.');
    // 일행 중 한 명이라도 제안 제한 중이면 보낼 수 없습니다. (누구인지는 알리지 않음)
    for (const id of memberIds) {
      await this.proposals.assertNotRestricted(id).catch(() => {
        throw new AppError('RESTRICTED', '일행 중 지금은 제안을 보낼 수 없는 분이 있어요.');
      });
    }
    // 전원이 입력(일정·스타일, 티켓 인증 또는 참석 예정)을 마쳐야 합니다.
    const facts = await this.matching.inputFacts(party.eventId, memberIds);
    if (!memberIds.every((id) => isInputDone(facts.get(id)!))) throw new AppError('PARTY_NOT_READY', '일행 전원이 입력을 마쳐야 제안할 수 있어요.');

    // 받는 사람은 일행의 후보여야 하고, 고른 날·구간은 일행 전원이 겹치는 시간 안이어야 합니다.
    const candidate = await this.matching.partyCandidateDetail(`party:${partyId}`, memberIds, party.eventId, input.receiverId);
    const prep = await this.proposals.prepareSchedule(party.eventId, candidate.overlaps, input);

    // 같은 사람과 이 행사로 답을 기다리는 제안이 일행 중 누구에게든 있으면 새로 만들지 않습니다.
    for (const id of memberIds) {
      const pair = { eventId: party.eventId, OR: [{ senderId: id, receiverId: input.receiverId }, { senderId: input.receiverId, receiverId: id }] };
      await this.proposals.expireDue(pair);
      const pending = await this.prisma.proposal.findFirst({ where: { ...pair, status: { in: ['DRAFT', 'SENT'] } }, select: { id: true } });
      if (pending) throw new AppError('PROPOSAL_EXISTS', '이미 이 분과 오가는 제안이 있어요.');
      const accepted = await this.prisma.appointment.findFirst({
        where: { eventDayId: input.eventDayId, proposal: pair, status: { notIn: ['CANCELLED', 'AUTO_ENDED'] } },
        select: { id: true },
      });
      if (accepted) throw new AppError('PROPOSAL_EXISTS', '이 날 이미 약속이 있어요.');
    }
    // 일행 중 누구라도 그 시간에 다른 약속이 있으면 보내지 않습니다.
    for (const id of memberIds) {
      if (await this.appointments.findOverlap(id, prep.range)) throw new AppError('APPOINTMENT_OVERLAP', '일행 중 그 시간에 이미 다른 약속이 있는 분이 있어요.');
    }

    const proposer = party.members.find((m) => m.userId === userId)!;
    const created = await this.prisma.$transaction(async (tx) => {
      const draft = await this.state.createDraft(tx, {
        senderId: userId,
        senderPartyId: partyId,
        receiverId: input.receiverId,
        eventId: party.eventId,
        eventDayId: input.eventDayId,
        segmentIds: prep.segIds,
        meetingSpotId: prep.spot.id,
        date: prep.day.date,
        segmentsSnapshot: prep.snapshot,
        meetingSpotName: prep.spot.name,
        expiresAt: prep.expiresAt,
      });
      for (const m of party.members.filter((x) => x.userId !== userId)) {
        await tx.proposalConsent.create({ data: { proposalId: draft.id, userId: m.userId } });
        await this.notifications.notify(tx, m.userId, 'PARTY_PROPOSAL_ASK', { nickname: proposer.user.nickname ?? '', eventName: party.event.name, deadline: formatSeoulShort(prep.expiresAt) }, { proposalId: draft.id });
      }
      return draft;
    });
    return this.proposals.view(userId, created.id);
  }

  /** 초안을 제안으로 내보냅니다. (전원이 동의했을 때. 같은 트랜잭션 안) */
  private async send(tx: Prisma.TransactionClient, proposalId: string) {
    const p = await tx.proposal.findUniqueOrThrow({
      where: { id: proposalId },
      include: {
        eventDay: { select: { date: true, startTime: true } },
        event: { select: { name: true } },
        senderParty: { select: { members: { where: { active: true }, orderBy: { joinedAt: 'asc' }, include: { user: { select: { id: true, nickname: true } } } } } },
      },
    });
    const pol = await this.policy.getNumbers(['PROPOSAL_EXPIRE_HOURS', 'PROPOSAL_EVENT_CUTOFF_HOURS']);
    // 나가는 시점부터 다시 24시간 (행사 24시간 전이 더 빠르면 그때까지)
    const expiresAt = p.eventDay ? proposalExpiresAt(this.clock.now(), p.eventDay, { expireHours: pol.PROPOSAL_EXPIRE_HOURS, eventCutoffHours: pol.PROPOSAL_EVENT_CUTOFF_HOURS }) : null;
    if (!expiresAt) {
      await this.state.transition(tx, p.id, 'DRAFT', 'CANCELLED');
      return false;
    }
    await this.state.transition(tx, p.id, 'DRAFT', 'SENT', { expiresAt });
    const members = [...(p.senderParty?.members ?? [])].sort((x, y) => Number(y.userId === p.senderId) - Number(x.userId === p.senderId));
    await this.notifications.notify(
      tx,
      p.receiverId,
      'PROPOSAL_RECEIVED',
      { nickname: groupName(members.map((m) => m.user.nickname ?? '')), eventName: p.event.name, deadline: formatSeoulShort(expiresAt) },
      { proposalId: p.id },
    );
    for (const m of members) {
      await this.notifications.notify(tx, m.userId, 'PARTY_PROPOSAL_SENT', { eventName: p.event.name, deadline: formatSeoulShort(expiresAt) }, { proposalId: p.id });
    }
    return true;
  }

  private async draftFor(userId: string, id: string) {
    await this.proposals.expireDue({ id });
    const p = await this.prisma.proposal.findUnique({ where: { id }, include: { consents: true } });
    const mine = p?.consents.find((c) => c.userId === userId);
    if (!p || !mine) throw new AppError('NOT_FOUND', '제안을 찾을 수 없어요.');
    if (p.status !== 'DRAFT') throw new AppError('PROPOSAL_STATE', p.status === 'EXPIRED' ? '동의할 수 있는 시간이 지났어요.' : '이미 처리된 제안이에요.', { status: p.status });
    return { p, mine };
  }

  /** 일행원이 동의합니다. 전원이 동의하면 제안이 나가고 일행이 '제안 중'이 됩니다. */
  async agree(userId: string, id: string): Promise<ProposalView> {
    const { p } = await this.draftFor(userId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Proposal" WHERE "id" = ${p.id} FOR UPDATE`;
      await tx.proposalConsent.updateMany({ where: { proposalId: p.id, userId, agreedAt: null }, data: { agreedAt: this.clock.now() } });
      const left = await tx.proposalConsent.count({ where: { proposalId: p.id, agreedAt: null } });
      if (left === 0) await this.send(tx, p.id);
    });
    return this.proposals.view(userId, id);
  }

  /** 일행원이 동의하지 않으면 초안이 취소됩니다. */
  async decline(userId: string, id: string) {
    const { p } = await this.draftFor(userId, id);
    await this.prisma.$transaction(async (tx) => {
      await this.state.transition(tx, p.id, 'DRAFT', 'CANCELLED');
      const [who, event, party] = await Promise.all([
        tx.user.findUniqueOrThrow({ where: { id: userId }, select: { nickname: true } }),
        tx.event.findUniqueOrThrow({ where: { id: p.eventId }, select: { name: true } }),
        tx.partyMember.findMany({ where: { partyId: p.senderPartyId!, active: true, userId: { not: userId } }, select: { userId: true } }),
      ]);
      for (const m of party) {
        await this.notifications.notify(tx, m.userId, 'PARTY_PROPOSAL_DECLINED', { nickname: who.nickname ?? '', eventName: event.name }, { proposalId: p.id });
      }
    });
    return { id, status: 'CANCELLED' as const };
  }

  // ───────────── 일행이 바뀔 때 (PartiesService가 부름) ─────────────

  /** 일행원이 빠졌습니다. 초안에서는 그 사람의 동의가 필요 없어지고, 남은 사람이 모두 동의했으면 제안이 나갑니다. */
  async onMemberLeft(partyId: string, userId: string) {
    const drafts = await this.prisma.proposal.findMany({ where: { senderPartyId: partyId, status: { equals: 'DRAFT' } }, select: { id: true } });
    for (const d of drafts) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Proposal" WHERE "id" = ${d.id} FOR UPDATE`;
        await tx.proposalConsent.deleteMany({ where: { proposalId: d.id, userId } });
        const waiting = await tx.proposalConsent.count({ where: { proposalId: d.id, agreedAt: null } });
        if (waiting === 0) await this.send(tx, d.id);
      }).catch((e) => {
        if (!(e instanceof AppError)) throw e;
      });
    }
  }

  /**
   * 일행이 풀렸습니다. 초안은 취소하고, 이미 보낸 제안은 남은 한 명이 있으면 그 사람의 개인 제안으로 바꾸고 없으면 취소합니다.
   */
  async onPartyEnded(partyId: string, remainingUserId: string | null) {
    const open = await this.prisma.proposal.findMany({ where: { senderPartyId: partyId, status: { in: ['DRAFT', 'SENT'] } }, select: { id: true, status: true } });
    for (const p of open) {
      await this.prisma.$transaction(async (tx) => {
        if (p.status === 'SENT' && remainingUserId) {
          await tx.proposal.update({ where: { id: p.id }, data: { senderId: remainingUserId, senderPartyId: null } });
        } else {
          await this.state.transition(tx, p.id, p.status as 'DRAFT' | 'SENT', 'CANCELLED');
        }
      }).catch((e) => {
        if (!(e instanceof AppError)) throw e;
      });
    }
  }
}
