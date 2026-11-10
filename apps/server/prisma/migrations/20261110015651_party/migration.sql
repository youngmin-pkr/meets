-- CreateEnum
CREATE TYPE "PartyStatus" AS ENUM ('INVITING', 'CONFIRMING', 'ACTIVE', 'PROPOSING', 'DISBANDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'PARTY_JOINED';
ALTER TYPE "NotificationKind" ADD VALUE 'PARTY_INPUT_REMIND';
ALTER TYPE "NotificationKind" ADD VALUE 'PARTY_READY';
ALTER TYPE "NotificationKind" ADD VALUE 'PARTY_MEMBER_LEFT';
ALTER TYPE "NotificationKind" ADD VALUE 'PARTY_DISBANDED';

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "status" "PartyStatus" NOT NULL,
    "inviteExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyMember" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),

    CONSTRAINT "PartyMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Party_eventId_status_idx" ON "Party"("eventId", "status");

-- CreateIndex
CREATE INDEX "PartyMember_partyId_idx" ON "PartyMember"("partyId");

-- CreateIndex
CREATE INDEX "PartyMember_userId_active_idx" ON "PartyMember"("userId", "active");

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyMember" ADD CONSTRAINT "PartyMember_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyMember" ADD CONSTRAINT "PartyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 한 행사에서 한 사람은 활성 일행원으로 한 번만 있을 수 있습니다. (나간 기록은 여러 개 가능)
CREATE UNIQUE INDEX "PartyMember_eventId_userId_active_key" ON "PartyMember"("eventId", "userId") WHERE "active" = true;
