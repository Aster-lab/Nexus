-- Domain 10: withdrawal, idempotency, and durable outbox integrity.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "withdrawal_requests" WHERE "amount_satang" <= 0) THEN
        RAISE EXCEPTION 'Domain 10 migration stopped: withdrawal amounts must be positive.';
    END IF;
    IF EXISTS (SELECT 1 FROM "withdrawal_requests" WHERE "status" = 'COMPLETED' AND ("completed_at" IS NULL OR "ledger_transaction_id" IS NULL)) THEN
        RAISE EXCEPTION 'Domain 10 migration stopped: completed withdrawals need completion time and ledger reference.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "withdrawal_requests" wr
        JOIN "wallets" w ON w."id" = wr."wallet_id"
        WHERE w."owner_user_id" IS DISTINCT FROM wr."user_id"
    ) THEN
        RAISE EXCEPTION 'Domain 10 migration stopped: a withdrawal wallet is not owned by its recorded user.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "withdrawal_requests" wr
        JOIN "ledger_transactions" lt ON lt."id" = wr."ledger_transaction_id"
        WHERE wr."status" = 'COMPLETED' AND lt."status" <> 'POSTED'
    ) THEN
        RAISE EXCEPTION 'Domain 10 migration stopped: a completed withdrawal references a non-POSTED ledger transaction.';
    END IF;
    IF EXISTS (SELECT 1 FROM "idempotency_records" WHERE ("status" = 'PROCESSING' AND "completed_at" IS NOT NULL) OR ("status" = 'COMPLETED' AND "completed_at" IS NULL)) THEN
        RAISE EXCEPTION 'Domain 10 migration stopped: idempotency completion timestamps conflict with status.';
    END IF;
    IF EXISTS (SELECT 1 FROM "outbox_events" WHERE "attempt_count" < 0) THEN
        RAISE EXCEPTION 'Domain 10 migration stopped: outbox attempt_count cannot be negative.';
    END IF;
    IF EXISTS (SELECT 1 FROM "outbox_events" WHERE "status" = 'COMPLETED' AND "completed_at" IS NULL) THEN
        RAISE EXCEPTION 'Domain 10 migration stopped: completed outbox events need completed_at.';
    END IF;
END $$;

ALTER TABLE "withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_amount_positive" CHECK ("amount_satang" > 0),
    ADD CONSTRAINT "withdrawal_requests_completed_fields" CHECK (
        "status" <> 'COMPLETED' OR ("completed_at" IS NOT NULL AND "ledger_transaction_id" IS NOT NULL)
    );

ALTER TABLE "idempotency_records"
    ADD CONSTRAINT "idempotency_records_completion_matches_status" CHECK (
        ("status" = 'PROCESSING' AND "completed_at" IS NULL)
        OR ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL)
        OR "status" = 'FAILED'
    );

ALTER TABLE "outbox_events"
    ADD CONSTRAINT "outbox_events_attempt_count_nonnegative" CHECK ("attempt_count" >= 0),
    ADD CONSTRAINT "outbox_events_completed_timestamp" CHECK (
        "status" <> 'COMPLETED' OR "completed_at" IS NOT NULL
    );

CREATE OR REPLACE FUNCTION "nexus_validate_withdrawal_integrity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    wallet_owner UUID;
    ledger_status "ledger_transaction_status";
BEGIN
    SELECT "owner_user_id" INTO wallet_owner
    FROM "wallets" WHERE "id" = NEW."wallet_id";
    IF wallet_owner IS DISTINCT FROM NEW."user_id" THEN
        RAISE EXCEPTION 'withdrawal wallet must belong to the recorded user';
    END IF;
    IF NEW."status" = 'COMPLETED' THEN
        IF NEW."completed_at" IS NULL OR NEW."ledger_transaction_id" IS NULL THEN
            RAISE EXCEPTION 'completed withdrawals require completed_at and a ledger transaction';
        END IF;
        SELECT "status" INTO ledger_status
        FROM "ledger_transactions" WHERE "id" = NEW."ledger_transaction_id";
        IF ledger_status IS DISTINCT FROM 'POSTED'::"ledger_transaction_status" THEN
            RAISE EXCEPTION 'completed withdrawals require a POSTED ledger transaction';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "withdrawal_requests_integrity"
    BEFORE INSERT OR UPDATE ON "withdrawal_requests"
    FOR EACH ROW EXECUTE FUNCTION "nexus_validate_withdrawal_integrity"();

COMMIT;
