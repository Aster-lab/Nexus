-- CreateEnum
CREATE TYPE "application_document_type" AS ENUM ('IDENTITY', 'INCOME', 'BANK_STATEMENT', 'SUPPORTING');

-- CreateEnum
CREATE TYPE "document_scan_status" AS ENUM ('QUARANTINED', 'PENDING', 'CLEAN', 'INFECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('ACTIVE', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "document_scan_result" AS ENUM ('CLEAN', 'INFECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "document_access_action" AS ENUM ('VIEW', 'DOWNLOAD');

-- CreateEnum
CREATE TYPE "data_access_request_status" AS ENUM ('SUBMITTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "data_correction_request_status" AS ENUM ('SUBMITTED', 'REVIEWING', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateTable
CREATE TABLE "application_documents" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "application_version_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "document_type" "application_document_type" NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "detected_mime_type" VARCHAR(150) NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "checksum" VARCHAR(128) NOT NULL,
    "version_number" INTEGER NOT NULL,
    "scan_status" "document_scan_status" NOT NULL DEFAULT 'QUARANTINED',
    "document_status" "document_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_security_scans" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "scanner_version" VARCHAR(100) NOT NULL,
    "result" "document_scan_result" NOT NULL,
    "details" JSONB,
    "scanned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_security_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_access_logs" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "accessed_by_user_id" UUID NOT NULL,
    "action" "document_access_action" NOT NULL,
    "access_reason" TEXT,
    "outcome" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_access_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "request_type" VARCHAR(40) NOT NULL,
    "status" "data_access_request_status" NOT NULL DEFAULT 'SUBMITTED',
    "verification_status" VARCHAR(30) NOT NULL,
    "export_object_key" VARCHAR(500),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "data_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_correction_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "target_type" VARCHAR(80) NOT NULL,
    "target_id" UUID NOT NULL,
    "requested_change" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "data_correction_request_status" NOT NULL DEFAULT 'SUBMITTED',
    "reviewed_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "data_correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_holds" (
    "id" UUID NOT NULL,
    "target_type" VARCHAR(80) NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_by_user_id" UUID,
    "released_at" TIMESTAMPTZ(6),

    CONSTRAINT "legal_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_documents_application_id_idx" ON "application_documents"("application_id");

-- CreateIndex
CREATE INDEX "application_documents_application_version_id_scan_status_idx" ON "application_documents"("application_version_id", "scan_status");

-- CreateIndex
CREATE INDEX "application_documents_uploaded_by_user_id_idx" ON "application_documents"("uploaded_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_documents_application_version_id_document_type__key" ON "application_documents"("application_version_id", "document_type", "version_number");

-- CreateIndex
CREATE INDEX "document_security_scans_document_id_scanned_at_idx" ON "document_security_scans"("document_id", "scanned_at");

-- CreateIndex
CREATE INDEX "document_security_scans_result_scanned_at_idx" ON "document_security_scans"("result", "scanned_at");

-- CreateIndex
CREATE INDEX "document_access_logs_document_id_created_at_idx" ON "document_access_logs"("document_id", "created_at");

-- CreateIndex
CREATE INDEX "document_access_logs_accessed_by_user_id_created_at_idx" ON "document_access_logs"("accessed_by_user_id", "created_at");

-- CreateIndex
CREATE INDEX "data_access_requests_user_id_created_at_idx" ON "data_access_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "data_access_requests_status_created_at_idx" ON "data_access_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "data_correction_requests_user_id_created_at_idx" ON "data_correction_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "data_correction_requests_status_created_at_idx" ON "data_correction_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "data_correction_requests_target_type_target_id_idx" ON "data_correction_requests"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "legal_holds_target_type_target_id_idx" ON "legal_holds"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "legal_holds_released_at_idx" ON "legal_holds"("released_at");

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_application_version_id_fkey" FOREIGN KEY ("application_version_id") REFERENCES "application_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_security_scans" ADD CONSTRAINT "document_security_scans_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "application_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access_logs" ADD CONSTRAINT "document_access_logs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "application_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access_logs" ADD CONSTRAINT "document_access_logs_accessed_by_user_id_fkey" FOREIGN KEY ("accessed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_access_requests" ADD CONSTRAINT "data_access_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_correction_requests" ADD CONSTRAINT "data_correction_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_correction_requests" ADD CONSTRAINT "data_correction_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_released_by_user_id_fkey" FOREIGN KEY ("released_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
