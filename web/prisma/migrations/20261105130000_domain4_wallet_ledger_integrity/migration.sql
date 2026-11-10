-- Domain 4 wallet and ledger integrity safeguards.
BEGIN;

-- Stop rather than silently changing existing financial records that violate the rules.
DO $$
DECLARE
    v_wallet_id UUID;
    v_balance BIGINT;
    v_expected NUMERIC;
BEGIN
    IF EXISTS (
        SELECT 1 FROM "wallets"
        WHERE ("owner_user_id" IS NULL) = ("owner_platform_account_id" IS NULL)
    ) THEN
        RAISE EXCEPTION 'Domain 4 migration stopped: each wallet must have exactly one owner.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "ledger_entries"
        WHERE ("wallet_id" IS NULL) = ("platform_account_id" IS NULL)
           OR "amount_satang" <= 0
    ) THEN
        RAISE EXCEPTION 'Domain 4 migration stopped: ledger entries must have exactly one account and a positive amount.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "ledger_transactions" WHERE "description" IS NULL
    ) THEN
        RAISE EXCEPTION 'Domain 4 migration stopped: ledger transactions with NULL descriptions need a value before description becomes required.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "ledger_transactions" WHERE "status" = 'REVERSED'
    ) THEN
        RAISE EXCEPTION 'Domain 4 migration stopped: existing REVERSED transactions need review under the confirmed compensating-transaction rule.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "ledger_transactions" t
        LEFT JOIN "ledger_entries" e ON e."ledger_transaction_id" = t."id"
        WHERE t."status" = 'POSTED'
        GROUP BY t."id"
        HAVING COUNT(e."id") < 2
    ) OR EXISTS (
        SELECT 1
        FROM "ledger_entries" e
        JOIN "ledger_transactions" t ON t."id" = e."ledger_transaction_id"
        WHERE t."status" = 'POSTED'
        GROUP BY e."ledger_transaction_id", e."currency"
        HAVING SUM(CASE WHEN e."entry_type" = 'DEBIT' THEN e."amount_satang" ELSE 0 END)
            <> SUM(CASE WHEN e."entry_type" = 'CREDIT' THEN e."amount_satang" ELSE 0 END)
    ) THEN
        RAISE EXCEPTION 'Domain 4 migration stopped: an existing POSTED transaction has fewer than two entries or is not balanced per currency.';
    END IF;

    -- User wallets are liability balances (credits increase them). Platform-owned wallets
    -- follow the natural balance of their linked account type.
    FOR v_wallet_id, v_balance IN SELECT "id", "balance_satang" FROM "wallets" LOOP
        SELECT COALESCE(SUM(
            CASE
                WHEN t."id" IS NULL THEN 0
                WHEN w."owner_user_id" IS NOT NULL THEN
                    CASE WHEN e."entry_type" = 'CREDIT' THEN e."amount_satang" ELSE -e."amount_satang" END
                WHEN pa."account_type" IN ('ASSET', 'EXPENSE') THEN
                    CASE WHEN e."entry_type" = 'DEBIT' THEN e."amount_satang" ELSE -e."amount_satang" END
                ELSE
                    CASE WHEN e."entry_type" = 'CREDIT' THEN e."amount_satang" ELSE -e."amount_satang" END
            END
        ), 0)
        INTO v_expected
        FROM "wallets" w
        LEFT JOIN "platform_accounts" pa ON pa."id" = w."owner_platform_account_id"
        LEFT JOIN "ledger_entries" e ON e."wallet_id" = w."id"
        LEFT JOIN "ledger_transactions" t ON t."id" = e."ledger_transaction_id" AND t."status" = 'POSTED'
        WHERE w."id" = v_wallet_id;

        IF v_balance::NUMERIC <> v_expected THEN
            RAISE EXCEPTION 'Domain 4 migration stopped: cached wallet balance for wallet % does not reconcile to posted ledger entries.', v_wallet_id;
        END IF;
    END LOOP;
END $$;

-- Align field lengths and requiredness with ERD v1.1.
ALTER TABLE "platform_accounts"
    ALTER COLUMN "account_code" TYPE VARCHAR(60);

