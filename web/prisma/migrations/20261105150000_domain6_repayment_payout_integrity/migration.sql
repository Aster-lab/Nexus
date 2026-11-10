-- Domain 6 schedule, repayment, allocation, and payout integrity safeguards.
BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "repayment_schedules" rs
        JOIN "schedule_versions" sv ON sv."id" = rs."current_version_id"
        WHERE rs."current_version_id" IS NOT NULL AND rs."id" <> sv."schedule_id"
    ) THEN
        RAISE EXCEPTION 'Domain 6 migration stopped: a repayment schedule points to a version owned by another schedule.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "schedule_versions" WHERE "version_number" <= 0
    ) OR EXISTS (
        SELECT 1 FROM "installments"
        WHERE "installment_number" <= 0
           OR "opening_principal_satang" < 0
           OR "principal_due_satang" < 0
           OR "interest_due_satang" < 0
           OR "paid_principal_satang" < 0
           OR "paid_interest_satang" < 0
           OR "paid_principal_satang" > "principal_due_satang"
           OR "paid_interest_satang" > "interest_due_satang"
    ) THEN
        RAISE EXCEPTION 'Domain 6 migration stopped: schedule versions or installments contain invalid numbers or amounts.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "repayments" WHERE "status" = 'REVERSED'
    ) THEN
        RAISE EXCEPTION 'Domain 6 migration stopped: existing REVERSED repayments need review under the confirmed compensating-repayment rule.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "repayments" r
        JOIN "ledger_transactions" t ON t."id" = r."ledger_transaction_id"
        WHERE r."principal_satang" < 0
           OR r."interest_satang" < 0
           OR r."fee_satang" < 0
           OR r."total_satang" <= 0
           OR r."total_satang" <> r."principal_satang" + r."interest_satang" + r."fee_satang"
           OR r."status" <> 'POSTED'
           OR t."status" <> 'POSTED'
    ) THEN
        RAISE EXCEPTION 'Domain 6 migration stopped: repayment components, totals, status, or linked ledger status are inconsistent.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "repayments" r
        JOIN "installments" i ON i."id" = r."installment_id"
        JOIN "schedule_versions" sv ON sv."id" = i."schedule_version_id"
        JOIN "repayment_schedules" rs ON rs."id" = sv."schedule_id"
        WHERE r."loan_id" <> rs."loan_id"
    ) THEN
        RAISE EXCEPTION 'Domain 6 migration stopped: a repayment installment belongs to a different loan.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "payout_allocations" pa
        JOIN "repayments" r ON r."id" = pa."repayment_id"
        JOIN "investments" i ON i."id" = pa."investment_id"
        WHERE i."loan_id" <> r."loan_id"
           OR pa."principal_satang" < 0
           OR pa."interest_satang" < 0
           OR pa."recovery_satang" < 0
    ) THEN
        RAISE EXCEPTION 'Domain 6 migration stopped: payout allocations contain invalid amounts or link investments from another loan.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "repayments" r
        LEFT JOIN "payout_allocations" pa ON pa."repayment_id" = r."id"
        GROUP BY r."id", r."principal_satang", r."interest_satang"
        HAVING COALESCE(SUM(pa."principal_satang"), 0) <> r."principal_satang"
            OR COALESCE(SUM(pa."interest_satang"), 0) <> r."interest_satang"
    ) THEN
        RAISE EXCEPTION 'Domain 6 migration stopped: payout allocation principal/interest totals do not match repayments.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "investor_payouts" p
        JOIN "payout_allocations" pa ON pa."id" = p."payout_allocation_id"
        JOIN "investments" i ON i."id" = pa."investment_id"
        JOIN "investor_profiles" ip ON ip."id" = i."investor_profile_id"
        JOIN "wallets" w ON w."id" = p."wallet_id"
        WHERE p."investor_profile_id" <> i."investor_profile_id"
           OR p."principal_satang" <> pa."principal_satang"
           OR p."interest_satang" <> pa."interest_satang"
           OR w."owner_user_id" <> ip."user_id"
           OR w."owner_platform_account_id" IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Domain 6 migration stopped: an investor payout does not match its allocation or investor wallet.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "investor_payouts"
        WHERE ("status" = 'COMPLETED' AND ("completed_at" IS NULL OR "ledger_transaction_id" IS NULL))
           OR ("status" <> 'COMPLETED' AND "completed_at" IS NOT NULL)
           OR "attempt_count" < 0
           OR "principal_satang" < 0
           OR "interest_satang" < 0
    ) THEN
        RAISE EXCEPTION 'Domain 6 migration stopped: payout completion links, amounts, or attempt counts are inconsistent.';
    END IF;
