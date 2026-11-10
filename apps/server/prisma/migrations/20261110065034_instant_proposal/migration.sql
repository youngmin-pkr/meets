-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "instant" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "durationMinutes" INTEGER;

