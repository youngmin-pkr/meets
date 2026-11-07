import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { assertAgeClassTransition } from './account-transitions';

/**
 * 계정의 나이 구분·이용 상태를 DB에 쓰는 유일한 곳 (CLAUDE.md 규칙 2, 8)
 *
 * 다른 모듈은 User의 ageClass·status를 직접 바꾸지 말고 이 서비스를 거칩니다.
 * 1단계에서는 "본인 확인 결과 성인 → 계정 만들기"만 씁니다.
 */
@Injectable()
export class AccountStateService {
  /** 본인 확인 결과 성인인 사람의 계정을 만듭니다. (미인증 → 성인) */
  async createVerifiedAdult(tx: Prisma.TransactionClient) {
    assertAgeClassTransition('UNVERIFIED', 'ADULT');
    return tx.user.create({ data: { ageClass: 'ADULT', status: 'ACTIVE' } });
  }
}
