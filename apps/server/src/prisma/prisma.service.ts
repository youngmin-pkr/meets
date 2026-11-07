import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { SERVER_CONFIG, type ServerConfig } from '../config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(SERVER_CONFIG) config: ServerConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

/** 같은 값이 이미 있어서(유니크 제약) 저장이 거절됐는지 */
export function isUniqueViolation(error: unknown, field?: string): boolean {
  const e = error as { code?: string; meta?: Record<string, unknown> };
  if (e?.code !== 'P2002') return false;
  if (!field) return true;
  return JSON.stringify(e.meta ?? {}).includes(field);
}
