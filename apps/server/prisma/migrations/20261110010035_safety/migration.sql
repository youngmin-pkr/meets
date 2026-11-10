-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'SAFETY_CHECK';
ALTER TYPE "NotificationKind" ADD VALUE 'SAFETY_CHECK_REMIND';

-- AlterEnum
ALTER TYPE "ReportCategory" ADD VALUE 'HELP_REQUEST';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "safetyAlertTrusted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "safetyCheckEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "showStatus" BOOLEAN NOT NULL,
    "expireHours" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "alertKind" TEXT,
    "alertAt" TIMESTAMP(3),

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyCheck" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "askedAt" TIMESTAMP(3) NOT NULL,
    "remindedAt" TIMESTAMP(3),
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "alertedAt" TIMESTAMP(3),

    CONSTRAINT "SafetyCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShareLink_creatorId_appointmentId_idx" ON "ShareLink"("creatorId", "appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyCheck_appointmentId_userId_seq_key" ON "SafetyCheck"("appointmentId", "userId", "seq");

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyCheck" ADD CONSTRAINT "SafetyCheck_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyCheck" ADD CONSTRAINT "SafetyCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
