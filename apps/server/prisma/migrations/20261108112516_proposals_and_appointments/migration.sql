-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProposalKind" AS ENUM ('NORMAL', 'INSTANT', 'TEEN_GROUP');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING_CONFIRM', 'CONFIRMED', 'IN_PROGRESS', 'ENDED', 'ENDED_EARLY', 'CANCELLED', 'RESCHEDULING', 'ON_HOLD', 'AUTO_ENDED');

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "kind" "ProposalKind" NOT NULL DEFAULT 'NORMAL',
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventDayId" TEXT NOT NULL,
    "segmentIds" TEXT[],
    "meetingSpotId" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventDayId" TEXT NOT NULL,
    "segmentIds" TEXT[],
    "meetingSpotId" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentParticipant" (
    "appointmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayBeforeConfirmedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lateCancel" BOOLEAN,

    CONSTRAINT "AppointmentParticipant_pkey" PRIMARY KEY ("appointmentId","userId")
);

-- CreateIndex
CREATE INDEX "Proposal_receiverId_status_idx" ON "Proposal"("receiverId", "status");

-- CreateIndex
CREATE INDEX "Proposal_senderId_status_idx" ON "Proposal"("senderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_proposalId_key" ON "Appointment"("proposalId");

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_eventDayId_fkey" FOREIGN KEY ("eventDayId") REFERENCES "EventDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_meetingSpotId_fkey" FOREIGN KEY ("meetingSpotId") REFERENCES "MeetingSpot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_eventDayId_fkey" FOREIGN KEY ("eventDayId") REFERENCES "EventDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_meetingSpotId_fkey" FOREIGN KEY ("meetingSpotId") REFERENCES "MeetingSpot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentParticipant" ADD CONSTRAINT "AppointmentParticipant_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentParticipant" ADD CONSTRAINT "AppointmentParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
