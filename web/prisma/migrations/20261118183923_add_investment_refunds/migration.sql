-- CreateTable
CREATE TABLE "investment_refunds" (
    "id" UUID NOT NULL,
    "investment_id" UUID NOT NULL,
    "amount_satang" BIGINT NOT NULL,
    "ledger_transaction_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "investment_refunds_idempotency_key_key" ON "investment_refunds"("idempotency_key");

-- CreateIndex
CREATE INDEX "investment_refunds_investment_id_created_at_idx" ON "investment_refunds"("investment_id", "created_at");

-- CreateIndex
CREATE INDEX "investment_refunds_ledger_transaction_id_idx" ON "investment_refunds"("ledger_transaction_id");

-- AddForeignKey
ALTER TABLE "investment_refunds" ADD CONSTRAINT "investment_refunds_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "investments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_refunds" ADD CONSTRAINT "investment_refunds_ledger_transaction_id_fkey" FOREIGN KEY ("ledger_transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
