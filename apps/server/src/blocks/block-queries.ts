import type { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/** 나와 서로 차단 관계인 사람들 (내가 차단했거나 나를 차단한 사람). 후보·채팅에서 숨깁니다. */
export async function blockedWith(db: Db, userId: string): Promise<Set<string>> {
  const rows = await db.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)));
}

/** 두 사람 사이에 차단이 있는지 (어느 쪽이든) */
export async function isBlockedBetween(db: Db, a: string, b: string): Promise<boolean> {
  const found = await db.block.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { blockerId: true },
  });
  return !!found;
}
