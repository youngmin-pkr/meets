import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { assertAccountStatusTransition, assertAgeClassTransition, type TwoPersonApproval } from './account-transitions';

/**
 * 계정의 나이 구분·이용 상태를 DB에 쓰는 유일한 곳 (CLAUDE.md 규칙 2, 8)
 *
 * 다른 모듈은 User의 ageClass·status를 직접 바꾸지 말고 이 서비스를 거칩니다.
 * 계정 만들기(본인 확인 결과 성인)와 이용 정지(신고 처리 결과, 두 명 확인)를 여기서 합니다.
 */
@Injectable()
export class AccountStateService {
  /** 본인 확인 결과 성인인 사람의 계정을 만듭니다. (미인증 → 성인) */
  async createVerifiedAdult(tx: Prisma.TransactionClient) {
    assertAgeClassTransition('UNVERIFIED', 'ADULT');
    return tx.user.create({ data: { ageClass: 'ADULT', status: 'ACTIVE' } });
  }

  /**
   * 이용 정지 (활성 → 정지). 신고 처리 결과이고, 제안한 사람과 확정한 사람이 달라야 합니다. (CLAUDE.md 규칙 4)
   * 이미 정지되었거나 탈퇴한 계정은 표에 없는 전이라 거절합니다.
   */
  async suspend(tx: Prisma.TransactionClient, userId: string, approval: TwoPersonApproval) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { status: true } });
    assertAccountStatusTransition(user.status, 'SUSPENDED', approval);
    await tx.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
  }
}
