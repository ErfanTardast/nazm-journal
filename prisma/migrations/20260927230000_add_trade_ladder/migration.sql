-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "ladderKey" TEXT,
ADD COLUMN     "ladderLeg" INTEGER,
ADD COLUMN     "ladderSize" INTEGER;

-- CreateIndex
CREATE INDEX "Trade_userId_ladderKey_idx" ON "Trade"("userId", "ladderKey");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_userId_externalId_key" ON "Trade"("userId", "externalId");

