-- Domain 5 investment and escrow integrity safeguards.
BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "investment_contributions" WHERE "amount_satang" <= 0
    ) THEN
        RAISE EXCEPTION 'Domain 5 migration stopped: investment contributions contain non-positive amounts.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "investment_contributions" c
        JOIN "investments" i ON i."id" = c."investment_id"
        JOIN "loans" l ON l."id" = i."loan_id"
        GROUP BY i."loan_id", l."principal_satang"
        HAVING SUM(c."amount_satang") > l."principal_satang"
    ) THEN
        RAISE EXCEPTION 'Domain 5 migration stopped: recorded investment contributions exceed a loan principal.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "investment_contributions" c
        JOIN "ledger_transactions" t ON t."id" = c."ledger_transaction_id"
        WHERE t."status" <> 'POSTED'
    ) THEN
        RAISE EXCEPTION 'Domain 5 migration stopped: an investment contribution is linked to a non-POSTED ledger transaction.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "escrow_accounts" e
        JOIN "loans" l ON l."id" = e."loan_id"
        WHERE e."held_satang" < 0 OR e."held_satang" > l."principal_satang"
    ) THEN
        RAISE EXCEPTION 'Domain 5 migration stopped: an escrow held balance is outside zero and the approved loan principal.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "escrow_accounts" e
        JOIN "wallets" w ON w."id" = e."platform_wallet_id"
        WHERE w."owner_user_id" IS NOT NULL OR w."owner_platform_account_id" IS NULL
    ) THEN
        RAISE EXCEPTION 'Domain 5 migration stopped: an escrow account references a non-platform wallet.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "escrow_transactions" WHERE "amount_satang" <= 0
    ) THEN
        RAISE EXCEPTION 'Domain 5 migration stopped: escrow transactions contain non-positive amounts.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "escrow_transactions" e
        JOIN "ledger_transactions" t ON t."id" = e."ledger_transaction_id"
        WHERE t."status" <> 'POSTED'
    ) THEN
        RAISE EXCEPTION 'Domain 5 migration stopped: an escrow movement is linked to a non-POSTED ledger transaction.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "escrow_accounts" a
        JOIN "loans" l ON l."id" = a."loan_id"
        LEFT JOIN "escrow_transactions" e ON e."escrow_account_id" = a."id"
        LEFT JOIN "ledger_transactions" t ON t."id" = e."ledger_transaction_id" AND t."status" = 'POSTED'
        GROUP BY a."id", a."held_satang"
        HAVING a."held_satang"::NUMERIC <> COALESCE(SUM(
            CASE
                WHEN t."id" IS NULL THEN 0
                WHEN e."type" = 'DEPOSIT' THEN e."amount_satang"
                ELSE -e."amount_satang"
            END
        ), 0)
    ) THEN
        RAISE EXCEPTION 'Domain 5 migration stopped: escrow held balances do not reconcile to posted escrow movements.';
    END IF;
END $$;

-- Match the ERD field name while retaining the Prisma property name `type`.
ALTER TABLE "escrow_transactions" RENAME COLUMN "type" TO "transaction_type";

ALTER TABLE "investment_contributions"
    ADD CONSTRAINT "investment_contributions_amount_positive"
    CHECK ("amount_satang" > 0);

ALTER TABLE "escrow_accounts"
    ADD CONSTRAINT "escrow_accounts_held_nonnegative"
    CHECK ("held_satang" >= 0);

ALTER TABLE "escrow_transactions"
    ADD CONSTRAINT "escrow_transactions_amount_positive"
    CHECK ("amount_satang" > 0);

-- Contributions serialize on the loan row to prevent concurrent overfunding.
CREATE FUNCTION "enforce_investment_contribution_rules"()
RETURNS TRIGGER AS $$
DECLARE
    v_loan_id UUID;
    v_principal BIGINT;
    v_loan_status "loan_status";
    v_ledger_status "ledger_transaction_status";
    v_existing_total NUMERIC;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'Investment contributions are immutable; record corrections as compensating financial transactions.';
    END IF;

    SELECT l."id", l."principal_satang", l."status"
      INTO v_loan_id, v_principal, v_loan_status
    FROM "investments" i
    JOIN "loans" l ON l."id" = i."loan_id"
    WHERE i."id" = NEW."investment_id"
    FOR UPDATE OF l;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Investment contribution references an unavailable investment or loan.';
    END IF;
    IF NEW."amount_satang" <= 0 THEN
        RAISE EXCEPTION 'Investment contribution amount must be positive.';
    END IF;
    IF v_loan_status <> 'FUNDING' THEN
        RAISE EXCEPTION 'Investments can only be contributed to a loan in FUNDING status.';
    END IF;

    SELECT "status" INTO v_ledger_status
    FROM "ledger_transactions"
    WHERE "id" = NEW."ledger_transaction_id"
    FOR UPDATE;
    IF NOT FOUND OR v_ledger_status <> 'POSTED' THEN
        RAISE EXCEPTION 'Investment contributions must reference a POSTED ledger transaction.';
    END IF;

    SELECT COALESCE(SUM(c."amount_satang"), 0)
      INTO v_existing_total
    FROM "investment_contributions" c
    JOIN "investments" i ON i."id" = c."investment_id"
    WHERE i."loan_id" = v_loan_id;

    IF v_existing_total + NEW."amount_satang" > v_principal THEN
        RAISE EXCEPTION 'Investment contribution would exceed the approved loan principal.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "investment_contributions_enforce_funding_rules"
    BEFORE INSERT OR UPDATE OR DELETE ON "investment_contributions"
    FOR EACH ROW EXECUTE FUNCTION "enforce_investment_contribution_rules"();

