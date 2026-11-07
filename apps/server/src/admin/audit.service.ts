import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 운영자의 모든 열람과 변경을 남깁니다. (CLAUDE.md 규칙 5)
 * reason에는 개인정보를 넣지 마세요.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    entry: { actorId: string; action: string; targetType: string; targetId?: string; reason?: string },
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    await tx.auditLog.create({ data: entry });
  }
}
