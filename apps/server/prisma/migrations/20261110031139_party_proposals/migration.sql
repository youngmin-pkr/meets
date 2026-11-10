-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'PARTY_PROPOSAL_ASK';
ALTER TYPE "NotificationKind" ADD VALUE 'PARTY_PROPOSAL_SENT';
ALTER TYPE "NotificationKind" ADD VALUE 'PARTY_PROPOSAL_DECLINED';

-- AlterEnum
ALTER TYPE "ProposalStatus" ADD VALUE 'DRAFT';

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "senderPartyId" TEXT;

-- CreateTable
CREATE TABLE "ProposalConsent" (
    "proposalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agreedAt" TIMESTAMP(3),

    CONSTRAINT "ProposalConsent_pkey" PRIMARY KEY ("proposalId","userId")
);

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_senderPartyId_fkey" FOREIGN KEY ("senderPartyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalConsent" ADD CONSTRAINT "ProposalConsent_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalConsent" ADD CONSTRAINT "ProposalConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

