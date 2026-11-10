-- CreateEnum
CREATE TYPE "loan_application_status" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'CLOSED');

-- CreateEnum
CREATE TYPE "application_review_decision" AS ENUM ('APPROVED', 'REJECTED', 'REQUEST_INFORMATION', 'PENDING');

-- CreateEnum
CREATE TYPE "information_request_status" AS ENUM ('OPEN', 'RESPONDED', 'EXTENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "loan_offer_status" AS ENUM ('ISSUED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "repayment_frequency" AS ENUM ('MONTHLY');

-- CreateTable
CREATE TABLE "loan_applications" (
    "id" UUID NOT NULL,
    "borrower_profile_id" UUID NOT NULL,
    "current_version_id" UUID,
    "status" "loan_application_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "loan_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_versions" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "submitted_data" JSONB NOT NULL,
    "requested_principal_satang" BIGINT NOT NULL,
    "requested_term_months" INTEGER NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" UUID NOT NULL,

    CONSTRAINT "application_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borrower_financial_information" (
    "id" UUID NOT NULL,
    "application_version_id" UUID NOT NULL,
    "income_data" JSONB NOT NULL,
    "expense_data" JSONB NOT NULL,
    "debt_data" JSONB NOT NULL,
    "credit_data" JSONB NOT NULL,
    "source_metadata" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "borrower_financial_information_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_reviews" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "application_version_id" UUID NOT NULL,
    "reviewer_user_id" UUID NOT NULL,
    "decision" "application_review_decision" NOT NULL,
    "notes" TEXT,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "information_requests" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "request_details" JSONB NOT NULL,
    "status" "information_request_status" NOT NULL DEFAULT 'OPEN',
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "extension_count" INTEGER NOT NULL DEFAULT 0,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "information_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_offers" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "application_version_id" UUID NOT NULL,
    "principal_satang" BIGINT NOT NULL,
    "annual_interest_rate" DECIMAL(65,30) NOT NULL,
    "term_months" INTEGER NOT NULL,
    "repayment_frequency" "repayment_frequency" NOT NULL DEFAULT 'MONTHLY',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "loan_offer_status" NOT NULL DEFAULT 'ISSUED',
    "created_by_user_id" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loan_applications_current_version_id_key" ON "loan_applications"("current_version_id");

-- CreateIndex
CREATE INDEX "loan_applications_borrower_profile_id_status_idx" ON "loan_applications"("borrower_profile_id", "status");

-- CreateIndex
CREATE INDEX "loan_applications_status_created_at_idx" ON "loan_applications"("status", "created_at");

-- CreateIndex
CREATE INDEX "application_versions_application_id_created_at_idx" ON "application_versions"("application_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "application_versions_application_id_version_number_key" ON "application_versions"("application_id", "version_number");

-- CreateIndex
CREATE INDEX "borrower_financial_information_application_version_id_idx" ON "borrower_financial_information"("application_version_id");

-- CreateIndex
CREATE INDEX "application_reviews_application_id_created_at_idx" ON "application_reviews"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "application_reviews_reviewer_user_id_created_at_idx" ON "application_reviews"("reviewer_user_id", "created_at");

-- CreateIndex
CREATE INDEX "information_requests_application_id_status_idx" ON "information_requests"("application_id", "status");

-- CreateIndex
CREATE INDEX "information_requests_status_due_at_idx" ON "information_requests"("status", "due_at");

-- CreateIndex
CREATE INDEX "loan_offers_application_id_status_idx" ON "loan_offers"("application_id", "status");

-- CreateIndex
CREATE INDEX "loan_offers_status_expires_at_idx" ON "loan_offers"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_borrower_profile_id_fkey" FOREIGN KEY ("borrower_profile_id") REFERENCES "borrower_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "application_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_versions" ADD CONSTRAINT "application_versions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_versions" ADD CONSTRAINT "application_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrower_financial_information" ADD CONSTRAINT "borrower_financial_information_application_version_id_fkey" FOREIGN KEY ("application_version_id") REFERENCES "application_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_reviews" ADD CONSTRAINT "application_reviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_reviews" ADD CONSTRAINT "application_reviews_application_version_id_fkey" FOREIGN KEY ("application_version_id") REFERENCES "application_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_reviews" ADD CONSTRAINT "application_reviews_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "information_requests" ADD CONSTRAINT "information_requests_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "information_requests" ADD CONSTRAINT "information_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_offers" ADD CONSTRAINT "loan_offers_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_offers" ADD CONSTRAINT "loan_offers_application_version_id_fkey" FOREIGN KEY ("application_version_id") REFERENCES "application_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_offers" ADD CONSTRAINT "loan_offers_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
