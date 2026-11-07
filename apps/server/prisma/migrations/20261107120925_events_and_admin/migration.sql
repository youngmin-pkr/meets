-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('PERFORMANCE', 'EXHIBITION');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CONCERT', 'FESTIVAL', 'EXHIBITION', 'POPUP', 'EXPO');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('REPORTED', 'REVIEWING', 'REGISTERED', 'REJECTED', 'CHANGED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('REVIEWER', 'REPORT_MANAGER', 'EVENT_MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('EVENT_CANCEL', 'USER_SUSPEND', 'POLICY_CHANGE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "EventCategory" NOT NULL,
    "type" "EventType",
    "venue" TEXT,
    "officialUrl" TEXT NOT NULL,
    "officialUrlKey" TEXT NOT NULL,
    "ticketRequired" BOOLEAN NOT NULL DEFAULT true,
    "status" "EventStatus" NOT NULL,
    "statusReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDay" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "EventDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSegment" (
    "id" TEXT NOT NULL,
    "eventDayId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingSpot" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPublicPlace" BOOLEAN NOT NULL,

    CONSTRAINT "MeetingSpot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "category" "EventCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "dateText" TEXT,
    "placeText" TEXT,
    "officialUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "EventReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "loginId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminApproval" (
    "id" TEXT NOT NULL,
    "kind" "ApprovalKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "AdminApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_officialUrlKey_key" ON "Event"("officialUrlKey");

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EventDay_eventId_date_key" ON "EventDay"("eventId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "EventReport_reporterId_eventId_key" ON "EventReport"("reporterId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_loginId_key" ON "AdminUser"("loginId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminApproval_kind_targetId_status_idx" ON "AdminApproval"("kind", "targetId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- AddForeignKey
ALTER TABLE "EventDay" ADD CONSTRAINT "EventDay_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSegment" ADD CONSTRAINT "EventSegment_eventDayId_fkey" FOREIGN KEY ("eventDayId") REFERENCES "EventDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSpot" ADD CONSTRAINT "MeetingSpot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReport" ADD CONSTRAINT "EventReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReport" ADD CONSTRAINT "EventReport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
