import { Injectable } from '@nestjs/common';
import type { TicketKind, TicketStatus } from '@meets/shared';
import { AppError } from '../common/app-error';
import type { Prisma } from '../generated/prisma/client';
import { assertTicketTransition } from './ticket-transitions';

/**
 * 티켓 인증 상태를 DB에 쓰는 유일한 곳 (CLAUDE.md 규칙 2)
 * 인증이 끝나거나(완료·실패) 재검증을 시작하면 가린 이미지도 여기서 함께 지웁니다. (CLAUDE.md 규칙 6)
 */
@Injectable()
export class TicketStateService {
  async start(tx: Prisma.TransactionClient, userId: string, eventId: string, kind: TicketKind) {
    return tx.ticketVerification.create({ data: { userId, eventId, kind, status: 'STARTED' } });
  }

  async transition(
    tx: Prisma.TransactionClient,
    id: string,
    from: TicketStatus,
    to: TicketStatus,
    data: Prisma.TicketVerificationUpdateManyMutationInput = {},
  ) {
    assertTicketTransition(from, to);
    const done = to === 'VERIFIED' || to === 'FAILED';
    const updated = await tx.ticketVerification.updateMany({
      where: { id, status: from },
      data: {
        ...data,
        status: to,
        ...(done ? { decidedAt: new Date(), imageDeletedAt: new Date() } : {}),
      },
    });
    if (updated.count !== 1) {
      throw new AppError('INVALID_TRANSITION', '인증 상태가 그사이 바뀌었어요. 다시 시도해 주세요.');
    }
    if (done) {
      // 확인이 끝나면 이미지를 바로 지웁니다. 해시만 남깁니다.
      await tx.ticketImage.deleteMany({ where: { verificationId: id } });
    }
  }
}