END $$;

-- A schedule's current version must belong to that schedule.
CREATE UNIQUE INDEX "schedule_versions_schedule_id_id_key"
    ON "schedule_versions" ("schedule_id", "id");
CREATE UNIQUE INDEX "repayment_schedules_id_current_version_id_key"
    ON "repayment_schedules" ("id", "current_version_id");

ALTER TABLE "repayment_schedules"
    DROP CONSTRAINT "repayment_schedules_current_version_id_fkey",
    ADD CONSTRAINT "repayment_schedules_current_version_same_schedule_fkey"
    FOREIGN KEY ("id", "current_version_id")
    REFERENCES "schedule_versions" ("schedule_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "repayments"
    ADD COLUMN "reversal_of_repayment_id" UUID,
    ADD CONSTRAINT "repayments_reversal_of_repayment_id_fkey"
    FOREIGN KEY ("reversal_of_repayment_id") REFERENCES "repayments"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "repayments_components_nonnegative"
    CHECK ("principal_satang" >= 0 AND "interest_satang" >= 0 AND "fee_satang" >= 0),
    ADD CONSTRAINT "repayments_total_positive"
    CHECK ("total_satang" > 0),
    ADD CONSTRAINT "repayments_total_matches_components"
    CHECK ("total_satang" = "principal_satang" + "interest_satang" + "fee_satang"),
    ADD CONSTRAINT "repayments_not_self_compensating"
    CHECK ("reversal_of_repayment_id" IS NULL OR "reversal_of_repayment_id" <> "id");

CREATE INDEX "repayments_reversal_of_repayment_id_idx"
    ON "repayments" ("reversal_of_repayment_id");

ALTER TABLE "schedule_versions"
    ADD CONSTRAINT "schedule_versions_version_number_positive"
    CHECK ("version_number" > 0);

ALTER TABLE "installments"
    ADD CONSTRAINT "installments_number_positive"
    CHECK ("installment_number" > 0),
    ADD CONSTRAINT "installments_scheduled_amounts_nonnegative"
    CHECK ("opening_principal_satang" >= 0 AND "principal_due_satang" >= 0 AND "interest_due_satang" >= 0),
    ADD CONSTRAINT "installments_paid_amounts_within_due"
    CHECK ("paid_principal_satang" >= 0 AND "paid_principal_satang" <= "principal_due_satang"
       AND "paid_interest_satang" >= 0 AND "paid_interest_satang" <= "interest_due_satang");

ALTER TABLE "payout_allocations"
    ADD CONSTRAINT "payout_allocations_amounts_nonnegative"
    CHECK ("principal_satang" >= 0 AND "interest_satang" >= 0 AND "recovery_satang" >= 0);

ALTER TABLE "investor_payouts"
    ADD CONSTRAINT "investor_payouts_amounts_nonnegative"
    CHECK ("principal_satang" >= 0 AND "interest_satang" >= 0),
    ADD CONSTRAINT "investor_payouts_attempt_count_nonnegative"
    CHECK ("attempt_count" >= 0),
    ADD CONSTRAINT "investor_payouts_completion_link_required"
    CHECK (("status" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "ledger_transaction_id" IS NOT NULL)
        OR ("status" <> 'COMPLETED' AND "completed_at" IS NULL));

-- Schedule versions are immutable; installment terms remain fixed while payment totals/status may advance.
CREATE FUNCTION "prevent_schedule_version_mutation"()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Schedule versions are immutable; create a new schedule version instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "schedule_versions_immutable"
    BEFORE UPDATE OR DELETE ON "schedule_versions"
    FOR EACH ROW EXECUTE FUNCTION "prevent_schedule_version_mutation"();

CREATE FUNCTION "protect_installment_terms"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD."paid_principal_satang" <> 0 OR OLD."paid_interest_satang" <> 0 THEN
            RAISE EXCEPTION 'An installment with payment history cannot be deleted.';
        END IF;
        RETURN OLD;
    END IF;

    IF ROW(NEW."schedule_version_id", NEW."installment_number", NEW."due_date",
           NEW."opening_principal_satang", NEW."principal_due_satang", NEW."interest_due_satang")
       IS DISTINCT FROM
       ROW(OLD."schedule_version_id", OLD."installment_number", OLD."due_date",
           OLD."opening_principal_satang", OLD."principal_due_satang", OLD."interest_due_satang") THEN
        RAISE EXCEPTION 'Installment terms are immutable; create a new schedule version instead.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "installments_protect_schedule_terms"
    BEFORE UPDATE OR DELETE ON "installments"
    FOR EACH ROW EXECUTE FUNCTION "protect_installment_terms"();

CREATE FUNCTION "enforce_repayment_rules"()
RETURNS TRIGGER AS $$
DECLARE
    v_installment_loan_id UUID;
    v_original_loan_id UUID;
    v_original_installment_id UUID;
    v_original_status "repayment_status";
    v_ledger_status "ledger_transaction_status";
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'Repayment records are immutable; create a linked compensating repayment.';
    END IF;
    IF NEW."status" <> 'POSTED' THEN
        RAISE EXCEPTION 'New repayment records must be POSTED; corrections use linked compensating repayments.';
    END IF;
    IF NEW."principal_satang" < 0 OR NEW."interest_satang" < 0 OR NEW."fee_satang" < 0
       OR NEW."total_satang" <= 0
       OR NEW."total_satang" <> NEW."principal_satang" + NEW."interest_satang" + NEW."fee_satang" THEN
        RAISE EXCEPTION 'Repayment total must be positive and equal principal plus interest plus fee.';
    END IF;

    SELECT rs."loan_id" INTO v_installment_loan_id
    FROM "installments" i
    JOIN "schedule_versions" sv ON sv."id" = i."schedule_version_id"
    JOIN "repayment_schedules" rs ON rs."id" = sv."schedule_id"
    WHERE i."id" = NEW."installment_id";
    IF NOT FOUND OR v_installment_loan_id <> NEW."loan_id" THEN
        RAISE EXCEPTION 'Repayment installment must belong to the same loan.';
    END IF;

    SELECT "status" INTO v_ledger_status FROM "ledger_transactions"
    WHERE "id" = NEW."ledger_transaction_id" FOR UPDATE;
    IF NOT FOUND OR v_ledger_status <> 'POSTED' THEN
        RAISE EXCEPTION 'Repayments must reference a POSTED ledger transaction.';
    END IF;

    IF NEW."reversal_of_repayment_id" IS NOT NULL THEN
        SELECT "loan_id", "installment_id", "status"
          INTO v_original_loan_id, v_original_installment_id, v_original_status
        FROM "repayments" WHERE "id" = NEW."reversal_of_repayment_id" FOR UPDATE;
        IF NOT FOUND OR v_original_status <> 'POSTED'
           OR v_original_loan_id <> NEW."loan_id"
           OR v_original_installment_id <> NEW."installment_id"
           OR NEW."reversal_of_repayment_id" = NEW."id" THEN
            RAISE EXCEPTION 'A compensating repayment must link to a POSTED repayment for the same loan and installment.';
        END IF;
        IF NEW."ledger_transaction_id" = (SELECT "ledger_transaction_id" FROM "repayments" WHERE "id" = NEW."reversal_of_repayment_id") THEN
            RAISE EXCEPTION 'A compensating repayment must use a separate ledger transaction.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "prevent_payout_allocation_mutation"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'Payout allocation history is immutable; correct it with compensating financial records.';
    END IF;
    IF NEW."principal_satang" < 0 OR NEW."interest_satang" < 0 OR NEW."recovery_satang" < 0 THEN
        RAISE EXCEPTION 'Payout allocation components cannot be negative.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "repayments" r
        JOIN "investments" i ON i."loan_id" = r."loan_id"
        WHERE r."id" = NEW."repayment_id" AND i."id" = NEW."investment_id"
    ) THEN
        RAISE EXCEPTION 'Payout allocation investment must belong to the repayment loan.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "assert_repayment_allocation_totals"(p_repayment_id UUID)
