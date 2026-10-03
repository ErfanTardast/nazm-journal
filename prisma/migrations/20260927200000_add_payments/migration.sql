-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('card_to_card', 'usdt_trc20');

-- CreateEnum
CREATE TYPE "PaymentCurrency" AS ENUM ('toman', 'usdt');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('awaiting_transfer', 'pending', 'approved', 'rejected', 'refunded');

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "tier" "Tier" NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "currency" "PaymentCurrency" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "trackingCode" TEXT,
    "claimCode" TEXT,
    "paidAt" TIMESTAMP(3),
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "isFirstPurchase" BOOLEAN NOT NULL DEFAULT false,
    "refundedAt" TIMESTAMP(3),
    "refundedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_method_claimCode_key" ON "Payment"("method", "claimCode");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

