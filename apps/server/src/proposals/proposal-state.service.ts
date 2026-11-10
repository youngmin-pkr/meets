import { Injectable } from '@nestjs/common';
import { PartyStateService } from '../parties/party-state.service';
import type { ProposalStatus } from '@meets/shared';
import { AppError } from '../common/app-error';
import type { Prisma } from '../generated/prisma/client';
import { assertProposalTransition } from './proposal-transitions';

/**
 * 제안 상태를 DB에 쓰는 유일한 곳 (CLAUDE.md 규칙 2)
 * 약속 상태는 appointments/appointment-state.service.ts에서 씁니다.
 */
@Injectable()
export class ProposalStateService {
  constructor(private readonly partyState: PartyStateService) {}

  /** 일행 제안은 일행원의 동의를 모으는 '초안'으로 시작합니다. */
  async createDraft(tx: Prisma.TransactionClient, data: Omit<Prisma.ProposalUncheckedCreateInput, 'status'>) {
    return tx.proposal.create({ data: { ...data, status: 'DRAFT' } });
  }

  async createSent(tx: Prisma.TransactionClient, data: Omit<Prisma.ProposalUncheckedCreateInput, 'status'>) {
    return tx.proposal.create({ data: { ...data, status: 'SENT' } });
  }

  /**
   * 상태를 바꿉니다. 일행이 보낸 제안이면 일행 상태도 함께 바꿉니다. (보냄 → 제안 중, 끝남 → 활성)
   * extra: 초안이 제안으로 나갈 때의 새 만료 시각 같은 값
   */
  async transition(tx: Prisma.TransactionClient, id: string, from: ProposalStatus, to: ProposalStatus, extra: Prisma.ProposalUncheckedUpdateManyInput = {}) {
    assertProposalTransition(from, to);
    const updated = await tx.proposal.updateMany({
      where: { id, status: from },
      data: { ...extra, status: to, ...(from === 'DRAFT' && to === 'SENT' ? {} : { respondedAt: new Date() }) },
    });
    if (updated.count !== 1) {
      throw new AppError('PROPOSAL_STATE', '제안 상태가 그사이 바뀌었어요. 새로고침해 주세요.');
    }
    const p = await tx.proposal.findUnique({ where: { id }, select: { senderPartyId: true } });
    if (!p?.senderPartyId) return;
    const party = await tx.party.findUnique({ where: { id: p.senderPartyId }, select: { status: true } });
    if (!party) return;
    if (from === 'DRAFT' && to === 'SENT' && party.status === 'ACTIVE') {
      await this.partyState.transition(tx, p.senderPartyId, 'ACTIVE', 'PROPOSING');
    } else if (from === 'SENT' && party.status === 'PROPOSING') {
      await this.partyState.transition(tx, p.senderPartyId, 'PROPOSING', 'ACTIVE');
    }
  }
}