RETURNS VOID AS $$
DECLARE
    v_principal BIGINT;
    v_interest BIGINT;
    v_status "repayment_status";
    v_allocated_principal NUMERIC;
    v_allocated_interest NUMERIC;
BEGIN
    SELECT "principal_satang", "interest_satang", "status"
      INTO v_principal, v_interest, v_status
    FROM "repayments" WHERE "id" = p_repayment_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    IF v_status <> 'POSTED' THEN
        RAISE EXCEPTION 'Repayment records must remain POSTED; use a compensating record for corrections.';
    END IF;
    SELECT COALESCE(SUM("principal_satang"), 0), COALESCE(SUM("interest_satang"), 0)
      INTO v_allocated_principal, v_allocated_interest
    FROM "payout_allocations" WHERE "repayment_id" = p_repayment_id;
    IF v_allocated_principal <> v_principal OR v_allocated_interest <> v_interest THEN
        RAISE EXCEPTION 'Payout allocations for repayment % must exactly reconcile to principal and interest.', p_repayment_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "assert_installment_paid_totals"(p_installment_id UUID)
RETURNS VOID AS $$
DECLARE
    v_paid_principal BIGINT;
    v_paid_interest BIGINT;
    v_expected_principal NUMERIC;
    v_expected_interest NUMERIC;
