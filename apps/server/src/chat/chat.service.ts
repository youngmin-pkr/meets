import { Inject, Injectable } from '@nestjs/common';
import {
  AVATAR_COLORS,
  chatClosesAt,
  checkChatBody,
  detectContact,
  isChatOpen,
  seoulDateTime,
  type AppointmentStatus,
  type ChatMessageView,
  type ChatSummary,
  type ChatView,
  type Counterpart,
} from '@meets/shared';
import { AppointmentsService } from '../appointments/appointments.service';
import { orderedOthers } from '../common/participants';
import { isBlockedBetween } from '../blocks/block-queries';
import { AppError } from '../common/app-error';
import { CLOCK, type Clock } from '../common/clock';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { unreadCounts } from './chat-unread';

const roomInclude = {
  participants: { include: { user: { select: { id: true, nickname: true, avatarInitial: true, avatarColor: true } } } },
  event: { select: { id: true, name: true } },
} as const;

type Message = { id: string; seq: number; kind: string; senderId: string | null; body: string; createdAt: Date; contactDetected: boolean };

function counterpart(u: { id: string; nickname: string | null; avatarInitial: string | null; avatarColor: string | null }): Counterpart {
  return {
    userId: u.id,
    nickname: u.nickname ?? '',
    avatarInitial: u.avatarInitial ?? '',
    avatarColor: AVATAR_COLORS[(u.avatarColor ?? 'ink') as keyof typeof AVATAR_COLORS] ?? AVATAR_COLORS.ink,
  };
}

