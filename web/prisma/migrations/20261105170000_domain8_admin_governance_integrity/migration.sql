-- Domain 8: administration, policy versioning, and append-only governance history.
BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "policy_versions"
        WHERE "version_number" <= 0
    ) THEN
        RAISE EXCEPTION 'Domain 8 migration stopped: policy version numbers must be positive.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "policy_versions"
        WHERE "status" = 'ACTIVE'
        GROUP BY "policy_id"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Domain 8 migration stopped: a policy has multiple ACTIVE versions.';
    END IF;
END $$;

ALTER TABLE "policy_versions"
    ADD CONSTRAINT "policy_versions_version_number_positive"
    CHECK ("version_number" > 0);

CREATE UNIQUE INDEX "policy_versions_one_active_per_policy"
    ON "policy_versions" ("policy_id")
    WHERE "status" = 'ACTIVE';

CREATE OR REPLACE FUNCTION "nexus_reject_governance_history_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION '% is append-only; UPDATE and DELETE are not allowed', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER "audit_logs_append_only"
    BEFORE UPDATE OR DELETE ON "audit_logs"
    FOR EACH ROW EXECUTE FUNCTION "nexus_reject_governance_history_mutation"();

CREATE TRIGGER "alert_history_append_only"
    BEFORE UPDATE OR DELETE ON "alert_history"
    FOR EACH ROW EXECUTE FUNCTION "nexus_reject_governance_history_mutation"();

COMMIT;
