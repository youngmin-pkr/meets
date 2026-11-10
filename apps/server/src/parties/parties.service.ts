import { Inject, Injectable } from '@nestjs/common';
import {
  AVATAR_COLORS,
  isInputDone,
  JOINABLE_PARTY_STATUSES,
  LIVE_PARTY_STATUSES,
  nextPartyStatus,
  PARTY_STATUS_LABELS,
  partyGuide,
  partyInviteExpiresAt,
  type CandidateDetail,
  type CandidatesResponse,
  type MatchOptions,
  type PartyInvitePreview,
  type PartySizePolicy,
  type PartyProposalView,
  type PartyStatus,
  type PartyView,
} from '@meets/shared';
import { isBlockedBetween } from '../blocks/block-queries';
import { AppError } from '../common/app-error';
import { CLOCK, type Clock } from '../common/clock';
import { signToken, verifyToken } from '../common/signed-token';
import { SERVER_CONFIG, type ServerConfig } from '../config';
import type { Prisma } from '../generated/prisma/client';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PolicyService } from '../policy/policy.service';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service';
import { PartyProposalsService } from './party-proposals.service';
import { PartyStateService } from './party-state.service';

const SCOPE = 'party';
const MS_HOUR = 60 * 60 * 1000;

const partyInclude = {
  event: { select: { id: true, name: true, status: true, days: { select: { date: true } } } },
  members: { where: { active: true }, orderBy: { joinedAt: 'asc' as const }, include: { user: { select: { id: true, nickname: true, avatarInitial: true, avatarColor: true, ageClass: true, status: true } } } },
} satisfies Prisma.PartyInclude;
type PartyRow = Prisma.PartyGetPayload<{ include: typeof partyInclude }>;

/**
 * 일행 (정리문서 2장 일행, 5장 일행 상태)
 * - 성인 2~4명. 초대 링크로 합류하고, 전원이 입력을 마치면 후보가 열립니다.
 * - 상태는 PartyStateService에서만 바꿉니다. 이 서비스는 상태를 '판단'(nextPartyStatus)해서 부르기만 합니다.
 * - 초대 링크·알림에는 별명과 행사 이름만 있고, 연락처는 없습니다.
 */
