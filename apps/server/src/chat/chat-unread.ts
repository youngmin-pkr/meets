import type { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/** 약속별로 내가 아직 읽지 않은 상대 메시지 수 */
export async function unreadCounts(prisma: PrismaService, userId: string, appointmentIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (appointmentIds.length === 0) return result;
  const reads = await prisma.chatRead.findMany({ where: { userId, appointmentId: { in: appointmentIds } } });
  const lastRead = new Map(reads.map((r) => [r.appointmentId, r.lastReadSeq]));
  const rows = await prisma.chatMessage.findMany({
    where: { appointmentId: { in: appointmentIds }, kind: 'TEXT', senderId: { not: userId } },
    select: { appointmentId: true, seq: true },
  });
  for (const id of appointmentIds) result.set(id, 0);
  for (const r of rows) {
    if (r.seq > (lastRead.get(r.appointmentId) ?? 0)) result.set(r.appointmentId, (result.get(r.appointmentId) ?? 0) + 1);
  }
  return result;
}

/** 채팅에 안내 줄 남기기 (예: 'OO님이 도착했어요.') */
export function chatSystemLine(tx: Prisma.TransactionClient, appointmentId: string, body: string, now: Date) {
  return tx.chatMessage.create({ data: { appointmentId, kind: 'SYSTEM', body, createdAt: now } });
}