ALTER TABLE "ledger_transactions"
    ALTER COLUMN "transaction_type" TYPE VARCHAR(60),
    ALTER COLUMN "reference_type" TYPE VARCHAR(80),
    ALTER COLUMN "description" SET NOT NULL;

-- Enforce wallet ownership XOR and ledger-entry account XOR/positive amounts.
ALTER TABLE "wallets"
    ADD CONSTRAINT "wallets_exactly_one_owner"
    CHECK (("owner_user_id" IS NOT NULL) <> ("owner_platform_account_id" IS NOT NULL));

ALTER TABLE "ledger_entries"
    ADD CONSTRAINT "ledger_entries_exactly_one_account"
    CHECK (("wallet_id" IS NOT NULL) <> ("platform_account_id" IS NOT NULL)),
    ADD CONSTRAINT "ledger_entries_amount_positive"
    CHECK ("amount_satang" > 0);

ALTER TABLE "ledger_transactions"
    ADD CONSTRAINT "ledger_transactions_not_self_reversed"
    CHECK ("reversed_transaction_id" IS NULL OR "reversed_transaction_id" <> "id");

-- A wallet cache is denominated in satang and reconciles as a liability for users.
CREATE FUNCTION "assert_wallet_ledger_balance"(p_wallet_id UUID)
RETURNS VOID AS $$
DECLARE
    v_balance BIGINT;
    v_owner_user_id UUID;
    v_account_type "platform_account_type";
    v_expected NUMERIC;
BEGIN
    SELECT w."balance_satang", w."owner_user_id", pa."account_type"
      INTO v_balance, v_owner_user_id, v_account_type
    FROM "wallets" w
    LEFT JOIN "platform_accounts" pa ON pa."id" = w."owner_platform_account_id"
    WHERE w."id" = p_wallet_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(
        CASE
            WHEN v_owner_user_id IS NOT NULL THEN
                CASE WHEN e."entry_type" = 'CREDIT' THEN e."amount_satang" ELSE -e."amount_satang" END
            WHEN v_account_type IN ('ASSET', 'EXPENSE') THEN
                CASE WHEN e."entry_type" = 'DEBIT' THEN e."amount_satang" ELSE -e."amount_satang" END
            ELSE
                CASE WHEN e."entry_type" = 'CREDIT' THEN e."amount_satang" ELSE -e."amount_satang" END
        END
    ), 0)
      INTO v_expected
    FROM "ledger_entries" e
    JOIN "ledger_transactions" t ON t."id" = e."ledger_transaction_id"
    WHERE e."wallet_id" = p_wallet_id AND t."status" = 'POSTED';

    IF v_balance::NUMERIC <> v_expected THEN
        RAISE EXCEPTION 'Wallet % cached balance does not reconcile to posted ledger entries.', p_wallet_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "assert_posted_ledger_transaction_balanced"(p_transaction_id UUID)
RETURNS VOID AS $$
DECLARE
    v_status "ledger_transaction_status";
BEGIN
    SELECT "status" INTO v_status
    FROM "ledger_transactions"
    WHERE "id" = p_transaction_id;

    IF NOT FOUND OR v_status <> 'POSTED' THEN
        RETURN;
    END IF;

    IF (SELECT COUNT(*) FROM "ledger_entries" WHERE "ledger_transaction_id" = p_transaction_id) < 2 THEN
        RAISE EXCEPTION 'Posted ledger transaction % must contain at least two entries.', p_transaction_id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "ledger_entries"
        WHERE "ledger_transaction_id" = p_transaction_id
        GROUP BY "currency"
        HAVING SUM(CASE WHEN "entry_type" = 'DEBIT' THEN "amount_satang" ELSE 0 END)
            <> SUM(CASE WHEN "entry_type" = 'CREDIT' THEN "amount_satang" ELSE 0 END)
    ) THEN
        RAISE EXCEPTION 'Posted ledger transaction % is not balanced per currency.', p_transaction_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "protect_posted_ledger_transaction"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."status" IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION 'Create ledger transactions as DRAFT, add entries, then post them.';
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD."status" IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION 'Posted ledger transactions are immutable; create a compensating transaction.';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD."status" IN ('POSTED', 'REVERSED') THEN
        RAISE EXCEPTION 'Posted ledger transactions are immutable; create a compensating transaction.';
    END IF;
    IF NEW."status" = 'REVERSED' THEN
        RAISE EXCEPTION 'Do not mark the original transaction REVERSED; create a separate compensating transaction.';
    END IF;
    IF NEW."status" = 'POSTED' THEN
        IF OLD."status" <> 'DRAFT' THEN
            RAISE EXCEPTION 'Only DRAFT ledger transactions can be posted.';
        END IF;
        NEW."posted_at" := COALESCE(NEW."posted_at", CURRENT_TIMESTAMP);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "protect_posted_ledger_entry"()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_status "ledger_transaction_status";