-- Escrow movements must be posted, positive, immutable, and reconcile to the cached balance.
CREATE FUNCTION "enforce_escrow_transaction_rules"()
RETURNS TRIGGER AS $$
DECLARE
    v_ledger_status "ledger_transaction_status";
    v_wallet_owner UUID;
    v_platform_owner UUID;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'Escrow transaction history is immutable; record corrections as new escrow and ledger transactions.';
    END IF;
    IF NEW."amount_satang" <= 0 THEN
        RAISE EXCEPTION 'Escrow transaction amount must be positive.';
    END IF;

    PERFORM 1 FROM "escrow_accounts" WHERE "id" = NEW."escrow_account_id" FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Escrow transaction references an unavailable escrow account.';
    END IF;

    SELECT "status" INTO v_ledger_status
    FROM "ledger_transactions"
    WHERE "id" = NEW."ledger_transaction_id"
    FOR UPDATE;
    IF NOT FOUND OR v_ledger_status <> 'POSTED' THEN
        RAISE EXCEPTION 'Escrow transactions must reference a POSTED ledger transaction.';
    END IF;

    SELECT "owner_user_id", "owner_platform_account_id"
      INTO v_wallet_owner, v_platform_owner
    FROM "escrow_accounts" e
    JOIN "wallets" w ON w."id" = e."platform_wallet_id"
    WHERE e."id" = NEW."escrow_account_id";
    IF v_wallet_owner IS NOT NULL OR v_platform_owner IS NULL THEN
        RAISE EXCEPTION 'Escrow accounts must use a platform-owned wallet.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "assert_escrow_account_balance"(p_escrow_account_id UUID)
RETURNS VOID AS $$
DECLARE
    v_held BIGINT;
    v_principal BIGINT;
    v_expected NUMERIC;
BEGIN
    SELECT a."held_satang", l."principal_satang"
      INTO v_held, v_principal
    FROM "escrow_accounts" a
    JOIN "loans" l ON l."id" = a."loan_id"
    WHERE a."id" = p_escrow_account_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(
        CASE WHEN e."transaction_type" = 'DEPOSIT' THEN e."amount_satang"
             ELSE -e."amount_satang" END
    ), 0)
      INTO v_expected
    FROM "escrow_transactions" e
    JOIN "ledger_transactions" t ON t."id" = e."ledger_transaction_id"
    WHERE e."escrow_account_id" = p_escrow_account_id AND t."status" = 'POSTED';

    IF v_held::NUMERIC <> v_expected THEN
        RAISE EXCEPTION 'Escrow account % held balance does not reconcile to its posted movements.', p_escrow_account_id;
    END IF;
    IF v_held < 0 OR v_held > v_principal THEN
        RAISE EXCEPTION 'Escrow account % held balance must be between zero and loan principal.', p_escrow_account_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "check_escrow_account_balance_after_change"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP <> 'DELETE' THEN
        PERFORM "assert_escrow_account_balance"(NEW."id");
        RETURN NEW;
    END IF;
    PERFORM "assert_escrow_account_balance"(OLD."id");
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "check_escrow_transaction_balance_after_insert"()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM "assert_escrow_account_balance"(NEW."escrow_account_id");
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "check_escrow_balance_after_ledger_post"()
RETURNS TRIGGER AS $$
DECLARE
    v_escrow_account_id UUID;
BEGIN
    IF NEW."status" = 'POSTED' THEN
        FOR v_escrow_account_id IN
            SELECT DISTINCT "escrow_account_id" FROM "escrow_transactions"
            WHERE "ledger_transaction_id" = NEW."id"
        LOOP
            PERFORM "assert_escrow_account_balance"(v_escrow_account_id);
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "escrow_transactions_enforce_rules"
    BEFORE INSERT OR UPDATE OR DELETE ON "escrow_transactions"
    FOR EACH ROW EXECUTE FUNCTION "enforce_escrow_transaction_rules"();

CREATE CONSTRAINT TRIGGER "escrow_accounts_check_balance"
    AFTER INSERT OR UPDATE ON "escrow_accounts"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "check_escrow_account_balance_after_change"();

CREATE CONSTRAINT TRIGGER "escrow_transactions_check_balance"
    AFTER INSERT ON "escrow_transactions"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "check_escrow_transaction_balance_after_insert"();

CREATE CONSTRAINT TRIGGER "ledger_transactions_check_escrow_balance"
    AFTER UPDATE ON "ledger_transactions"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "check_escrow_balance_after_ledger_post"();

COMMIT;
