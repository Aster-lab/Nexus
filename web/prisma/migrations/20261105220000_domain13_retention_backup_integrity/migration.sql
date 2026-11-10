-- Domain 13: versioned retention policies, execution evidence, and backup metadata.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "retention_policies" WHERE "version_number" <= 0) THEN
        RAISE EXCEPTION 'Domain 13 migration stopped: retention policy version numbers must be positive.';
    END IF;
    IF EXISTS (SELECT 1 FROM "retention_policies" WHERE "retention_duration" IS NOT NULL AND "retention_duration" <= INTERVAL '0 seconds') THEN
        RAISE EXCEPTION 'Domain 13 migration stopped: retention durations must be positive.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "retention_policies"
        WHERE "status" IN ('APPROVED', 'ACTIVE')
          AND ("retention_duration" IS NULL OR "approved_by_user_id" IS NULL)
    ) THEN
        RAISE EXCEPTION 'Domain 13 migration stopped: approved/active retention policies need a duration and approver; confirm compliance review state.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "retention_policies" WHERE "status" = 'ACTIVE'
        GROUP BY "policy_code" HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Domain 13 migration stopped: multiple active versions exist for one retention policy.';
    END IF;
    IF EXISTS (SELECT 1 FROM "retention_executions" WHERE "status" = 'COMPLETED' AND "executed_at" IS NULL) THEN
        RAISE EXCEPTION 'Domain 13 migration stopped: completed retention executions need executed_at.';
    END IF;
    IF EXISTS (SELECT 1 FROM "backup_records" WHERE "status" = 'VERIFIED' AND "verified_at" IS NULL) THEN
        RAISE EXCEPTION 'Domain 13 migration stopped: verified backup records need verified_at.';
    END IF;
END $$;

DROP INDEX "retention_policies_policy_code_key";

ALTER TABLE "retention_policies"
    ADD CONSTRAINT "retention_policies_version_number_positive" CHECK ("version_number" > 0),
    ADD CONSTRAINT "retention_policies_duration_positive" CHECK (
        "retention_duration" IS NULL OR "retention_duration" > INTERVAL '0 seconds'
    ),
    ADD CONSTRAINT "retention_policies_approval_prerequisites" CHECK (
        "status" NOT IN ('APPROVED', 'ACTIVE')
        OR ("retention_duration" IS NOT NULL AND "approved_by_user_id" IS NOT NULL)
    );

CREATE UNIQUE INDEX "retention_policies_one_active_per_code"
    ON "retention_policies" ("policy_code")
    WHERE "status" = 'ACTIVE';

ALTER TABLE "retention_executions"
    ADD CONSTRAINT "retention_executions_completed_timestamp" CHECK (
        "status" <> 'COMPLETED' OR "executed_at" IS NOT NULL
    );

ALTER TABLE "backup_records"
    ADD CONSTRAINT "backup_records_verified_timestamp" CHECK (
        "status" <> 'VERIFIED' OR "verified_at" IS NOT NULL
    ),
    ADD CONSTRAINT "backup_records_references_nonempty" CHECK (
        LENGTH(BTRIM("storage_reference")) > 0
        AND LENGTH(BTRIM("encryption_key_reference")) > 0
        AND LENGTH(BTRIM("checksum")) > 0
    );

COMMIT;
