-- CreateEnum
CREATE TYPE "saved_loan_action" AS ENUM ('SAVED', 'UNSAVED');

-- CreateTable
CREATE TABLE "investor_preferences" (
    "id" UUID NOT NULL,
    "investor_profile_id" UUID NOT NULL,
    "preference_data" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "investor_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_behaviors" (
    "id" UUID NOT NULL,
    "investor_profile_id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "loan_id" UUID,
    "event_data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_behaviors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_runs" (
    "id" UUID NOT NULL,
    "investor_profile_id" UUID NOT NULL,
    "model_version_id" UUID,
    "preference_snapshot" JSONB NOT NULL,
    "candidate_set_snapshot" JSONB NOT NULL,
    "input_version" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latency_ms" INTEGER,

    CONSTRAINT "recommendation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_results" (
    "id" UUID NOT NULL,
    "recommendation_run_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "match_score" DECIMAL(30,12) NOT NULL,
    "ranking_position" INTEGER NOT NULL,
    "explanation" JSONB,

    CONSTRAINT "recommendation_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_loans" (
    "id" UUID NOT NULL,
    "investor_profile_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "saved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsaved_at" TIMESTAMPTZ(6),

    CONSTRAINT "saved_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_loan_history" (
    "id" UUID NOT NULL,
    "saved_loan_id" UUID NOT NULL,
    "action" "saved_loan_action" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_loan_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "investor_preferences_investor_profile_id_key" ON "investor_preferences"("investor_profile_id");

-- CreateIndex
CREATE INDEX "investor_behaviors_investor_profile_id_created_at_idx" ON "investor_behaviors"("investor_profile_id", "created_at");

-- CreateIndex
CREATE INDEX "investor_behaviors_loan_id_created_at_idx" ON "investor_behaviors"("loan_id", "created_at");

-- CreateIndex
CREATE INDEX "investor_behaviors_event_type_created_at_idx" ON "investor_behaviors"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "recommendation_runs_investor_profile_id_created_at_idx" ON "recommendation_runs"("investor_profile_id", "created_at");

-- CreateIndex
CREATE INDEX "recommendation_runs_model_version_id_created_at_idx" ON "recommendation_runs"("model_version_id", "created_at");

-- CreateIndex
CREATE INDEX "recommendation_results_loan_id_idx" ON "recommendation_results"("loan_id");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_results_recommendation_run_id_ranking_positi_key" ON "recommendation_results"("recommendation_run_id", "ranking_position");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_results_recommendation_run_id_loan_id_key" ON "recommendation_results"("recommendation_run_id", "loan_id");

-- CreateIndex
CREATE INDEX "saved_loans_investor_profile_id_saved_at_idx" ON "saved_loans"("investor_profile_id", "saved_at");

-- CreateIndex
CREATE INDEX "saved_loans_loan_id_idx" ON "saved_loans"("loan_id");

-- CreateIndex
CREATE INDEX "saved_loan_history_saved_loan_id_created_at_idx" ON "saved_loan_history"("saved_loan_id", "created_at");

-- AddForeignKey
ALTER TABLE "investor_preferences" ADD CONSTRAINT "investor_preferences_investor_profile_id_fkey" FOREIGN KEY ("investor_profile_id") REFERENCES "investor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_behaviors" ADD CONSTRAINT "investor_behaviors_investor_profile_id_fkey" FOREIGN KEY ("investor_profile_id") REFERENCES "investor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_behaviors" ADD CONSTRAINT "investor_behaviors_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_runs" ADD CONSTRAINT "recommendation_runs_investor_profile_id_fkey" FOREIGN KEY ("investor_profile_id") REFERENCES "investor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_runs" ADD CONSTRAINT "recommendation_runs_model_version_id_fkey" FOREIGN KEY ("model_version_id") REFERENCES "model_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_results" ADD CONSTRAINT "recommendation_results_recommendation_run_id_fkey" FOREIGN KEY ("recommendation_run_id") REFERENCES "recommendation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_results" ADD CONSTRAINT "recommendation_results_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_loans" ADD CONSTRAINT "saved_loans_investor_profile_id_fkey" FOREIGN KEY ("investor_profile_id") REFERENCES "investor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_loans" ADD CONSTRAINT "saved_loans_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_loan_history" ADD CONSTRAINT "saved_loan_history_saved_loan_id_fkey" FOREIGN KEY ("saved_loan_id") REFERENCES "saved_loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
