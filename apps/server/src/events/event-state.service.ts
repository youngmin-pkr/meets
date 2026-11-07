import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import type { Prisma } from '../generated/prisma/client';
import { assertEventTransition, type EventStatusState } from './event-transitions';

/**
 * 행사 상태를 DB에 쓰는 유일한 곳 (CLAUDE.md 규칙 2)
 * 다른 코드는 Event.status를 직접 바꾸지 말고 여기를 거칩니다.
 */
@Injectable()
export class EventStateService {
  /** 사용자 제보로 만들어지는 행사의 첫 상태 */
  readonly reportedStatus = 'REPORTED' as const;
  /** 운영자가 직접 등록하는 행사의 첫 상태 */
  readonly registeredStatus = 'REGISTERED' as const;

  /**
   * 상태를 바꿉니다. 표에 없는 전이는 거절하고,
   * 그사이 다른 사람이 상태를 바꿨으면(현재 상태가 다르면) 거절합니다.
   */
  async transition(
    tx: Prisma.TransactionClient,
    eventId: string,
    from: EventStatusState,
    to: EventStatusState,
    options: { reason?: string; approval?: { proposedBy: string; confirmedBy: string } } = {},
  ) {
    assertEventTransition(from, to, options.approval);
    const updated = await tx.event.updateMany({
      where: { id: eventId, status: from },
      data: { status: to, statusReason: options.reason ?? null },
    });
    if (updated.count !== 1) {
      throw new AppError('INVALID_TRANSITION', '행사 상태가 그사이 바뀌었어요. 새로고침해 주세요.');
    }
  }
}
