-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'INSTANT_READY';

-- CreateTable
CREATE TABLE "InstantPresence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventDayId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "tempoLevel" INTEGER,
    "immersionLevel" INTEGER,
    "waitingSince" TIMESTAMP(3),
    "readyNotifiedAt" TIMESTAMP(3),

    CONSTRAINT "InstantPresence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstantPresence_eventId_until_idx" ON "InstantPresence"("eventId", "until");

-- CreateIndex
CREATE UNIQUE INDEX "InstantPresence_userId_eventId_key" ON "InstantPresence"("userId", "eventId");

-- AddForeignKey
ALTER TABLE "InstantPresence" ADD CONSTRAINT "InstantPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstantPresence" ADD CONSTRAINT "InstantPresence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

