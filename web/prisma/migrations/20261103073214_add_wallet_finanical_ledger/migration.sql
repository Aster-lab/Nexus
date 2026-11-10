-- CreateEnum
CREATE TYPE "wallet_status" AS ENUM ('ACTIVE', 'RESTRICTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "platform_account_type" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "platform_account_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ledger_transaction_status" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ledger_entry_type" AS ENUM ('DEBIT', 'CREDIT');

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID,
    "owner_platform_account_id" UUID,
    "currency" CHAR(3) NOT NULL DEFAULT 'THB',
    "balance_satang" BIGINT NOT NULL DEFAULT 0,
    "status" "wallet_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_accounts" (
    "id" UUID NOT NULL,
    "account_code" VARCHAR(50) NOT NULL,
    "account_name" VARCHAR(150) NOT NULL,
    "account_type" "platform_account_type" NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'THB',
    "status" "platform_account_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL,
    "transaction_type" VARCHAR(50) NOT NULL,
    "status" "ledger_transaction_status" NOT NULL DEFAULT 'DRAFT',
    "idempotency_key" VARCHAR(255),
    "reference_type" VARCHAR(50),
    "reference_id" UUID,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_at" TIMESTAMPTZ(6),
    "reversed_transaction_id" UUID,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "ledger_transaction_id" UUID NOT NULL,
    "wallet_id" UUID,
    "platform_account_id" UUID,
    "entry_type" "ledger_entry_type" NOT NULL,
    "amount_satang" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'THB',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallets_owner_user_id_idx" ON "wallets"("owner_user_id");

-- CreateIndex
CREATE INDEX "wallets_owner_platform_account_id_idx" ON "wallets"("owner_platform_account_id");

-- CreateIndex
CREATE INDEX "wallets_status_idx" ON "wallets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "platform_accounts_account_code_key" ON "platform_accounts"("account_code");

-- CreateIndex
CREATE INDEX "platform_accounts_account_type_status_idx" ON "platform_accounts"("account_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_idempotency_key_key" ON "ledger_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_transactions_status_created_at_idx" ON "ledger_transactions"("status", "created_at");

-- CreateIndex
CREATE INDEX "ledger_transactions_reference_type_reference_id_idx" ON "ledger_transactions"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "ledger_entries_ledger_transaction_id_idx" ON "ledger_entries"("ledger_transaction_id");

-- CreateIndex
CREATE INDEX "ledger_entries_wallet_id_created_at_idx" ON "ledger_entries"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_platform_account_id_created_at_idx" ON "ledger_entries"("platform_account_id", "created_at");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_owner_platform_account_id_fkey" FOREIGN KEY ("owner_platform_account_id") REFERENCES "platform_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_reversed_transaction_id_fkey" FOREIGN KEY ("reversed_transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ledger_transaction_id_fkey" FOREIGN KEY ("ledger_transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_platform_account_id_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "platform_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
