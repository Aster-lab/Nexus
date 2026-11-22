BEGIN;

-- These are chart definitions, not generated funds. Insert only if an account
-- with the code is absent; conflicting existing definitions fail below.
INSERT INTO "platform_accounts" ("id", "account_code", "account_name", "account_type", "currency", "status")
VALUES
  (gen_random_uuid(), '1200', 'Simulated Loan Principal Receivable', 'ASSET'::"platform_account_type", 'THB', 'ACTIVE'::"platform_account_status"),
  (gen_random_uuid(), '2100', 'Shared User-Wallet Control', 'LIABILITY'::"platform_account_type", 'THB', 'ACTIVE'::"platform_account_status"),
  (gen_random_uuid(), '1300', 'Simulated Opening Balance Asset', 'ASSET'::"platform_account_type", 'THB', 'ACTIVE'::"platform_account_status")
ON CONFLICT ("account_code") DO NOTHING;

-- Activate only the exact chart definitions used by the new accounting paths.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "platform_accounts"
    WHERE "account_code" = '1200'
      AND "account_name" = 'Simulated Loan Principal Receivable'
      AND "account_type" = 'ASSET'::"platform_account_type"
      AND "currency" = 'THB'
  ) THEN
    RAISE EXCEPTION 'Account 1200 is missing or differs from the approved loan receivable definition.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "platform_accounts"
    WHERE "account_code" = '2100'
      AND "account_name" = 'Shared User-Wallet Control'
      AND "account_type" = 'LIABILITY'::"platform_account_type"
      AND "currency" = 'THB'
  ) THEN
    RAISE EXCEPTION 'Account 2100 is missing or differs from the approved user-wallet control definition.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "platform_accounts"
    WHERE "account_code" = '1300'
      AND "account_name" = 'Simulated Opening Balance Asset'
      AND "account_type" = 'ASSET'::"platform_account_type"
      AND "currency" = 'THB'
      AND "status" = 'ACTIVE'::"platform_account_status"
  ) THEN
    RAISE EXCEPTION 'Account 1300 must be the active THB simulated funding asset before enabling accounts 1200 and 2100.';
  END IF;
END $$;

UPDATE "platform_accounts"
SET "status" = 'ACTIVE'::"platform_account_status"
WHERE "account_code" IN ('1200', '2100', '1300')
  AND "status" = 'INACTIVE'::"platform_account_status";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ledger_entries" e
    JOIN "ledger_transactions" t ON t."id" = e."ledger_transaction_id" AND t."status" = 'POSTED'::"ledger_transaction_status"
    JOIN "platform_accounts" a ON a."id" = e."platform_account_id"
    WHERE a."account_code" IN ('1200', '2100')
  ) THEN
    RAISE EXCEPTION 'Accounts 1200 or 2100 already have posted entries; review them before applying the control-account migration.';
  END IF;
END $$;

ALTER TABLE "ledger_entries"
  DROP CONSTRAINT "ledger_entries_exactly_one_account";
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_at_least_one_account"
  CHECK ("wallet_id" IS NOT NULL OR "platform_account_id" IS NOT NULL);

-- User wallet entries may carry 2100 as a control-account dimension as well as
-- the wallet subledger reference. No extra amount is posted by this dimension.
CREATE FUNCTION "validate_wallet_control_entry"()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_user_id UUID;
  v_account_code VARCHAR(60);
  v_account_type "platform_account_type";
  v_account_status "platform_account_status";
  v_account_currency CHAR(3);
BEGIN
  IF NEW."wallet_id" IS NOT NULL THEN
    SELECT "owner_user_id" INTO v_owner_user_id
    FROM "wallets" WHERE "id" = NEW."wallet_id";
    IF v_owner_user_id IS NULL THEN
      IF NEW."platform_account_id" IS NOT NULL THEN
        RAISE EXCEPTION 'Platform-owned wallet entries cannot also reference a platform account.';
      END IF;
    ELSE
      SELECT "account_code", "account_type", "status", "currency"
        INTO v_account_code, v_account_type, v_account_status, v_account_currency
      FROM "platform_accounts" WHERE "id" = NEW."platform_account_id";
      IF v_account_code IS DISTINCT FROM '2100' OR v_account_type <> 'LIABILITY'::"platform_account_type"
         OR v_account_status <> 'ACTIVE'::"platform_account_status" OR v_account_currency <> 'THB' THEN
        RAISE EXCEPTION 'User-owned wallet entries must reference control account 2100.';
      END IF;
    END IF;
  ELSIF NEW."platform_account_id" IS NOT NULL THEN
    SELECT "account_code", "account_type", "status", "currency"
      INTO v_account_code, v_account_type, v_account_status, v_account_currency
    FROM "platform_accounts" WHERE "id" = NEW."platform_account_id";
    IF v_account_code = '2100' THEN
      RAISE EXCEPTION 'Account 2100 must be linked to its user wallet subledger entry.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entries_validate_wallet_control"
  BEFORE INSERT OR UPDATE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION "validate_wallet_control_entry"();

