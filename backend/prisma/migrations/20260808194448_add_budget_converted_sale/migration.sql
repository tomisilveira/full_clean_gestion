-- AlterTable
ALTER TABLE "Budget" ADD COLUMN     "convertedSaleId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Budget_convertedSaleId_key" ON "Budget"("convertedSaleId");

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_convertedSaleId_fkey" FOREIGN KEY ("convertedSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
