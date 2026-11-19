-- CreateTable
CREATE TABLE "opening_balances" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "administrator_user_id" UUID NOT NULL,
    "ledger_transaction_id" UUID NOT NULL,
    "amount_satang" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'THB',
    "idempotency_key" VARCHAR(255) NOT NULL,
    "reason" TEXT NOT NULL,
    "approved_at" TIMESTAMPTZ(6) NOT NULL,
    "posted_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opening_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "opening_balances_wallet_id_key" ON "opening_balances"("wallet_id");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balances_ledger_transaction_id_key" ON "opening_balances"("ledger_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balances_idempotency_key_key" ON "opening_balances"("idempotency_key");

-- CreateIndex
CREATE INDEX "opening_balances_administrator_user_id_created_at_idx" ON "opening_balances"("administrator_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_administrator_user_id_fkey" FOREIGN KEY ("administrator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_ledger_transaction_id_fkey" FOREIGN KEY ("ledger_transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