BEGIN
    SELECT "paid_principal_satang", "paid_interest_satang"
      INTO v_paid_principal, v_paid_interest
    FROM "installments" WHERE "id" = p_installment_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    SELECT COALESCE(SUM(CASE WHEN "reversal_of_repayment_id" IS NULL THEN "principal_satang" ELSE -"principal_satang" END), 0),
           COALESCE(SUM(CASE WHEN "reversal_of_repayment_id" IS NULL THEN "interest_satang" ELSE -"interest_satang" END), 0)
      INTO v_expected_principal, v_expected_interest
    FROM "repayments"
    WHERE "installment_id" = p_installment_id AND "status" = 'POSTED';
    IF v_paid_principal::NUMERIC <> v_expected_principal OR v_paid_interest::NUMERIC <> v_expected_interest THEN
        RAISE EXCEPTION 'Installment paid totals do not reconcile to posted repayment records.';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "check_repayment_domain_after_insert"()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM "assert_repayment_allocation_totals"(NEW."id");
    PERFORM "assert_installment_paid_totals"(NEW."installment_id");
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "check_allocation_domain_after_change"()
RETURNS TRIGGER AS $$
DECLARE
    v_repayment_id UUID;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        v_repayment_id := OLD."repayment_id";
        PERFORM "assert_repayment_allocation_totals"(v_repayment_id);
    END IF;
    IF TG_OP <> 'DELETE' THEN
        v_repayment_id := NEW."repayment_id";
        PERFORM "assert_repayment_allocation_totals"(v_repayment_id);
        RETURN NEW;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "check_installment_paid_totals_after_change"()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM "assert_installment_paid_totals"(NEW."id");
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "enforce_investor_payout_rules"()
RETURNS TRIGGER AS $$
DECLARE
    v_investor_profile_id UUID;
    v_investor_user_id UUID;
    v_wallet_owner_user_id UUID;
    v_wallet_owner_platform_id UUID;
    v_principal BIGINT;
    v_interest BIGINT;
    v_ledger_status "ledger_transaction_status";
