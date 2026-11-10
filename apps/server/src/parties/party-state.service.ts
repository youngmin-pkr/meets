import { Inject, Injectable } from '@nestjs/common';
import { canTransitionParty, type PartyStatus } from '@meets/shared';
import { AppError } from '../common/app-error';
import { CLOCK, type Clock } from '../common/clock';
import type { Prisma } from '../generated/prisma/client';

/**
 * 일행 상태를 DB에 쓰는 유일한 곳 (CLAUDE.md 규칙 2)
 * 정리문서 5장 "일행" 표(PARTY_TRANSITIONS)에 있는 전이만 허용하고 나머지는 막습니다.
 */
@Injectable()
export class PartyStateService {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  /** 일행을 만들면 '초대 중'으로 시작합니다. */
  async create(tx: Prisma.TransactionClient, data: Omit<Prisma.PartyUncheckedCreateInput, 'status'>) {
    return tx.party.create({ data: { ...data, status: 'INVITING' } });
  }

  /** 표에 없는 전이는 거절하고, 그사이 다른 사람이 상태를 바꿨으면(현재 상태가 다르면) 거절합니다. */
  async transition(tx: Prisma.TransactionClient, id: string, from: PartyStatus, to: PartyStatus) {
    if (!canTransitionParty(from, to)) {
      throw new AppError('INVALID_TRANSITION', '지금은 바꿀 수 없는 일행 상태예요.', { from, to });
    }
    const done = await tx.party.updateMany({
      where: { id, status: from },
      data: { status: to, ...(to === 'DISBANDED' ? { endedAt: this.clock.now() } : {}) },
    });
    if (done.count !== 1) throw new AppError('PARTY_STATE', '일행 상태가 그사이 바뀌었어요. 새로고침해 주세요.');
  }
}
