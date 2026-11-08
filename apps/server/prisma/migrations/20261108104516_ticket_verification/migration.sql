-- CreateEnum
CREATE TYPE "TicketKind" AS ENUM ('TICKET', 'RESERVATION');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('STARTED', 'UPLOADED', 'CONFIRMED', 'REVIEW_PENDING', 'VERIFIED', 'FAILED', 'REVERIFYING');

-- CreateTable
CREATE TABLE "TicketVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "TicketKind" NOT NULL,
    "status" "TicketStatus" NOT NULL,
    "reservationHash" TEXT,
    "admissibleDayIds" TEXT[],
    "reviewReason" TEXT,
    "failReason" TEXT,
    "imageDeletedAt" TIMESTAMP(3),
    "reviewerId" TEXT,
    "heldAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketImage" (
    "verificationId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketImage_pkey" PRIMARY KEY ("verificationId")
);

-- CreateTable
CREATE TABLE "TicketHash" (
    "hash" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,

    CONSTRAINT "TicketHash_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "AttendancePlan" (
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendancePlan_pkey" PRIMARY KEY ("userId","eventId")
);

-- CreateIndex
CREATE INDEX "TicketVerification_userId_eventId_idx" ON "TicketVerification"("userId", "eventId");

-- CreateIndex
CREATE INDEX "TicketVerification_status_idx" ON "TicketVerification"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TicketHash_verificationId_key" ON "TicketHash"("verificationId");

-- AddForeignKey
ALTER TABLE "TicketVerification" ADD CONSTRAINT "TicketVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketVerification" ADD CONSTRAINT "TicketVerification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketImage" ADD CONSTRAINT "TicketImage_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "TicketVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketHash" ADD CONSTRAINT "TicketHash_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "TicketVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePlan" ADD CONSTRAINT "AttendancePlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePlan" ADD CONSTRAINT "AttendancePlan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
