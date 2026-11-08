-- 4단계: 약속 확정·전날 확인·취소·알림
-- 이미 있는 제안·약속은 새 칸(날짜·구간·장소 이름·정책 값)을 지금 값으로 채운 뒤 NOT NULL로 바꿉니다.

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('PROPOSAL_RECEIVED', 'PROPOSAL_ACCEPTED', 'PROPOSAL_REJECTED', 'DAY_BEFORE_CONFIRM', 'DAY_BEFORE_REMINDER', 'APPOINTMENT_CONFIRMED', 'NO_CONFIRM_PARTNER', 'NO_CONFIRM_SELF', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_SOON', 'PARTNER_ARRIVED', 'APPOINTMENT_ENDED_EARLY', 'EVENT_SCHEDULE_CHANGED', 'APPOINTMENT_ON_HOLD', 'EVENT_CANCELLED');

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_eventDayId_fkey";

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_meetingSpotId_fkey";

-- DropForeignKey
ALTER TABLE "Proposal" DROP CONSTRAINT "Proposal_eventDayId_fkey";

-- DropForeignKey
ALTER TABLE "Proposal" DROP CONSTRAINT "Proposal_meetingSpotId_fkey";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "date" TEXT,
ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "meetingSpotName" TEXT,
ADD COLUMN     "policy" JSONB,
ADD COLUMN     "rescheduleDeadline" TIMESTAMP(3),
ADD COLUMN     "segmentsSnapshot" JSONB,
ADD COLUMN     "startTime" TEXT,
ALTER COLUMN "eventDayId" DROP NOT NULL,
ALTER COLUMN "meetingSpotId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AppointmentParticipant" ADD COLUMN     "dayBeforeNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "noResponse" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "noShowReportedAt" TIMESTAMP(3),
ADD COLUMN     "reminderNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "rescheduleConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "soonNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "date" TEXT,
ADD COLUMN     "meetingSpotName" TEXT,
ADD COLUMN     "segmentsSnapshot" JSONB,
ALTER COLUMN "eventDayId" DROP NOT NULL,
ALTER COLUMN "meetingSpotId" DROP NOT NULL;


-- 이미 있는 제안 채우기
UPDATE "Proposal" p SET
  "date" = d."date",
  "meetingSpotName" = COALESCE((SELECT m."name" FROM "MeetingSpot" m WHERE m."id" = p."meetingSpotId"), ''),
  "segmentsSnapshot" = COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', s."id", 'label', s."label", 'startTime', s."startTime", 'endTime', s."endTime") ORDER BY s."sortOrder")
    FROM "EventSegment" s WHERE s."id" = ANY(p."segmentIds")), '[]'::jsonb)
FROM "EventDay" d WHERE d."id" = p."eventDayId";

-- 이미 있는 약속 채우기 (정책 값은 기본값)
UPDATE "Appointment" a SET
  "date" = d."date",
  "startTime" = COALESCE((SELECT MIN(s."startTime") FROM "EventSegment" s WHERE s."id" = ANY(a."segmentIds")), d."startTime"),
  "endTime" = COALESCE((SELECT MAX(s."endTime") FROM "EventSegment" s WHERE s."id" = ANY(a."segmentIds")), d."endTime"),
  "meetingSpotName" = COALESCE((SELECT m."name" FROM "MeetingSpot" m WHERE m."id" = a."meetingSpotId"), ''),
  "segmentsSnapshot" = COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', s."id", 'label', s."label", 'startTime', s."startTime", 'endTime', s."endTime") ORDER BY s."sortOrder")
    FROM "EventSegment" s WHERE s."id" = ANY(a."segmentIds")), '[]'::jsonb),
  "policy" = '{"dayBeforeHour":18,"confirmDeadlineHours":3,"confirmReminderHours":3,"freeCancelHours":24,"noShowWaitMinutes":15,"soonMinutes":60,"arrivalOpenMinutes":60}'::jsonb
FROM "EventDay" d WHERE d."id" = a."eventDayId";

ALTER TABLE "Proposal" ALTER COLUMN "date" SET NOT NULL, ALTER COLUMN "meetingSpotName" SET NOT NULL, ALTER COLUMN "segmentsSnapshot" SET NOT NULL;
ALTER TABLE "Appointment" ALTER COLUMN "date" SET NOT NULL, ALTER COLUMN "startTime" SET NOT NULL, ALTER COLUMN "endTime" SET NOT NULL,
  ALTER COLUMN "meetingSpotName" SET NOT NULL, ALTER COLUMN "segmentsSnapshot" SET NOT NULL, ALTER COLUMN "policy" SET NOT NULL;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "appointmentId" TEXT,
    "proposalId" TEXT,
    "pushAt" TIMESTAMP(3) NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Appointment_eventId_status_idx" ON "Appointment"("eventId", "status");

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_eventDayId_fkey" FOREIGN KEY ("eventDayId") REFERENCES "EventDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_meetingSpotId_fkey" FOREIGN KEY ("meetingSpotId") REFERENCES "MeetingSpot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_eventDayId_fkey" FOREIGN KEY ("eventDayId") REFERENCES "EventDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_meetingSpotId_fkey" FOREIGN KEY ("meetingSpotId") REFERENCES "MeetingSpot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
