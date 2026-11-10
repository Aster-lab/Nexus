-- CreateEnum
CREATE TYPE "loan_status" AS ENUM ('FUNDING', 'FUNDED', 'ACTIVE', 'DELINQUENT', 'DEFEAULTED', 'REPAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "loans" (
    "id" UUID NOT NULL,
    "borrower_profile_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "accepted_offer_id" UUID NOT NULL,
    "principal_satang" BIGINT NOT NULL,
    "funded_satang" BIGINT NOT NULL DEFAULT 0,
    "annual_interest_rate" DECIMAL(8,6) NOT NULL,
    "term_months" INTEGER NOT NULL,
    "status" "loan_status" NOT NULL DEFAULT 'FUNDING',
    "funding_deadline" TIMESTAMPTZ(6) NOT NULL,
    "funded_at" TIMESTAMPTZ(6),
    "disbursed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_status_history" (
    "id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "status" "loan_status" NOT NULL,
    "reason" TEXT,
    "changed_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loans_accepted_offer_id_key" ON "loans"("accepted_offer_id");

-- CreateIndex
CREATE INDEX "loans_borrower_profile_id_idx" ON "loans"("borrower_profile_id");

-- CreateIndex
CREATE INDEX "loans_application_id_idx" ON "loans"("application_id");

-- CreateIndex
CREATE INDEX "loans_status_funding_deadline_idx" ON "loans"("status", "funding_deadline");

-- CreateIndex
CREATE INDEX "loan_status_history_loan_id_created_at_idx" ON "loan_status_history"("loan_id", "created_at");

-- CreateIndex
CREATE INDEX "loan_status_history_changed_by_user_id_idx" ON "loan_status_history"("changed_by_user_id");

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_borrower_profile_id_fkey" FOREIGN KEY ("borrower_profile_id") REFERENCES "borrower_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_accepted_offer_id_fkey" FOREIGN KEY ("accepted_offer_id") REFERENCES "loan_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_status_history" ADD CONSTRAINT "loan_status_history_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_status_history" ADD CONSTRAINT "loan_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
