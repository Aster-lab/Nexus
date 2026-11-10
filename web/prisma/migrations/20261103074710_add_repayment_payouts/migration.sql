-- CreateEnum
CREATE TYPE "installment_status" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "repayment_status" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "investor_payout_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "repayment_schedules" (
    "id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "current_version_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repayment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_versions" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "calculation_method" VARCHAR(40) NOT NULL DEFAULT 'REDUCING_BALANCE',
    "interest_rate_type" VARCHAR(20) NOT NULL DEFAULT 'FIXED',
    "day_count_convention" VARCHAR(20) NOT NULL DEFAULT 'ACTUAL_365',
    "payment_frequency" VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
    "annual_interest_rate" DECIMAL(8,6) NOT NULL,
    "rounding_method" VARCHAR(50) NOT NULL,
    "schedule_inputs" JSONB NOT NULL,
    "schedule_snapshot" JSONB NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" UUID NOT NULL,
    "schedule_version_id" UUID NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "opening_principal_satang" BIGINT NOT NULL,
    "principal_due_satang" BIGINT NOT NULL,
    "interest_due_satang" BIGINT NOT NULL,
    "paid_principal_satang" BIGINT NOT NULL DEFAULT 0,
    "paid_interest_satang" BIGINT NOT NULL DEFAULT 0,
    "status" "installment_status" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repayments" (
    "id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "installment_id" UUID NOT NULL,
    "ledger_transaction_id" UUID NOT NULL,
    "principal_satang" BIGINT NOT NULL DEFAULT 0,
    "interest_satang" BIGINT NOT NULL DEFAULT 0,
    "fee_satang" BIGINT NOT NULL DEFAULT 0,
    "total_satang" BIGINT NOT NULL,
    "status" "repayment_status" NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repayments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_allocations" (
    "id" UUID NOT NULL,
    "repayment_id" UUID NOT NULL,
    "investment_id" UUID NOT NULL,
    "principal_satang" BIGINT NOT NULL DEFAULT 0,
    "interest_satang" BIGINT NOT NULL DEFAULT 0,
    "recovery_satang" BIGINT NOT NULL DEFAULT 0,
    "allocation_method" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_payouts" (
    "id" UUID NOT NULL,
    "investor_profile_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "payout_allocation_id" UUID NOT NULL,
    "principal_satang" BIGINT NOT NULL DEFAULT 0,
    "interest_satang" BIGINT NOT NULL DEFAULT 0,
    "status" "investor_payout_status" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" VARCHAR(255) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "ledger_transaction_id" UUID,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repayment_schedules_loan_id_key" ON "repayment_schedules"("loan_id");

-- CreateIndex
CREATE UNIQUE INDEX "repayment_schedules_current_version_id_key" ON "repayment_schedules"("current_version_id");

-- CreateIndex
CREATE INDEX "schedule_versions_schedule_id_idx" ON "schedule_versions"("schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_versions_schedule_id_version_number_key" ON "schedule_versions"("schedule_id", "version_number");

-- CreateIndex
CREATE INDEX "installments_due_date_status_idx" ON "installments"("due_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "installments_schedule_version_id_installment_number_key" ON "installments"("schedule_version_id", "installment_number");

-- CreateIndex
CREATE INDEX "repayments_loan_id_received_at_idx" ON "repayments"("loan_id", "received_at");

-- CreateIndex
CREATE INDEX "repayments_installment_id_idx" ON "repayments"("installment_id");

-- CreateIndex
CREATE INDEX "repayments_ledger_transaction_id_idx" ON "repayments"("ledger_transaction_id");

-- CreateIndex
CREATE INDEX "payout_allocations_investment_id_idx" ON "payout_allocations"("investment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_allocations_repayment_id_investment_id_key" ON "payout_allocations"("repayment_id", "investment_id");

-- CreateIndex
CREATE UNIQUE INDEX "investor_payouts_payout_allocation_id_key" ON "investor_payouts"("payout_allocation_id");

-- CreateIndex
CREATE UNIQUE INDEX "investor_payouts_idempotency_key_key" ON "investor_payouts"("idempotency_key");

-- CreateIndex
CREATE INDEX "investor_payouts_status_next_retry_at_idx" ON "investor_payouts"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "investor_payouts_investor_profile_id_created_at_idx" ON "investor_payouts"("investor_profile_id", "created_at");

-- AddForeignKey
ALTER TABLE "repayment_schedules" ADD CONSTRAINT "repayment_schedules_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayment_schedules" ADD CONSTRAINT "repayment_schedules_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "schedule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_versions" ADD CONSTRAINT "schedule_versions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "repayment_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_schedule_version_id_fkey" FOREIGN KEY ("schedule_version_id") REFERENCES "schedule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayments" ADD CONSTRAINT "repayments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayments" ADD CONSTRAINT "repayments_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayments" ADD CONSTRAINT "repayments_ledger_transaction_id_fkey" FOREIGN KEY ("ledger_transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_allocations" ADD CONSTRAINT "payout_allocations_repayment_id_fkey" FOREIGN KEY ("repayment_id") REFERENCES "repayments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_allocations" ADD CONSTRAINT "payout_allocations_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "investments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_payouts" ADD CONSTRAINT "investor_payouts_investor_profile_id_fkey" FOREIGN KEY ("investor_profile_id") REFERENCES "investor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_payouts" ADD CONSTRAINT "investor_payouts_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_payouts" ADD CONSTRAINT "investor_payouts_payout_allocation_id_fkey" FOREIGN KEY ("payout_allocation_id") REFERENCES "payout_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_payouts" ADD CONSTRAINT "investor_payouts_ledger_transaction_id_fkey" FOREIGN KEY ("ledger_transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
