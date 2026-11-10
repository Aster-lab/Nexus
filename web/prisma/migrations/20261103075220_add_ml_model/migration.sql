-- CreateEnum
CREATE TYPE "model_version_status" AS ENUM ('REGISTERED', 'APPROVED', 'REJECTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "model_activation_action" AS ENUM ('APPROVED', 'ACTIVATED', 'ROLLED_BACK', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "prediction_type" AS ENUM ('PRELIMINARY', 'OFFICIAL', 'DIAGNOSTIC');

-- CreateEnum
CREATE TYPE "risk_assessment_status" AS ENUM ('CURRENT', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "modelActivationActions" "model_activation_action"[];

-- CreateTable
CREATE TABLE "model_versions" (
    "id" UUID NOT NULL,
    "model_name" VARCHAR(100) NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "artifact_location" VARCHAR(500) NOT NULL,
    "artifact_checksum" VARCHAR(128) NOT NULL,
    "feature_schema_version" VARCHAR(50) NOT NULL,
    "status" "model_version_status" NOT NULL DEFAULT 'REGISTERED',
    "registered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_activation_history" (
    "id" UUID NOT NULL,
    "model_version_id" UUID NOT NULL,
    "action" "model_activation_action" NOT NULL,
    "performed_by_user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_activation_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_snapshots" (
    "id" UUID NOT NULL,
    "application_version_id" UUID NOT NULL,
    "feature_schema_version" VARCHAR(50) NOT NULL,
    "feature_generation_version" VARCHAR(50) NOT NULL,
    "feature_values" JSONB NOT NULL,
    "feature_units" JSONB NOT NULL,
    "source_mapping" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prediction_records" (
    "id" UUID NOT NULL,
    "feature_snapshot_id" UUID NOT NULL,
    "model_version_id" UUID NOT NULL,
    "prediction_type" "prediction_type" NOT NULL,
    "prediction_output" JSONB NOT NULL,
    "explanation" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prediction_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "application_version_id" UUID NOT NULL,
    "prediction_record_id" UUID NOT NULL,
    "default_probability" DECIMAL(7,6) NOT NULL,
    "risk_grade" VARCHAR(20) NOT NULL,
    "assessment_status" "risk_assessment_status" NOT NULL DEFAULT 'CURRENT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "model_versions_model_name_version_idx" ON "model_versions"("model_name", "version");

-- CreateIndex
CREATE INDEX "model_versions_status_idx" ON "model_versions"("status");

-- CreateIndex
CREATE INDEX "model_activation_history_model_version_id_created_at_idx" ON "model_activation_history"("model_version_id", "created_at");

-- CreateIndex
CREATE INDEX "model_activation_history_performed_by_user_id_idx" ON "model_activation_history"("performed_by_user_id");

-- CreateIndex
CREATE INDEX "feature_snapshots_application_version_id_created_at_idx" ON "feature_snapshots"("application_version_id", "created_at");

-- CreateIndex
CREATE INDEX "prediction_records_feature_snapshot_id_created_at_idx" ON "prediction_records"("feature_snapshot_id", "created_at");

-- CreateIndex
CREATE INDEX "prediction_records_model_version_id_created_at_idx" ON "prediction_records"("model_version_id", "created_at");

-- CreateIndex
CREATE INDEX "prediction_records_prediction_type_created_at_idx" ON "prediction_records"("prediction_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "risk_assessments_prediction_record_id_key" ON "risk_assessments"("prediction_record_id");

-- CreateIndex
CREATE INDEX "risk_assessments_application_id_created_at_idx" ON "risk_assessments"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "risk_assessments_application_version_id_assessment_status_idx" ON "risk_assessments"("application_version_id", "assessment_status");

-- AddForeignKey
ALTER TABLE "model_activation_history" ADD CONSTRAINT "model_activation_history_model_version_id_fkey" FOREIGN KEY ("model_version_id") REFERENCES "model_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_activation_history" ADD CONSTRAINT "model_activation_history_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_snapshots" ADD CONSTRAINT "feature_snapshots_application_version_id_fkey" FOREIGN KEY ("application_version_id") REFERENCES "application_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_records" ADD CONSTRAINT "prediction_records_feature_snapshot_id_fkey" FOREIGN KEY ("feature_snapshot_id") REFERENCES "feature_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_records" ADD CONSTRAINT "prediction_records_model_version_id_fkey" FOREIGN KEY ("model_version_id") REFERENCES "model_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_application_version_id_fkey" FOREIGN KEY ("application_version_id") REFERENCES "application_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_prediction_record_id_fkey" FOREIGN KEY ("prediction_record_id") REFERENCES "prediction_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
