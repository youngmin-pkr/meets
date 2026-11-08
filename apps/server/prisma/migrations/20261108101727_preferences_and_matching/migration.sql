-- AlterTable
ALTER TABLE "IdentityVerification" ADD COLUMN     "birthDate" TEXT,
ADD COLUMN     "gender" TEXT;

-- CreateTable
CREATE TABLE "Preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tempoAnswers" INTEGER[],
    "immersionAnswers" INTEGER[],
    "tempoLevel" INTEGER NOT NULL,
    "immersionLevel" INTEGER NOT NULL,
    "mustGender" TEXT NOT NULL,
    "mustAge" TEXT NOT NULL,
    "promises" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreferenceDay" (
    "id" TEXT NOT NULL,
    "preferenceId" TEXT NOT NULL,
    "eventDayId" TEXT NOT NULL,
    "arriveTime" TEXT NOT NULL,
    "leaveTime" TEXT NOT NULL,
    "togetherSegmentIds" TEXT[],

    CONSTRAINT "PreferenceDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitRegistration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "endsOn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "WaitRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Preference_eventId_idx" ON "Preference"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Preference_userId_eventId_key" ON "Preference"("userId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "PreferenceDay_preferenceId_eventDayId_key" ON "PreferenceDay"("preferenceId", "eventDayId");

-- CreateIndex
CREATE UNIQUE INDEX "WaitRegistration_userId_eventId_key" ON "WaitRegistration"("userId", "eventId");

-- AddForeignKey
ALTER TABLE "Preference" ADD CONSTRAINT "Preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preference" ADD CONSTRAINT "Preference_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreferenceDay" ADD CONSTRAINT "PreferenceDay_preferenceId_fkey" FOREIGN KEY ("preferenceId") REFERENCES "Preference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreferenceDay" ADD CONSTRAINT "PreferenceDay_eventDayId_fkey" FOREIGN KEY ("eventDayId") REFERENCES "EventDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitRegistration" ADD CONSTRAINT "WaitRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitRegistration" ADD CONSTRAINT "WaitRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
