-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "subtotal" BIGINT NOT NULL,
    "tax" BIGINT NOT NULL,
    "serviceCharge" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL,
    "total" BIGINT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" BIGINT NOT NULL,
    "lineTotal" BIGINT NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payer" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Payer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "itemId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("itemId","payerId")
);

-- CreateIndex
CREATE INDEX "Item_billId_idx" ON "Item"("billId");

-- CreateIndex
CREATE INDEX "Payer_billId_idx" ON "Payer"("billId");

-- CreateIndex
CREATE INDEX "Assignment_payerId_idx" ON "Assignment"("payerId");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payer" ADD CONSTRAINT "Payer_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Payer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
