import { Inject, Injectable } from '@nestjs/common';
import { POLICY_DEFAULTS, type PolicyKey } from '@meets/shared';
import { CLOCK, type Clock } from '../common/clock';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 정책 값을 읽는 유일한 곳 (CLAUDE.md 규칙 1)
 *
 * DB의 PolicyValue 표에서 적용 시작 시각이 지난 값 중 가장 최근 값을 쓰고,
 * 없으면 @meets/shared의 기본값을 씁니다.
 */
@Injectable()
export class PolicyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async getNumber(key: PolicyKey): Promise<number> {
    const row = await this.prisma.policyValue.findFirst({
      where: { key, effectiveFrom: { lte: this.clock.now() } },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (row && typeof row.value === 'number') return row.value;
    return POLICY_DEFAULTS[key];
  }

  async getNumbers<K extends PolicyKey>(keys: K[]): Promise<Record<K, number>> {
    const values = await Promise.all(keys.map((k) => this.getNumber(k)));
    return Object.fromEntries(keys.map((k, i) => [k, values[i]])) as Record<K, number>;
  }
}
