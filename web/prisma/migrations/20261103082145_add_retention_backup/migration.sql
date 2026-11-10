-- CreateEnum
CREATE TYPE "retention_policy_action" AS ENUM ('DELETE', 'ANONYMIZE', 'REVIEW');

-- CreateEnum
CREATE TYPE "retention_policy_status" AS ENUM ('PROPOSED', 'APPROVED', 'ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "retention_execution_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'DEFERRED', 'FAILED');

-- CreateEnum
CREATE TYPE "backup_status" AS ENUM ('CREATED', 'VERIFIED', 'FAILED', 'RESTORED');

-- CreateTable
CREATE TABLE "retention_policies" (
    "id" UUID NOT NULL,
    "policy_code" VARCHAR(80) NOT NULL,
    "data_category" VARCHAR(80) NOT NULL,
    "retention_duration" interval NOT NULL,
    "retention_trigger" VARCHAR(80) NOT NULL,
    "action" "retention_policy_action" NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "retention_policy_status" NOT NULL DEFAULT 'PROPOSED',
    "approved_by_user_id" UUID,
    "effective_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_executions" (
    "id" UUID NOT NULL,
    "retention_policy_id" UUID NOT NULL,
    "target_type" VARCHAR(80) NOT NULL,
    "target_id" UUID NOT NULL,
    "action" VARCHAR(30) NOT NULL,
    "status" "retention_execution_status" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "executed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_records" (
    "id" UUID NOT NULL,
    "backup_type" VARCHAR(50) NOT NULL,
    "storage_reference" VARCHAR(500) NOT NULL,
    "checksum" VARCHAR(128) NOT NULL,
    "encryption_key_reference" VARCHAR(255) NOT NULL,
    "status" "backup_status" NOT NULL DEFAULT 'CREATED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMPTZ(6),

    CONSTRAINT "backup_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retention_policies_policy_code_key" ON "retention_policies"("policy_code");

-- CreateIndex
CREATE INDEX "retention_policies_status_effective_at_idx" ON "retention_policies"("status", "effective_at");

-- CreateIndex
CREATE UNIQUE INDEX "retention_policies_policy_code_version_number_key" ON "retention_policies"("policy_code", "version_number");

-- CreateIndex
CREATE INDEX "retention_executions_status_created_at_idx" ON "retention_executions"("status", "created_at");

-- CreateIndex
CREATE INDEX "retention_executions_target_type_target_id_idx" ON "retention_executions"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "backup_records_status_created_at_idx" ON "backup_records"("status", "created_at");

-- AddForeignKey
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_executions" ADD CONSTRAINT "retention_executions_retention_policy_id_fkey" FOREIGN KEY ("retention_policy_id") REFERENCES "retention_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
