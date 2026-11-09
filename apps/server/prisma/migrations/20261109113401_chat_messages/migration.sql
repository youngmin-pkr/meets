-- CreateEnum
CREATE TYPE "ChatMessageKind" AS ENUM ('TEXT', 'SYSTEM');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "endedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "senderId" TEXT,
    "kind" "ChatMessageKind" NOT NULL,
    "body" TEXT NOT NULL,
    "contactDetected" BOOLEAN NOT NULL DEFAULT false,
    "contactKinds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRead" (
    "appointmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadSeq" INTEGER NOT NULL,

    CONSTRAINT "ChatRead_pkey" PRIMARY KEY ("appointmentId","userId")
);

-- CreateIndex
CREATE INDEX "ChatMessage_appointmentId_seq_idx" ON "ChatMessage"("appointmentId", "seq");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_contactDetected_idx" ON "ChatMessage"("senderId", "contactDetected");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRead" ADD CONSTRAINT "ChatRead_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