/**
 * 앱 안 채팅 (정리문서 2장 "채팅")
 * - 약속 당사자만 읽고 보낼 수 있습니다. (CLAUDE.md 규칙 3)
 * - 연락처·SNS는 앱에서 보내기 전에 멈추고, 서버에서도 다시 검사합니다. 그래도 보내면 종류를 기록합니다. (규칙 7)
 * - 메시지 내용은 로그·오류 메시지에 남기지 않습니다. (규칙 11)
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly appointments: AppointmentsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async closesAtOf(a: { status: string; date: string; endTime: string; endedAt: Date | null; chatExtended: boolean; endReason: string | null }) {
    const hours = await this.policy.getNumber('CHAT_CLOSE_HOURS_AFTER_END');
    return chatClosesAt(
      { status: a.status as AppointmentStatus, endsAt: seoulDateTime(a.date, a.endTime), endedAt: a.endedAt, extended: a.chatExtended, endedBySafety: a.endReason === 'SAFETY' },
      { closeHoursAfterEnd: hours },
    );
  }

  /** 차단 관계인 두 사람의 채팅은 닫힙니다. (지난 대화는 읽을 수 있음) */
  private async closesAtWithBlock(a: Parameters<ChatService['closesAtOf']>[0] & { participants: Array<{ userId: string }> }) {
    const closes = await this.closesAtOf(a);
    // 둘이 만나는 약속에서만 확인합니다. (여러 명이 만나는 약속에서는 차단한 사람이 약속에서 빠지므로 서로 차단한 사람이 함께 남지 않습니다)
    const live = a.participants.filter((p) => !(p as { leftAt?: Date | null }).leftAt);
    if (live.length !== 2) return closes;
    return (await isBlockedBetween(this.prisma, live[0].userId, live[1].userId)) ? this.clock.now() : closes;
  }

  private async room(userId: string, appointmentId: string) {
    // 시간이 되어 바뀐 약속 상태(종료 등)를 먼저 반영합니다.
    await this.appointments.settle({ id: appointmentId, participants: { some: { userId, leftAt: null } } });
    // 약속에서 빠진 사람은 더 이상 이 채팅을 읽거나 보낼 수 없습니다.
    const a = await this.prisma.appointment.findFirst({ where: { id: appointmentId, participants: { some: { userId, leftAt: null } } }, include: roomInclude });
    if (!a) throw new AppError('NOT_FOUND', '채팅을 찾을 수 없어요.');
    const closesAt = await this.closesAtWithBlock(a);
    return { a, closesAt, open: isChatOpen(closesAt, this.clock.now()) };
  }

  private toMessage(m: Message, me: string, names: Map<string, string> = new Map()): ChatMessageView {
    return {
      senderNickname: m.senderId ? (names.get(m.senderId) ?? null) : null,
      id: m.id,
      seq: m.seq,
      kind: m.kind as 'TEXT' | 'SYSTEM',
      mine: m.senderId === me,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      flagged: m.senderId === me && m.contactDetected,
    };
  }

  /** 채팅 보기. afterSeq를 주면 그 다음 메시지만 (몇 초마다 새로 확인할 때) */
  async view(userId: string, appointmentId: string, afterSeq?: number): Promise<ChatView> {
    const { a, closesAt, open } = await this.room(userId, appointmentId);
    const messages =
      afterSeq !== undefined
        ? await this.prisma.chatMessage.findMany({ where: { appointmentId, seq: { gt: afterSeq } }, orderBy: { seq: 'asc' }, take: 200 })
        : (await this.prisma.chatMessage.findMany({ where: { appointmentId }, orderBy: { seq: 'desc' }, take: 200 })).reverse();
    // 본 데까지 읽음으로
    const last = messages[messages.length - 1];
    if (last) {
      await this.prisma.chatRead.upsert({
        where: { appointmentId_userId: { appointmentId, userId } },
        create: { appointmentId, userId, lastReadSeq: last.seq },
        update: { lastReadSeq: { set: last.seq } },
      });
    }
    const names = new Map(a.participants.map((p) => [p.userId, p.user.nickname ?? '']));
    const others = orderedOthers(a.participants, userId);
    return {
      appointmentId,
      counterpart: counterpart((others[0] ?? a.participants.find((p) => p.userId !== userId)!).user),
      companions: others.map((p) => counterpart(p.user)),
      event: a.event,
      date: a.date,
      appointmentStatus: a.status as AppointmentStatus,
      closesAt: closesAt?.toISOString() ?? null,
      open,
      messages: messages.map((m) => this.toMessage(m, userId, names)),
    };
  }

  /**
   * 메시지 보내기. 연락처·SNS가 있으면 멈추고(CONTACT_DETECTED), 사용자가 '그래도 보낼게요'를 고르면 기록과 함께 보냅니다.
   */
  async send(userId: string, appointmentId: string, body: string, confirmContact: boolean): Promise<ChatMessageView> {
    const { a, open } = await this.room(userId, appointmentId);
    if (!open) throw new AppError('CHAT_CLOSED', '채팅이 닫혀서 더 보낼 수 없어요.');
    const max = await this.policy.getNumber('CHAT_MESSAGE_MAX_LENGTH');
    const problem = checkChatBody(body, max);
    if (problem === 'EMPTY') throw new AppError('CHAT_INVALID', '보낼 내용을 적어 주세요.');
    if (problem === 'TOO_LONG') throw new AppError('CHAT_INVALID', `한 번에 ${max}자까지 보낼 수 있어요.`, { max });

    // 서버에서도 다시 검사합니다. (앱을 거치지 않고 보내도 막히도록) 오류에는 종류만 담고 원문은 담지 않습니다.
    const contact = detectContact(body);
    if (contact.detected && !confirmContact) {
      throw new AppError('CONTACT_DETECTED', '번호나 SNS가 들어 있어요. 처음 만나기 전에는 연락처를 주고받지 않는 게 안전해요.', {
        kinds: contact.kinds,
      });
    }
    const created = await this.prisma.chatMessage.create({
      data: {
        appointmentId,
        senderId: userId,
        kind: 'TEXT',
        body: body.trim(),
        contactDetected: contact.detected,
        contactKinds: contact.kinds,
        createdAt: this.clock.now(),
      },
    });
    await this.prisma.chatRead.upsert({
      where: { appointmentId_userId: { appointmentId, userId } },
      create: { appointmentId, userId, lastReadSeq: created.seq },
      update: { lastReadSeq: { set: created.seq } },
    });
    return this.toMessage(created, userId, new Map(a.participants.map((p) => [p.userId, p.user.nickname ?? ''])));
  }

  /** 내 대화 목록 (열린 대화 먼저, 최근 순) */
  async list(userId: string): Promise<ChatSummary[]> {
    await this.appointments.settleForUser(userId);
    const rows = await this.prisma.appointment.findMany({
      where: { participants: { some: { userId, leftAt: null } } },
      include: { ...roomInclude, chatMessages: { orderBy: { seq: 'desc' }, take: 1 } },
      take: 100,
    });
    const unread = await unreadCounts(this.prisma, userId, rows.map((r) => r.id));
    const now = this.clock.now();
    const list = await Promise.all(
      rows.map(async (a) => {
        const last = a.chatMessages[0];
        const others = orderedOthers(a.participants, userId);
        return {
          appointmentId: a.id,
          counterpart: counterpart((others[0] ?? a.participants.find((p) => p.userId !== userId)!).user),
          companions: others.map((p) => counterpart(p.user)),
          event: a.event,
          date: a.date,
          open: isChatOpen(await this.closesAtWithBlock(a), now),
          unread: unread.get(a.id) ?? 0,
          lastMessage: last ? { body: last.body, createdAt: last.createdAt.toISOString(), mine: last.senderId === userId } : null,
          sortKey: last?.seq ?? 0,
        };
      }),
    );
    return list
      .sort((x, y) => Number(y.open) - Number(x.open) || y.sortKey - x.sortKey)
      .map(({ sortKey: _s, ...c }) => c);
  }
}
