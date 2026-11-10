-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'APPOINTMENT_MEMBER_LEFT';

-- DropIndex
DROP INDEX "Review_appointmentId_authorId_key";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "rescheduleReason" TEXT;

-- AlterTable
ALTER TABLE "AppointmentParticipant" ADD COLUMN     "leftAt" TIMESTAMP(3),
ADD COLUMN     "leftReason" TEXT,
ADD COLUMN     "side" TEXT NOT NULL DEFAULT 'A';

-- CreateIndex
CREATE UNIQUE INDEX "Review_appointmentId_authorId_targetId_key" ON "Review"("appointmentId", "authorId", "targetId");


-- 이미 있는 약속: 제안을 받은 사람은 B쪽, 보낸 사람은 A쪽
UPDATE "AppointmentParticipant" ap SET "side" = 'B'
FROM "Appointment" a JOIN "Proposal" p ON p."id" = a."proposalId"
WHERE ap."appointmentId" = a."id" AND ap."userId" = p."receiverId";
