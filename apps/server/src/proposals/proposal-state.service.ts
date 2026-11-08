import { Injectable } from '@nestjs/common';
import type { ProposalStatus } from '@meets/shared';
import { AppError } from '../common/app-error';
import type { Prisma } from '../generated/prisma/client';
import { assertProposalTransition } from './proposal-transitions';

/**
 * 제안·약속 상태를 DB에 쓰는 유일한 곳 (CLAUDE.md 규칙 2)
 * 약속의 상태 바꾸기(확정, 취소 등)는 4단계에서 여기에 더합니다.
 */
@Injectable()
export class ProposalStateService {
  async createSent(tx: Prisma.TransactionClient, data: Omit<Prisma.ProposalUncheckedCreateInput, 'status'>) {
    return tx.proposal.create({ data: { ...data, status: 'SENT' } });
  }

  async transition(tx: Prisma.TransactionClient, id: string, from: ProposalStatus, to: ProposalStatus) {
    assertProposalTransition(from, to);
    const updated = await tx.proposal.updateMany({
      where: { id, status: from },
      data: { status: to, respondedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new AppError('PROPOSAL_STATE', '제안 상태가 그사이 바뀌었어요. 새로고침해 주세요.');
    }
  }

  /** 제안이 수락되면 만들어지는 약속의 첫 상태: 확정 대기 */
  async createAppointment(
    tx: Prisma.TransactionClient,
    p: { id: string; eventId: string; eventDayId: string; segmentIds: string[]; meetingSpotId: string; senderId: string; receiverId: string },
  ) {
    return tx.appointment.create({
      data: {
        proposalId: p.id,
        eventId: p.eventId,
        eventDayId: p.eventDayId,
        segmentIds: p.segmentIds,
        meetingSpotId: p.meetingSpotId,
        status: 'PENDING_CONFIRM',
        participants: { create: [{ userId: p.senderId }, { userId: p.receiverId }] },
      },
    });
  }
}
