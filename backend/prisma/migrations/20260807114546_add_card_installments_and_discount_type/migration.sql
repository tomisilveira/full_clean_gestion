-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "cardType" TEXT,
ADD COLUMN     "installments" INTEGER;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "discountType" TEXT NOT NULL DEFAULT 'AMOUNT',
ADD COLUMN     "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0;
