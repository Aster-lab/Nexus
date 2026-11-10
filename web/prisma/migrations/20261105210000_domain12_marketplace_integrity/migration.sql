-- Domain 12: marketplace recommendation and saved-loan integrity.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "recommendation_results" WHERE "ranking_position" <= 0) THEN
        RAISE EXCEPTION 'Domain 12 migration stopped: recommendation ranking positions must be positive.';
    END IF;
    IF EXISTS (SELECT 1 FROM "recommendation_runs" WHERE "latency_ms" < 0) THEN
        RAISE EXCEPTION 'Domain 12 migration stopped: recommendation latency cannot be negative.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "saved_loans" WHERE "unsaved_at" IS NULL
        GROUP BY "investor_profile_id", "loan_id" HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Domain 12 migration stopped: duplicate currently saved investor/loan pairs exist.';
    END IF;
END $$;

ALTER TABLE "recommendation_results"
    ADD CONSTRAINT "recommendation_results_ranking_position_positive"
    CHECK ("ranking_position" > 0);

ALTER TABLE "recommendation_runs"
    ADD CONSTRAINT "recommendation_runs_latency_nonnegative"
    CHECK ("latency_ms" IS NULL OR "latency_ms" >= 0);

CREATE UNIQUE INDEX "saved_loans_one_active_per_investor_loan"
    ON "saved_loans" ("investor_profile_id", "loan_id")
    WHERE "unsaved_at" IS NULL;

COMMIT;
