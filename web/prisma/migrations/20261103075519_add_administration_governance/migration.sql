-- CreateEnum
CREATE TYPE "policy_version_status" AS ENUM ('PROPOSED', 'APPROVED', 'SCHEDULED', 'ACTIVE', 'SUPERSEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "alert_priority" AS ENUM ('INFORMATIONAL', 'LOW', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "alert_status" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'ASSIGNED', 'OVERDUE', 'RESOLVED');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "target_type" VARCHAR(80) NOT NULL,
    "target_id" UUID,
    "reason" TEXT,
    "old_values" JSONB,
    "new_values" JSONB,
    "outcome" VARCHAR(30) NOT NULL,
    "correlation_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_policies" (
    "id" UUID NOT NULL,
    "policy_code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_versions" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "policy_values" JSONB NOT NULL,
    "status" "policy_version_status" NOT NULL DEFAULT 'PROPOSED',
    "approved_by_user_id" UUID,
    "effective_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "alert_type" VARCHAR(80) NOT NULL,
    "priority" "alert_priority" NOT NULL,
    "status" "alert_status" NOT NULL DEFAULT 'OPEN',
    "target_type" VARCHAR(80),
    "target_id" UUID,
    "assigned_to_user_id" UUID,
    "due_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_history" (
    "id" UUID NOT NULL,
    "alert_id" UUID NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "actor_user_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "platform_policies_policy_code_key" ON "platform_policies"("policy_code");

-- CreateIndex
CREATE INDEX "policy_versions_policy_id_status_idx" ON "policy_versions"("policy_id", "status");

-- CreateIndex
CREATE INDEX "policy_versions_status_effective_at_idx" ON "policy_versions"("status", "effective_at");

-- CreateIndex
CREATE UNIQUE INDEX "policy_versions_policy_id_version_number_key" ON "policy_versions"("policy_id", "version_number");

-- CreateIndex
CREATE INDEX "alerts_status_priority_idx" ON "alerts"("status", "priority");

-- CreateIndex
CREATE INDEX "alerts_assigned_to_user_id_status_idx" ON "alerts"("assigned_to_user_id", "status");

-- CreateIndex
CREATE INDEX "alerts_due_at_status_idx" ON "alerts"("due_at", "status");

-- CreateIndex
CREATE INDEX "alert_history_alert_id_created_at_idx" ON "alert_history"("alert_id", "created_at");

-- CreateIndex
CREATE INDEX "alert_history_actor_user_id_idx" ON "alert_history"("actor_user_id");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "platform_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
