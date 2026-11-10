-- Domain 9: communication delivery and support-history integrity.
BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "notification_deliveries"
        WHERE "attempt_count" < 0
    ) THEN
        RAISE EXCEPTION 'Domain 9 migration stopped: notification delivery attempt_count cannot be negative.';
    END IF;
END $$;

ALTER TABLE "support_requests"
    ALTER COLUMN "category" TYPE VARCHAR(80);

-- Keep the generic legacy action/value columns and preserve all old records.
-- New records must identify their resulting support status.
ALTER TABLE "support_history"
    ADD COLUMN "previous_status" VARCHAR(30),
    ADD COLUMN "new_status" VARCHAR(30);

ALTER TABLE "support_history"
    ADD CONSTRAINT "support_history_previous_status_valid"
        CHECK ("previous_status" IS NULL OR "previous_status" IN ('SUBMITTED', 'IN_PROGRESS', 'RESOLVED')),
    ADD CONSTRAINT "support_history_new_status_valid"
        CHECK ("new_status" IS NULL OR "new_status" IN ('SUBMITTED', 'IN_PROGRESS', 'RESOLVED'));

ALTER TABLE "notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_attempt_count_nonnegative"
    CHECK ("attempt_count" >= 0);

CREATE OR REPLACE FUNCTION "nexus_require_support_history_new_status"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."new_status" IS NULL THEN
        RAISE EXCEPTION 'new support history rows require new_status';
    END IF;
    IF NEW."actor_user_id" IS NULL THEN
        RAISE EXCEPTION 'new support history rows require actor_user_id';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "support_history_new_status_required"
    BEFORE INSERT ON "support_history"
    FOR EACH ROW EXECUTE FUNCTION "nexus_require_support_history_new_status"();

COMMIT;
