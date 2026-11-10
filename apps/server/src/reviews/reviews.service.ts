import { Inject, Injectable } from '@nestjs/common';
import {
  CHAT_EXTENDED_LINE,
  checkReviewInput,
  formatSeoulShort,
  REVIEW_PROBLEM_MESSAGES,
  reviewDeadline,
  seoulDateTime,
  type ReviewInput,
} from '@meets/shared';
import { AppointmentsService } from '../appointments/appointments.service';
import { BlocksService } from '../blocks/blocks.service';
import { isBlockedBetween } from '../blocks/block-queries';
import { chatSystemLine } from '../chat/chat-unread';
import { AppError } from '../common/app-error';
import { CLOCK, type Clock } from '../common/clock';
import { NotificationsService } from '../notifications/notifications.service';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service';
import { PolicyService } from '../policy/policy.service';
import { TrustService } from '../trust/trust.service';

/**
 * 후기 (정리문서 2장 "후기·신뢰")
 * - 정상적으로 끝난 만남만, 끝나고 7일 동안, 한 번만 남길 수 있습니다.
 * - 후기 내용은 상대에게 어떤 길로도 보여 주지 않습니다. (읽는 주소가 없고, 약속 응답에도 내용이 없음)
 * - 서로 '또 같이 가고 싶어요'를 골랐을 때만 연결됩니다. 한쪽만 고르면 상대에게 아무것도 알려지지 않습니다.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly appointments: AppointmentsService,
    private readonly blocks: BlocksService,
    private readonly notifications: NotificationsService,
    private readonly trust: TrustService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async submit(userId: string, appointmentId: string, input: ReviewInput): Promise<{ done: true; mutual: boolean }> {
    // 시간이 되어 바뀐 약속 상태(종료 등)를 먼저 반영합니다.
    await this.appointments.settle({ id: appointmentId, participants: { some: { userId, leftAt: null } } });
    const a = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, participants: { some: { userId, leftAt: null } } },
      include: { participants: { include: { user: { select: { id: true, nickname: true } } } }, event: { select: { name: true } } },
    });
    if (!a) throw new AppError('NOT_FOUND', '약속을 찾을 수 없어요.');
    if (a.status !== 'ENDED') throw new AppError('REVIEW_NOT_ALLOWED', '정상적으로 끝난 만남에만 후기를 남길 수 있어요.');
    const days = await this.policy.getNumber('REVIEW_WINDOW_DAYS');
    const deadline = reviewDeadline(seoulDateTime(a.date, a.endTime), days);
    if (this.clock.now() >= deadline) {
      throw new AppError('REVIEW_NOT_ALLOWED', `후기는 만남이 끝나고 ${days}일 안에 남길 수 있어요.`, { days });
    }
    const problem = checkReviewInput(input);
    if (problem) throw new AppError('REVIEW_INVALID', REVIEW_PROBLEM_MESSAGES[problem], { problem });

    // 후기는 함께한 사람마다 따로 남깁니다. 같은 쪽(일행)끼리, 그리고 중간에 빠진 사람과는 남기지 않습니다. (9-2a)
    const me = a.participants.find((p) => p.userId === userId)!;
    const targets = a.participants.filter((p) => !p.leftAt && p.userId !== userId && p.side !== me.side && (!input.targetId || p.userId === input.targetId));
    if (targets.length !== 1) throw new AppError('REVIEW_INVALID', '누구에 대한 후기인지 골라 주세요.');
    const other = targets[0];
    // '불편했어요'는 또 같이 가고 싶지 않다는 뜻이고, 추천에서 숨기면 같이 가는 것을 원하지 않는 것으로 봅니다.
    const again = input.overall === 'UNCOMFORTABLE' || input.hideTarget ? 'NO' : input.again;
    try {
      await this.prisma.review.create({
        data: {
          appointmentId,
          authorId: userId,
          targetId: other.userId,
          overall: input.overall,
          goodTags: input.goodTags,
          badTags: input.badTags,
          again,
          createdAt: this.clock.now(),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error, 'appointmentId')) throw new AppError('REVIEW_EXISTS', '이미 후기를 남겼어요.');
      throw error;
    }

    let mutual = false;
    if (again === 'YES') {
      const theirs = await this.prisma.review.findUnique({ where: { appointmentId_authorId_targetId: { appointmentId, authorId: other.userId, targetId: userId } } });
      if (theirs?.again === 'YES' && !(await isBlockedBetween(this.prisma, userId, other.userId))) {
        mutual = true;
        // 둘이 만난 약속이면 채팅이 닫히지 않습니다. 여러 명이 만난 약속의 채팅은 그대로 24시간 뒤 닫힙니다. (정리문서 2장 일행, 사용자 확인)
        const oneToOne = a.participants.length === 2;
        await this.prisma.$transaction(async (tx) => {
          if (oneToOne) {
            await tx.appointment.update({ where: { id: appointmentId }, data: { chatExtended: true } });
            await chatSystemLine(tx, appointmentId, CHAT_EXTENDED_LINE, this.clock.now());
          }
          // 다음 행사 후보 목록에서는 서로 맨 위에 보입니다. (후기로 계산)
          for (const p of [me, other]) {
            const nick = p.userId === me.userId ? (other.user.nickname ?? '') : (me.user.nickname ?? '');
            await this.notifications.notify(tx, p.userId, 'REVIEW_MUTUAL_AGAIN', { nickname: nick, eventName: a.event.name, deadline: formatSeoulShort(deadline), chatOpen: oneToOne }, { appointmentId });
          }
        });
      }
    }
    // 받은 후기는 상대의 신뢰 단계에 반영됩니다. (정책 값 11)
    await this.trust.recompute(other.userId);
    // '앞으로 추천에 나오지 않게' = 차단과 같습니다. (서로 안 보이고, 알림 없음)
    if (input.hideTarget) await this.blocks.block(userId, other.userId, 'REVIEW');
    return { done: true, mutual };
  }
}
