-- DropForeignKey
ALTER TABLE "InvoiceARCA" DROP CONSTRAINT "InvoiceARCA_saleId_fkey";

-- AlterTable
ALTER TABLE "InvoiceARCA" ADD COLUMN     "manualInvoiceId" INTEGER,
ALTER COLUMN "saleId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ManualInvoice" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER,
    "customerName" TEXT NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualInvoiceItem" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ManualInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceARCA_manualInvoiceId_key" ON "InvoiceARCA"("manualInvoiceId");

-- AddForeignKey
ALTER TABLE "ManualInvoice" ADD CONSTRAINT "ManualInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualInvoice" ADD CONSTRAINT "ManualInvoice_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualInvoice" ADD CONSTRAINT "ManualInvoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualInvoiceItem" ADD CONSTRAINT "ManualInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ManualInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceARCA" ADD CONSTRAINT "InvoiceARCA_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceARCA" ADD CONSTRAINT "InvoiceARCA_manualInvoiceId_fkey" FOREIGN KEY ("manualInvoiceId") REFERENCES "ManualInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

