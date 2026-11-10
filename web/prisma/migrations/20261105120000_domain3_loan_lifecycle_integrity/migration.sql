-- Domain 3 loan lifecycle constraints and status-history correction.
BEGIN;

-- Refuse to install constraints if existing loan data violates the approved relationships.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "loans"
        WHERE "principal_satang" <= 0
           OR "funded_satang" < 0
           OR "funded_satang" > "principal_satang"
           OR "term_months" <= 0
    ) THEN
        RAISE EXCEPTION 'Domain 3 migration stopped: loans contain invalid principal, funded amount, or term values.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "loans" l
        JOIN "loan_applications" a ON a."id" = l."application_id"
        WHERE l."borrower_profile_id" <> a."borrower_profile_id"
    ) THEN
        RAISE EXCEPTION 'Domain 3 migration stopped: a loan borrower does not match its application borrower.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "loans" l
        JOIN "loan_offers" o ON o."id" = l."accepted_offer_id"
        WHERE l."application_id" <> o."application_id"
    ) THEN
        RAISE EXCEPTION 'Domain 3 migration stopped: a loan references an accepted offer from another application.';
    END IF;
END $$;

-- Correct the enum label without losing any existing status values.
ALTER TYPE "loan_status" RENAME VALUE 'DEFEAULTED' TO 'DEFAULTED';

-- Add composite unique targets for borrower/application and application/offer consistency.
CREATE UNIQUE INDEX "loan_applications_id_borrower_profile_id_key"
    ON "loan_applications" ("id", "borrower_profile_id");

CREATE UNIQUE INDEX "loan_offers_application_id_id_key"
    ON "loan_offers" ("application_id", "id");

-- Replace independent foreign keys with composite constraints that prevent mismatched records.
ALTER TABLE "loans"
    DROP CONSTRAINT "loans_application_id_fkey",
    DROP CONSTRAINT "loans_accepted_offer_id_fkey";

ALTER TABLE "loans"
    ADD CONSTRAINT "loans_application_borrower_same_owner_fkey"
    FOREIGN KEY ("application_id", "borrower_profile_id")
    REFERENCES "loan_applications" ("id", "borrower_profile_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "loans_accepted_offer_same_application_fkey"
    FOREIGN KEY ("application_id", "accepted_offer_id")
    REFERENCES "loan_offers" ("application_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "loans_application_id_accepted_offer_id_key"
    ON "loans" ("application_id", "accepted_offer_id");

ALTER TABLE "loans"
    ADD CONSTRAINT "loans_principal_positive" CHECK ("principal_satang" > 0),
    ADD CONSTRAINT "loans_funded_nonnegative" CHECK ("funded_satang" >= 0),
    ADD CONSTRAINT "loans_funding_not_over_principal" CHECK ("funded_satang" <= "principal_satang"),
    ADD CONSTRAINT "loans_term_positive" CHECK ("term_months" > 0);

-- Convert the original single status column into the ERD's transition pair.
ALTER TABLE "loan_status_history"
    ADD COLUMN "previous_status" VARCHAR(40),
    ADD COLUMN "new_status" VARCHAR(40);

UPDATE "loan_status_history"
SET "new_status" = "status"::TEXT;

ALTER TABLE "loan_status_history"
    ALTER COLUMN "new_status" SET NOT NULL,
    DROP COLUMN "status",
    ADD CONSTRAINT "loan_status_history_previous_status_valid"
      CHECK ("previous_status" IS NULL OR "previous_status" IN ('FUNDING', 'FUNDED', 'ACTIVE', 'DELINQUENT', 'DEFAULTED', 'REPAID', 'CANCELLED')),
    ADD CONSTRAINT "loan_status_history_new_status_valid"
      CHECK ("new_status" IN ('FUNDING', 'FUNDED', 'ACTIVE', 'DELINQUENT', 'DEFAULTED', 'REPAID', 'CANCELLED')),
    ADD CONSTRAINT "loan_status_history_status_must_change"
      CHECK ("previous_status" IS NULL OR "previous_status" <> "new_status");

COMMIT;