BEGIN
    IF TG_OP <> 'INSERT' THEN
        v_transaction_id := OLD."ledger_transaction_id";
        SELECT "status" INTO v_status FROM "ledger_transactions" WHERE "id" = v_transaction_id FOR UPDATE;
        IF v_status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION 'Entries of posted ledger transactions are immutable.';
        END IF;
    END IF;

    IF TG_OP <> 'DELETE' THEN
        v_transaction_id := NEW."ledger_transaction_id";
        SELECT "status" INTO v_status FROM "ledger_transactions" WHERE "id" = v_transaction_id FOR UPDATE;
        IF v_status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION 'Entries cannot be added to a posted ledger transaction.';
        END IF;
        RETURN NEW;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "check_ledger_entry_transaction_and_wallet"()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_wallet_id UUID;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        v_transaction_id := OLD."ledger_transaction_id";
        PERFORM "assert_posted_ledger_transaction_balanced"(v_transaction_id);
        v_wallet_id := OLD."wallet_id";
        IF v_wallet_id IS NOT NULL THEN
            PERFORM "assert_wallet_ledger_balance"(v_wallet_id);
        END IF;
    END IF;

    IF TG_OP <> 'DELETE' THEN
        v_transaction_id := NEW."ledger_transaction_id";
        PERFORM "assert_posted_ledger_transaction_balanced"(v_transaction_id);
        v_wallet_id := NEW."wallet_id";
        IF v_wallet_id IS NOT NULL THEN
            PERFORM "assert_wallet_ledger_balance"(v_wallet_id);
        END IF;
        RETURN NEW;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "check_posted_transaction_wallets"()
RETURNS TRIGGER AS $$
DECLARE
    v_wallet_id UUID;
BEGIN
    IF NEW."status" = 'POSTED' THEN
        PERFORM "assert_posted_ledger_transaction_balanced"(NEW."id");
        FOR v_wallet_id IN
            SELECT DISTINCT "wallet_id" FROM "ledger_entries"
            WHERE "ledger_transaction_id" = NEW."id" AND "wallet_id" IS NOT NULL
        LOOP
            PERFORM "assert_wallet_ledger_balance"(v_wallet_id);
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "check_wallet_cached_balance"()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM "assert_wallet_ledger_balance"(NEW."id");
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_transactions_protect_posted"
    BEFORE INSERT OR UPDATE OR DELETE ON "ledger_transactions"
    FOR EACH ROW EXECUTE FUNCTION "protect_posted_ledger_transaction"();

CREATE TRIGGER "ledger_entries_protect_posted"
    BEFORE INSERT OR UPDATE OR DELETE ON "ledger_entries"
    FOR EACH ROW EXECUTE FUNCTION "protect_posted_ledger_entry"();

CREATE CONSTRAINT TRIGGER "ledger_entries_check_balance_and_wallet"
    AFTER INSERT OR UPDATE OR DELETE ON "ledger_entries"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "check_ledger_entry_transaction_and_wallet"();

CREATE CONSTRAINT TRIGGER "ledger_transactions_check_posted_balance"
    AFTER INSERT OR UPDATE ON "ledger_transactions"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "check_posted_transaction_wallets"();

CREATE CONSTRAINT TRIGGER "wallets_check_cached_balance"
    AFTER INSERT OR UPDATE ON "wallets"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "check_wallet_cached_balance"();

COMMIT;
