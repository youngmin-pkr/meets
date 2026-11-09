-- AlterEnum
ALTER TYPE "ApprovalStatus" ADD VALUE 'REJECTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'REPORT_RESULT';
ALTER TYPE "NotificationKind" ADD VALUE 'ADMIN_WARNING';
ALTER TYPE "NotificationKind" ADD VALUE 'ADMIN_RESTRICTION';

-- AlterEnum
ALTER TYPE "ReportCategory" ADD VALUE 'NO_SHOW';

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UserRestriction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserRestriction_userId_endsAt_idx" ON "UserRestriction"("userId", "endsAt");

-- CreateIndex
CREATE INDEX "Report_assigneeId_status_idx" ON "Report"("assigneeId", "status");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRestriction" ADD CONSTRAINT "UserRestriction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRestriction" ADD CONSTRAINT "UserRestriction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
