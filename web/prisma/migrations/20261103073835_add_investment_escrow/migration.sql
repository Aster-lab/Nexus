-- CreateEnum
CREATE TYPE "investment_status" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "escrow_account_status" AS ENUM ('OPEN', 'FULLY_FUNDED', 'DISBURSED', 'REFUNDING', 'CLOSED');

-- CreateEnum
CREATE TYPE "escrow_transaction_type" AS ENUM ('DEPOSIT', 'DISBURSEMENT', 'REFUND');

-- CreateTable
CREATE TABLE "investments" (
    "id" UUID NOT NULL,
    "investor_profile_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "status" "investment_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_contributions" (
    "id" UUID NOT NULL,
    "investment_id" UUID NOT NULL,
    "amount_satang" BIGINT NOT NULL,
    "ledger_transaction_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_accounts" (
    "id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "platform_wallet_id" UUID NOT NULL,
    "held_satang" BIGINT NOT NULL DEFAULT 0,
    "status" "escrow_account_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "escrow_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_transactions" (
    "id" UUID NOT NULL,
    "escrow_account_id" UUID NOT NULL,
    "ledger_transaction_id" UUID NOT NULL,
    "type" "escrow_transaction_type" NOT NULL,
    "amount_satang" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escrow_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "investments_loan_id_status_idx" ON "investments"("loan_id", "status");

-- CreateIndex
CREATE INDEX "investments_investor_profile_id_status_idx" ON "investments"("investor_profile_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "investments_investor_profile_id_loan_id_key" ON "investments"("investor_profile_id", "loan_id");

-- CreateIndex
CREATE UNIQUE INDEX "investment_contributions_idempotency_key_key" ON "investment_contributions"("idempotency_key");

-- CreateIndex
CREATE INDEX "investment_contributions_investment_id_created_at_idx" ON "investment_contributions"("investment_id", "created_at");

-- CreateIndex
CREATE INDEX "investment_contributions_ledger_transaction_id_idx" ON "investment_contributions"("ledger_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_accounts_loan_id_key" ON "escrow_accounts"("loan_id");

-- CreateIndex
CREATE INDEX "escrow_accounts_platform_wallet_id_idx" ON "escrow_accounts"("platform_wallet_id");

-- CreateIndex
CREATE INDEX "escrow_accounts_status_idx" ON "escrow_accounts"("status");

-- CreateIndex
CREATE INDEX "escrow_transactions_escrow_account_id_created_at_idx" ON "escrow_transactions"("escrow_account_id", "created_at");

-- CreateIndex
CREATE INDEX "escrow_transactions_ledger_transaction_id_idx" ON "escrow_transactions"("ledger_transaction_id");

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_investor_profile_id_fkey" FOREIGN KEY ("investor_profile_id") REFERENCES "investor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_contributions" ADD CONSTRAINT "investment_contributions_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "investments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_contributions" ADD CONSTRAINT "investment_contributions_ledger_transaction_id_fkey" FOREIGN KEY ("ledger_transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_accounts" ADD CONSTRAINT "escrow_accounts_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_accounts" ADD CONSTRAINT "escrow_accounts_platform_wallet_id_fkey" FOREIGN KEY ("platform_wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_escrow_account_id_fkey" FOREIGN KEY ("escrow_account_id") REFERENCES "escrow_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_ledger_transaction_id_fkey" FOREIGN KEY ("ledger_transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