-- Historical posted entries are immutable. Add non-financial account mapping
-- metadata so their existing wallet movements are represented under 2100
-- without changing their original rows or posting a second amount.
CREATE TABLE "ledger_entry_account_mappings" (
  "id" UUID NOT NULL,
  "ledger_entry_id" UUID NOT NULL,
  "platform_account_id" UUID NOT NULL,
  "entry_type" "ledger_entry_type" NOT NULL,
  "amount_satang" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'THB',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_entry_account_mappings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ledger_entry_account_mappings_positive" CHECK ("amount_satang" > 0),
  CONSTRAINT "ledger_entry_account_mappings_entry_account_key" UNIQUE ("ledger_entry_id", "platform_account_id"),
  CONSTRAINT "ledger_entry_account_mappings_entry_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ledger_entry_account_mappings_account_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "platform_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ledger_entry_account_mappings_account_created_idx"
  ON "ledger_entry_account_mappings"("platform_account_id", "created_at");

INSERT INTO "ledger_entry_account_mappings" (
  "id", "ledger_entry_id", "platform_account_id", "entry_type", "amount_satang", "currency"
)
SELECT gen_random_uuid(), e."id", pa."id", e."entry_type", e."amount_satang", e."currency"
FROM "ledger_entries" e
JOIN "wallets" w ON w."id" = e."wallet_id" AND w."owner_user_id" IS NOT NULL
JOIN "ledger_transactions" t ON t."id" = e."ledger_transaction_id" AND t."status" = 'POSTED'::"ledger_transaction_status"
JOIN "platform_accounts" pa ON pa."account_code" = '2100'
WHERE e."platform_account_id" IS NULL;

CREATE FUNCTION "validate_ledger_entry_account_mapping"()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_user_id UUID;
  v_account_code VARCHAR(60);
  v_transaction_status "ledger_transaction_status";
  v_entry_type "ledger_entry_type";
  v_amount BIGINT;
  v_currency CHAR(3);
  v_entry_platform_account_id UUID;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT t."status" INTO v_transaction_status
    FROM "ledger_entries" e JOIN "ledger_transactions" t ON t."id" = e."ledger_transaction_id"
    WHERE e."id" = OLD."ledger_entry_id";
    IF v_transaction_status = 'POSTED'::"ledger_transaction_status" THEN
      RAISE EXCEPTION 'Account mappings for posted ledger entries are immutable.';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT w."owner_user_id", t."status", e."entry_type", e."amount_satang", e."currency", e."platform_account_id", pa."account_code"
      INTO v_owner_user_id, v_transaction_status, v_entry_type, v_amount, v_currency, v_entry_platform_account_id, v_account_code
    FROM "ledger_entries" e
    JOIN "wallets" w ON w."id" = e."wallet_id"
    JOIN "ledger_transactions" t ON t."id" = e."ledger_transaction_id"
    JOIN "platform_accounts" pa ON pa."id" = NEW."platform_account_id"
    WHERE e."id" = NEW."ledger_entry_id";
    IF v_owner_user_id IS NULL OR v_transaction_status <> 'POSTED'::"ledger_transaction_status"
       OR v_entry_platform_account_id IS NOT NULL
       OR v_account_code <> '2100' OR NEW."entry_type" <> v_entry_type
       OR NEW."amount_satang" <> v_amount OR NEW."currency" <> v_currency THEN
      RAISE EXCEPTION 'Legacy wallet control mapping must exactly mirror a posted user-wallet ledger entry into account 2100.';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ledger_entry_account_mappings_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "ledger_entry_account_mappings"
  FOR EACH ROW EXECUTE FUNCTION "validate_ledger_entry_account_mapping"();

-- Establish an opening principal receivable for already-disbursed loans. The
-- amount is derived from posted repayment principal, including explicit
-- repayment reversals, so existing repayment records remain untouched.
DO $$
DECLARE
  v_receivable_account_id UUID;
  v_funding_account_id UUID;
  v_amount NUMERIC;
  v_funding_balance NUMERIC;
  v_transaction_id UUID;
BEGIN
  SELECT "id" INTO v_receivable_account_id FROM "platform_accounts" WHERE "account_code" = '1200';
  SELECT "id" INTO v_funding_account_id FROM "platform_accounts" WHERE "account_code" = '1300';
  SELECT COALESCE(SUM(GREATEST(
    l."principal_satang"::NUMERIC - COALESCE((
      SELECT SUM(CASE WHEN r."reversal_of_repayment_id" IS NULL THEN r."principal_satang" ELSE -r."principal_satang" END)
      FROM "repayments" r
      JOIN "ledger_transactions" rt ON rt."id" = r."ledger_transaction_id" AND rt."status" = 'POSTED'::"ledger_transaction_status"
      WHERE r."loan_id" = l."id" AND r."status" = 'POSTED'::"repayment_status"
    ), 0), 0
  )), 0)::NUMERIC INTO v_amount
  FROM "loans" l
  WHERE l."disbursed_at" IS NOT NULL AND l."status" <> 'CANCELLED'::"loan_status";
  IF v_amount < 0 OR v_amount > 9223372036854775807 THEN
    RAISE EXCEPTION 'Aggregate outstanding principal is outside the supported range.';
  END IF;
  SELECT COALESCE(SUM(CASE WHEN e."entry_type" = 'DEBIT' THEN e."amount_satang" ELSE -e."amount_satang" END), 0)::NUMERIC
    INTO v_funding_balance
    FROM "ledger_entries" e
    JOIN "ledger_transactions" t ON t."id" = e."ledger_transaction_id" AND t."status" = 'POSTED'::"ledger_transaction_status"
    WHERE e."platform_account_id" = v_funding_account_id;
  IF v_funding_balance < v_amount THEN
    RAISE EXCEPTION 'Account 1300 balance is insufficient to establish the historical principal receivable without an unsupported adjustment.';
  END IF;
  IF v_amount > 0 THEN
    v_transaction_id := gen_random_uuid();
    INSERT INTO "ledger_transactions" (
      "id", "transaction_type", "status", "reference_type", "description", "posted_at"
    ) VALUES (
      v_transaction_id, 'LOAN_RECEIVABLE_OPENING', 'DRAFT'::"ledger_transaction_status",
      'LOAN_RECEIVABLE_OPENING', 'Opening principal receivable for loans disbursed before account 1200 activation.', CURRENT_TIMESTAMP
    );
    INSERT INTO "ledger_entries" (
      "id", "ledger_transaction_id", "platform_account_id", "entry_type", "amount_satang", "currency"
    ) VALUES
      (gen_random_uuid(), v_transaction_id, v_receivable_account_id, 'DEBIT'::"ledger_entry_type", v_amount::BIGINT, 'THB'),
      (gen_random_uuid(), v_transaction_id, v_funding_account_id, 'CREDIT'::"ledger_entry_type", v_amount::BIGINT, 'THB');
    UPDATE "ledger_transactions" SET "status" = 'POSTED'::"ledger_transaction_status" WHERE "id" = v_transaction_id;
  END IF;
END $$;

CREATE FUNCTION "assert_user_wallet_control_balance"()
RETURNS VOID AS $$
DECLARE
  v_account_id UUID;
  v_wallet_total NUMERIC;
  v_control_total NUMERIC;
BEGIN
  SELECT "id" INTO v_account_id FROM "platform_accounts" WHERE "account_code" = '2100';
  IF v_account_id IS NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM("balance_satang"), 0)::NUMERIC INTO v_wallet_total
    FROM "wallets" WHERE "owner_user_id" IS NOT NULL;
  SELECT COALESCE(SUM(CASE WHEN movements."entry_type" = 'CREDIT' THEN movements."amount_satang" ELSE -movements."amount_satang" END), 0)::NUMERIC
    INTO v_control_total
    FROM (
      SELECT e."entry_type", e."amount_satang"
      FROM "ledger_entries" e
      JOIN "ledger_transactions" t ON t."id" = e."ledger_transaction_id" AND t."status" = 'POSTED'::"ledger_transaction_status"
      WHERE e."platform_account_id" = v_account_id
      UNION ALL
      SELECT m."entry_type", m."amount_satang"
      FROM "ledger_entry_account_mappings" m
      JOIN "ledger_entries" e ON e."id" = m."ledger_entry_id"
      JOIN "ledger_transactions" t ON t."id" = e."ledger_transaction_id" AND t."status" = 'POSTED'::"ledger_transaction_status"
      WHERE m."platform_account_id" = v_account_id
    ) movements;
  IF v_wallet_total <> v_control_total THEN
    RAISE EXCEPTION 'Account 2100 balance % does not reconcile to user wallet balances %.', v_control_total, v_wallet_total;
  END IF;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  PERFORM "assert_user_wallet_control_balance"();
END $$;

CREATE OR REPLACE FUNCTION "check_posted_transaction_wallets"()
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
    PERFORM "assert_user_wallet_control_balance"();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "check_wallet_cached_balance"()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM "assert_wallet_ledger_balance"(NEW."id");
  IF NEW."owner_user_id" IS NOT NULL THEN
    PERFORM "assert_user_wallet_control_balance"();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