@Injectable()
export class PartiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly state: PartyStateService,
    private readonly matching: MatchingService,
    private readonly partyProposals: PartyProposalsService,
    private readonly notifications: NotificationsService,
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async size(): Promise<PartySizePolicy> {
    const p = await this.policy.getNumbers(['PARTY_MIN_SIZE', 'PARTY_MAX_SIZE']);
    return { minSize: p.PARTY_MIN_SIZE, maxSize: p.PARTY_MAX_SIZE };
  }

  // ───────────── 시간이 지나며 하는 일 ─────────────

  /** 일행 하나의 상태를 확인합니다. (행사가 끝났으면 풀고, 합류·입력·빠짐에 따라 상태를 옮김, 재촉은 1번만) */
  async evaluate(partyId: string) {
    const size = await this.size();
    const remindHours = await this.policy.getNumber('PARTY_INPUT_REMIND_HOURS');
    for (let guard = 0; guard < 4; guard++) {
      const p = await this.prisma.party.findUnique({ where: { id: partyId }, include: partyInclude });
      if (!p || p.status === 'DISBANDED') return;
      const now = this.clock.now();
      const facts = await this.matching.inputFacts(p.eventId, p.members.map((m) => m.userId));
      const ready = p.members.map((m) => isInputDone(facts.get(m.userId)!));

      // 행사가 취소되었거나 모든 날이 지났으면 일행도 풀립니다.
      const today = new Date(now.getTime() + 9 * MS_HOUR).toISOString().slice(0, 10);
      const eventOpen = ['REGISTERED', 'CHANGED'].includes(p.event.status) && p.event.days.some((d) => d.date >= today);
      const next = !eventOpen
        ? ({ to: 'DISBANDED' } as const)
        : nextPartyStatus(p.status, ready.map((r) => ({ ready: r })), size, now >= p.inviteExpiresAt);
      if (!next) {
        // 확인 중에 입력하지 않은 친구에게 재촉은 한 번만
        if (p.status === 'CONFIRMING') await this.remindOnce(p, ready, remindHours, now);
        return;
      }
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.state.transition(tx, p.id, p.status as PartyStatus, next.to);
          const others = p.members;
          if (next.to === 'DISBANDED') {
            await tx.partyMember.updateMany({ where: { partyId: p.id, active: true }, data: { active: false, leftAt: now } });
            for (const m of others) await this.notifications.notify(tx, m.userId, 'PARTY_DISBANDED', { eventName: p.event.name });
          } else if (next.to === 'ACTIVE') {
            for (const m of others) await this.notifications.notify(tx, m.userId, 'PARTY_READY', { eventName: p.event.name });
          }
        });
      } catch (error) {
        if (error instanceof AppError) return; // 동시에 다른 곳에서 바꿈
        throw error;
      }
      // 일행이 풀리면 진행 중인 초안·제안도 정리합니다. (한 명만 남았으면 그 사람의 개인 제안으로 이어짐)
      if (next.to === 'DISBANDED') await this.partyProposals.onPartyEnded(p.id, p.members.length === 1 ? p.members[0].userId : null);
    }
  }

  private async remindOnce(p: PartyRow, ready: boolean[], hours: number, now: Date) {
    for (const [i, m] of p.members.entries()) {
      if (ready[i] || m.remindedAt || now.getTime() < m.joinedAt.getTime() + hours * MS_HOUR) continue;
      await this.prisma.$transaction(async (tx) => {
        const done = await tx.partyMember.updateMany({ where: { id: m.id, remindedAt: null }, data: { remindedAt: now } });
        if (done.count === 1) await this.notifications.notify(tx, m.userId, 'PARTY_INPUT_REMIND', { eventName: p.event.name });
      });
    }
  }

  /** 1분마다: 끝나지 않은 일행 전부 확인 */
  async settleAll() {
    const rows = await this.prisma.party.findMany({ where: { status: { in: LIVE_PARTY_STATUSES } }, select: { id: true } });
    for (const r of rows) await this.evaluate(r.id);
  }

  // ───────────── 보기 ─────────────

  private async loadMine(userId: string, partyId: string): Promise<PartyRow> {
    await this.evaluate(partyId);
    const p = await this.prisma.party.findFirst({
      where: { id: partyId, status: { in: LIVE_PARTY_STATUSES }, members: { some: { userId, active: true } } },
      include: partyInclude,
    });
    if (!p) throw new AppError('NOT_FOUND', '일행을 찾을 수 없어요.');
    return p;
  }

  /** 이 일행이 보낸(보내려는) 제안 */
  private async proposalOf(partyId: string, me: string): Promise<PartyProposalView | null> {
    const p = await this.prisma.proposal.findFirst({
      where: { senderPartyId: partyId, status: { in: ['DRAFT', 'SENT'] } },
      include: {
        receiver: { select: { id: true, nickname: true, avatarInitial: true, avatarColor: true } },
        consents: { include: { user: { select: { nickname: true } } } },
        sender: { select: { nickname: true } },
        eventDay: { include: { segments: { orderBy: { sortOrder: 'asc' } } } },
      },
    });
    if (!p) return null;
    const mine = p.consents.find((c) => c.userId === me);
    return {
      id: p.id,
      status: p.status as 'DRAFT' | 'SENT',
      receiver: {
        userId: p.receiver.id,
        nickname: p.receiver.nickname ?? '',
        avatarInitial: p.receiver.avatarInitial ?? '',
        avatarColor: AVATAR_COLORS[(p.receiver.avatarColor ?? 'ink') as keyof typeof AVATAR_COLORS] ?? AVATAR_COLORS.ink,
      },
      date: p.eventDay?.date ?? p.date,
      segments: p.eventDay
        ? p.eventDay.segments.filter((s) => p.segmentIds.includes(s.id)).map((s) => ({ id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime }))
        : (p.segmentsSnapshot as unknown as PartyProposalView['segments']),
      meetingSpotName: p.meetingSpotName,
      expiresAt: p.expiresAt.toISOString(),
      agreements:
        p.status === 'DRAFT'
          ? [
              { userId: p.senderId, nickname: p.sender.nickname ?? '', agreed: true, isMe: p.senderId === me },
              ...p.consents.map((c) => ({ userId: c.userId, nickname: c.user.nickname ?? '', agreed: !!c.agreedAt, isMe: c.userId === me })),
            ]
          : [],
      needsMyAgreement: p.status === 'DRAFT' && !!mine && !mine.agreedAt,
      canCancel: true,
    };
  }

  private async view(p: PartyRow, me: string): Promise<PartyView> {
    const size = await this.size();
    const proposal = await this.proposalOf(p.id, me);
    const facts = await this.matching.inputFacts(p.eventId, p.members.map((m) => m.userId));
    const members = p.members.map((m) => ({
      userId: m.userId,
      nickname: m.user.nickname ?? '',
      avatarInitial: m.user.avatarInitial ?? '',
      avatarColor: AVATAR_COLORS[(m.user.avatarColor ?? 'ink') as keyof typeof AVATAR_COLORS] ?? AVATAR_COLORS.ink,
      isMe: m.userId === me,
      isLeader: m.userId === p.leaderId,
      ready: isInputDone(facts.get(m.userId)!),
    }));
    const isLeader = p.leaderId === me;
    const now = this.clock.now();
    const status = p.status as PartyStatus;
    const joinable = JOINABLE_PARTY_STATUSES.includes(status) && now < p.inviteExpiresAt && members.length < size.maxSize;
    const readyCount = members.filter((m) => m.ready).length;
    const notReady = members.filter((m) => !m.ready);
    return {
      id: p.id,
      event: { id: p.event.id, name: p.event.name },
      status,
      statusLabel: PARTY_STATUS_LABELS[status],
      members,
      minSize: size.minSize,
      maxSize: size.maxSize,
      proposal,
      invite: isLeader && joinable ? { url: `${this.config.publicBaseUrl}/party-invite/${signToken(this.config.ciHashSecret, SCOPE, p.id)}`, expiresAt: p.inviteExpiresAt.toISOString() } : null,
      guide: partyGuide({ status, isLeader, notReady: notReady.filter((m) => !m.isMe).map((m) => m.nickname), meNotReady: notReady.some((m) => m.isMe), memberCount: members.length, maxSize: size.maxSize }),
      actions: {
        proceedWithout: isLeader && status === 'CONFIRMING' && notReady.length > 0 && readyCount >= size.minSize,
        disband: isLeader,
        leave: true,
        candidates: status === 'ACTIVE',
        propose: status === 'ACTIVE' && !proposal,
      },
    };
  }

  async get(userId: string, partyId: string): Promise<PartyView> {
    await this.partyProposals.expireDue(partyId);
    return this.view(await this.loadMine(userId, partyId), userId);
  }

  async forEvent(userId: string, eventId: string): Promise<{ party: PartyView | null }> {
    const m = await this.prisma.partyMember.findFirst({ where: { userId, eventId, active: true }, select: { partyId: true } });
    if (!m) return { party: null };
    return { party: await this.get(userId, m.partyId).catch((e) => (e instanceof AppError && e.code === 'NOT_FOUND' ? null : Promise.reject(e))) };
  }

  async list(userId: string): Promise<PartyView[]> {
    const rows = await this.prisma.partyMember.findMany({ where: { userId, active: true, party: { status: { in: LIVE_PARTY_STATUSES } } }, select: { partyId: true } });
    const out: PartyView[] = [];
    for (const r of rows) {
      try {
        out.push(await this.get(userId, r.partyId));
      } catch (e) {
        if (!(e instanceof AppError && e.code === 'NOT_FOUND')) throw e;
      }
    }
    return out;
  }

  // ───────────── 만들기·합류 ─────────────

  /** 일행은 이용 중인 성인만 만들거나 합류할 수 있습니다. (청소년 그룹은 11단계) */
  private async assertAdult(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { ageClass: true, status: true, signupCompletedAt: true } });
    if (!u || u.status !== 'ACTIVE' || !u.signupCompletedAt || u.ageClass !== 'ADULT') {
      throw new AppError('PARTY_ADULT_ONLY', '일행은 가입을 마친 성인만 만들거나 합류할 수 있어요.');
    }
  }

  async create(userId: string, eventId: string): Promise<PartyView> {
    await this.assertAdult(userId);
    const today = new Date(this.clock.now().getTime() + 9 * MS_HOUR).toISOString().slice(0, 10);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, status: { in: ['REGISTERED', 'CHANGED'] }, days: { some: { date: { gte: today } } } },
      select: { id: true },
    });
    if (!event) throw new AppError('NOT_FOUND', '행사를 찾을 수 없어요.');
    const hours = await this.policy.getNumber('PARTY_INVITE_EXPIRE_HOURS');
    const now = this.clock.now();
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const p = await this.state.create(tx, { eventId, leaderId: userId, inviteExpiresAt: partyInviteExpiresAt(now, hours) });
        await tx.partyMember.create({ data: { partyId: p.id, eventId, userId, joinedAt: now } });
        return p;
      });
      return this.get(userId, created.id);
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError('PARTY_EXISTS', '이 행사에는 이미 일행이 있어요. 먼저 일행에서 빠지거나 해체해 주세요.');
      throw error;
    }
  }

  /** 초대 링크가 가리키는 일행. 서명이 틀렸거나 없는 일행이면 모두 같은 '열 수 없어요'. */
  private async byToken(token: string): Promise<PartyRow> {
    const id = verifyToken(this.config.ciHashSecret, SCOPE, token.slice(0, 200));
    const p = id ? await this.prisma.party.findUnique({ where: { id }, include: partyInclude }) : null;
    if (!p || p.status === 'DISBANDED') throw new AppError('INVITE_UNAVAILABLE', '열 수 없는 초대예요. 보낸 분께 새 링크를 부탁해 보세요.');
    return p;
  }

  async preview(userId: string, token: string): Promise<PartyInvitePreview> {
    const p = await this.byToken(token);
    // 일행 중 누군가와 차단 관계면 초대가 없는 것처럼 보입니다.
    for (const m of p.members) {
      if (m.userId !== userId && (await isBlockedBetween(this.prisma, userId, m.userId))) {
        throw new AppError('INVITE_UNAVAILABLE', '열 수 없는 초대예요. 보낸 분께 새 링크를 부탁해 보세요.');
      }
    }
    const size = await this.size();
    const problem = await this.joinProblem(userId, p, size);
    return {
      event: { id: p.event.id, name: p.event.name },
      leaderNickname: p.members.find((m) => m.userId === p.leaderId)?.user.nickname ?? '',
      memberCount: p.members.length,
      maxSize: size.maxSize,
      joinable: problem === null,
      problem,
    };
  }

  /** 합류할 수 없는 이유 (없으면 null). 사용자에게 보여 줄 수 있는 문장 */
  private async joinProblem(userId: string, p: PartyRow, size: PartySizePolicy): Promise<string | null> {
    if (p.members.some((m) => m.userId === userId)) return '이미 이 일행이에요.';
    if (!JOINABLE_PARTY_STATUSES.includes(p.status as PartyStatus)) return '이미 시작한 일행이라 합류할 수 없어요.';
    if (this.clock.now() >= p.inviteExpiresAt) return '초대 시간이 지났어요. 새 링크를 부탁해 보세요.';
    if (p.members.length >= size.maxSize) return `일행은 최대 ${size.maxSize}명이에요.`;
    const mine = await this.prisma.partyMember.findFirst({ where: { userId, eventId: p.eventId, active: true }, select: { id: true } });
    if (mine) return '이 행사에는 이미 다른 일행이 있어요.';
    return null;
  }

  async join(userId: string, token: string): Promise<PartyView> {
    await this.assertAdult(userId);
    const found = await this.byToken(token);
    for (const m of found.members) {
      if (m.userId !== userId && (await isBlockedBetween(this.prisma, userId, m.userId))) {
        throw new AppError('INVITE_UNAVAILABLE', '열 수 없는 초대예요. 보낸 분께 새 링크를 부탁해 보세요.');
      }
    }
    const size = await this.size();
    const now = this.clock.now();
    try {
      await this.prisma.$transaction(async (tx) => {
        // 동시에 합류해도 정원을 넘지 않도록 일행을 잠급니다.
        await tx.$queryRaw`SELECT "id" FROM "Party" WHERE "id" = ${found.id} FOR UPDATE`;
        const p = (await tx.party.findUnique({ where: { id: found.id }, include: partyInclude }))!;
        if (p.members.some((m) => m.userId === userId)) return; // 이미 합류함 (다시 눌러도 그대로)
        const problem = await this.joinProblem(userId, p, size);
        if (problem) throw new AppError('INVITE_UNAVAILABLE', problem);
        await tx.partyMember.create({ data: { partyId: p.id, eventId: p.eventId, userId, joinedAt: now } });
        const nick = (await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { nickname: true } })).nickname ?? '';
        for (const m of p.members) await this.notifications.notify(tx, m.userId, 'PARTY_JOINED', { nickname: nick, eventName: p.event.name });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError('INVITE_UNAVAILABLE', '이 행사에는 이미 다른 일행이 있어요.');
      throw error;
    }
    await this.evaluate(found.id);
    return this.get(userId, found.id);
  }

  // ───────────── 빠지기·해체·진행 ─────────────

  /** 일행에서 빠지기. 남은 사람끼리 계속하고, 한 명만 남으면 일행이 풀립니다. 대표가 빠지면 가장 먼저 합류한 사람이 대표가 됩니다. */
  async leave(userId: string, partyId: string) {
    const p = await this.loadMine(userId, partyId);
    const now = this.clock.now();
    const nick = p.members.find((m) => m.userId === userId)?.user.nickname ?? '';
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Party" WHERE "id" = ${p.id} FOR UPDATE`;
      await tx.partyMember.updateMany({ where: { partyId: p.id, userId, active: true }, data: { active: false, leftAt: now } });
      const rest = p.members.filter((m) => m.userId !== userId);
      if (p.leaderId === userId && rest.length > 0) await tx.party.update({ where: { id: p.id }, data: { leaderId: rest[0].userId } });
      // 하나만 남으면 아래 evaluate가 풀면서 '일행이 풀렸어요'를 보내므로, 두 명 이상 남을 때만 '인원이 바뀌었어요'
      if (rest.length >= (await this.size()).minSize) {
        for (const m of rest) await this.notifications.notify(tx, m.userId, 'PARTY_MEMBER_LEFT', { nickname: nick, eventName: p.event.name });
      }
    });
    // 남은 사람이 둘 이상이면 초안에서 빠진 사람의 동의를 뺍니다. (한 명만 남으면 아래에서 일행이 풀리며 정리됨)
    if (p.members.length - 1 >= (await this.size()).minSize) await this.partyProposals.onMemberLeft(p.id, userId);
    await this.evaluate(p.id);
    return { left: true as const };
  }

  async disband(userId: string, partyId: string) {
    const p = await this.loadMine(userId, partyId);
    if (p.leaderId !== userId) throw new AppError('FORBIDDEN', '대표만 일행을 풀 수 있어요.');
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Party" WHERE "id" = ${p.id} FOR UPDATE`;
      await this.state.transition(tx, p.id, p.status as PartyStatus, 'DISBANDED');
      await tx.partyMember.updateMany({ where: { partyId: p.id, active: true }, data: { active: false, leftAt: now } });
      for (const m of p.members.filter((x) => x.userId !== userId)) await this.notifications.notify(tx, m.userId, 'PARTY_DISBANDED', { eventName: p.event.name });
    });
    await this.partyProposals.onPartyEnded(p.id, null);
    return { disbanded: true as const };
  }

  /** 대표: 입력하지 않은 친구를 빼고, 입력을 마친 사람들끼리 진행합니다. (확인 중 → 활성) */
  async proceedWithout(userId: string, partyId: string): Promise<PartyView> {
    const p = await this.loadMine(userId, partyId);
    if (p.leaderId !== userId) throw new AppError('FORBIDDEN', '대표만 진행할 수 있어요.');
    if (p.status !== 'CONFIRMING') throw new AppError('PARTY_STATE', '지금은 진행할 수 없는 일행이에요.');
    const size = await this.size();
    const facts = await this.matching.inputFacts(p.eventId, p.members.map((m) => m.userId));
    const notReady = p.members.filter((m) => !isInputDone(facts.get(m.userId)!));
    if (p.members.length - notReady.length < size.minSize) {
      throw new AppError('PARTY_NOT_READY', `입력을 마친 사람이 ${size.minSize}명 이상이어야 진행할 수 있어요.`);
    }
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Party" WHERE "id" = ${p.id} FOR UPDATE`;
      for (const m of notReady) {
        await tx.partyMember.updateMany({ where: { id: m.id, active: true }, data: { active: false, leftAt: now } });
        await this.notifications.notify(tx, m.userId, 'PARTY_REMOVED', { eventName: p.event.name });
      }
    });
    await this.evaluate(p.id);
    return this.get(userId, p.id);
  }

  // ───────────── 일행 후보 ─────────────

  private async activeMembers(userId: string, partyId: string) {
    const p = await this.loadMine(userId, partyId);
    if (p.status !== 'ACTIVE') throw new AppError('PARTY_NOT_READY', '일행 전원이 입력을 마쳐야 후보를 볼 수 있어요.');
    return p;
  }

  async candidates(userId: string, partyId: string, options: MatchOptions): Promise<CandidatesResponse> {
    const p = await this.activeMembers(userId, partyId);
    return this.matching.partyCandidates(`party:${p.id}`, p.members.map((m) => m.userId), p.eventId, options);
  }

  async candidateDetail(userId: string, partyId: string, candidateId: string): Promise<CandidateDetail> {
    const p = await this.activeMembers(userId, partyId);
    return this.matching.partyCandidateDetail(`party:${p.id}`, p.members.map((m) => m.userId), p.eventId, candidateId);
  }
}