BEGIN
    IF NEW."principal_satang" < 0 OR NEW."interest_satang" < 0 OR NEW."attempt_count" < 0 THEN
        RAISE EXCEPTION 'Investor payout amounts and attempt count cannot be negative.';
    END IF;
    SELECT i."investor_profile_id", ip."user_id", w."owner_user_id", w."owner_platform_account_id",
           pa."principal_satang", pa."interest_satang"
      INTO v_investor_profile_id, v_investor_user_id, v_wallet_owner_user_id, v_wallet_owner_platform_id,
           v_principal, v_interest
    FROM "payout_allocations" pa
    JOIN "investments" i ON i."id" = pa."investment_id"
    JOIN "investor_profiles" ip ON ip."id" = i."investor_profile_id"
    JOIN "wallets" w ON w."id" = NEW."wallet_id"
    WHERE pa."id" = NEW."payout_allocation_id";
    IF NOT FOUND OR NEW."investor_profile_id" <> v_investor_profile_id
       OR v_wallet_owner_user_id <> v_investor_user_id
       OR v_wallet_owner_platform_id IS NOT NULL
       OR NEW."principal_satang" <> v_principal
       OR NEW."interest_satang" <> v_interest THEN
        RAISE EXCEPTION 'Investor payout must match its allocation and credit the owning investor wallet.';
    END IF;

    IF NEW."ledger_transaction_id" IS NOT NULL THEN
        SELECT "status" INTO v_ledger_status FROM "ledger_transactions"
        WHERE "id" = NEW."ledger_transaction_id" FOR UPDATE;
        IF NOT FOUND OR v_ledger_status <> 'POSTED' THEN
            RAISE EXCEPTION 'Investor payout ledger reference must be POSTED.';
        END IF;
    END IF;
    IF NEW."status" = 'COMPLETED'
       AND (NEW."ledger_transaction_id" IS NULL OR NEW."completed_at" IS NULL) THEN
        RAISE EXCEPTION 'Completed investor payouts require a posted ledger transaction and completion timestamp.';
    END IF;
    IF NEW."status" <> 'COMPLETED' AND NEW."completed_at" IS NOT NULL THEN
        RAISE EXCEPTION 'Only completed investor payouts may have completed_at set.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "repayments_enforce_rules"
    BEFORE INSERT OR UPDATE OR DELETE ON "repayments"
    FOR EACH ROW EXECUTE FUNCTION "enforce_repayment_rules"();

CREATE TRIGGER "payout_allocations_enforce_rules"
    BEFORE INSERT OR UPDATE OR DELETE ON "payout_allocations"
    FOR EACH ROW EXECUTE FUNCTION "prevent_payout_allocation_mutation"();

CREATE TRIGGER "investor_payouts_enforce_rules"
    BEFORE INSERT OR UPDATE ON "investor_payouts"
    FOR EACH ROW EXECUTE FUNCTION "enforce_investor_payout_rules"();

CREATE CONSTRAINT TRIGGER "repayments_check_allocations_and_installments"
    AFTER INSERT ON "repayments"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "check_repayment_domain_after_insert"();

CREATE CONSTRAINT TRIGGER "payout_allocations_check_repayment_totals"
    AFTER INSERT OR UPDATE OR DELETE ON "payout_allocations"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "check_allocation_domain_after_change"();

CREATE CONSTRAINT TRIGGER "installments_check_paid_totals"
    AFTER UPDATE ON "installments"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "check_installment_paid_totals_after_change"();

COMMIT;
