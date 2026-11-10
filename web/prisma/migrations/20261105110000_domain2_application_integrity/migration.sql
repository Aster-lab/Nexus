-- Domain 2 integrity constraints for borrower applications, versions, reviews, and offers.
BEGIN;

-- Refuse to install constraints while existing rows violate the approved rules.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "application_versions"
        WHERE "version_number" <= 0
           OR "requested_principal_satang" <= 0
           OR "requested_term_months" <= 0
    ) THEN
        RAISE EXCEPTION 'Domain 2 migration stopped: application versions contain non-positive version, principal, or term values.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "loan_offers"
        WHERE "principal_satang" <= 0 OR "term_months" <= 0
    ) THEN
        RAISE EXCEPTION 'Domain 2 migration stopped: loan offers contain non-positive principal or term values.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "loan_offers"
        WHERE "annual_interest_rate" <> ROUND("annual_interest_rate", 6)
           OR "annual_interest_rate" < -99.999999
           OR "annual_interest_rate" > 99.999999
    ) THEN
        RAISE EXCEPTION 'Domain 2 migration stopped: a loan offer rate cannot be represented exactly as DECIMAL(8,6).';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "loan_applications" la
        JOIN "application_versions" av ON av."id" = la."current_version_id"
        WHERE la."current_version_id" IS NOT NULL
          AND la."id" <> av."application_id"
    ) THEN
        RAISE EXCEPTION 'Domain 2 migration stopped: an application points to a current version owned by another application.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "application_reviews" r
        JOIN "application_versions" av ON av."id" = r."application_version_id"
        WHERE r."application_id" <> av."application_id"
    ) THEN
        RAISE EXCEPTION 'Domain 2 migration stopped: a review references a version from another application.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "loan_offers" o
        JOIN "application_versions" av ON av."id" = o."application_version_id"
        WHERE o."application_id" <> av."application_id"
    ) THEN
        RAISE EXCEPTION 'Domain 2 migration stopped: an offer references a version from another application.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "loan_applications"
        WHERE "status" IN ('SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_REQUESTED', 'APPROVED')
        GROUP BY "borrower_profile_id"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Domain 2 migration stopped: a borrower has multiple active submitted applications.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "loan_offers"
        WHERE "status" = 'ACCEPTED'
        GROUP BY "application_id"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Domain 2 migration stopped: an application has multiple accepted offers.';
    END IF;
END $$;

-- A composite target lets foreign keys verify that a version belongs to its application.
CREATE UNIQUE INDEX "application_versions_application_id_id_key"
    ON "application_versions" ("application_id", "id");

CREATE UNIQUE INDEX "loan_applications_id_current_version_id_key"
    ON "loan_applications" ("id", "current_version_id");

ALTER TABLE "loan_applications"
    DROP CONSTRAINT "loan_applications_current_version_id_fkey";
ALTER TABLE "loan_applications"
    ADD CONSTRAINT "loan_applications_current_version_same_app_fkey"
    FOREIGN KEY ("id", "current_version_id")
    REFERENCES "application_versions" ("application_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "application_reviews"
    DROP CONSTRAINT "application_reviews_application_version_id_fkey";
ALTER TABLE "application_reviews"
    ADD CONSTRAINT "application_reviews_application_version_same_app_fkey"
    FOREIGN KEY ("application_id", "application_version_id")
    REFERENCES "application_versions" ("application_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "loan_offers"
    DROP CONSTRAINT "loan_offers_application_version_id_fkey";
ALTER TABLE "loan_offers"
    ADD CONSTRAINT "loan_offers_application_version_same_app_fkey"
    FOREIGN KEY ("application_id", "application_version_id")
    REFERENCES "application_versions" ("application_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "application_versions"
    ADD CONSTRAINT "application_versions_version_number_positive"
    CHECK ("version_number" > 0),
    ADD CONSTRAINT "application_versions_requested_principal_positive"
    CHECK ("requested_principal_satang" > 0),
    ADD CONSTRAINT "application_versions_requested_term_positive"
    CHECK ("requested_term_months" > 0);

ALTER TABLE "loan_offers"
    ALTER COLUMN "annual_interest_rate" TYPE DECIMAL(8, 6)
    USING "annual_interest_rate"::DECIMAL(8, 6),
    ADD CONSTRAINT "loan_offers_principal_positive"
    CHECK ("principal_satang" > 0),
    ADD CONSTRAINT "loan_offers_term_positive"
    CHECK ("term_months" > 0);

CREATE UNIQUE INDEX "loan_applications_one_active_per_borrower_key"
    ON "loan_applications" ("borrower_profile_id")
    WHERE "status" IN ('SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_REQUESTED', 'APPROVED');

CREATE UNIQUE INDEX "loan_offers_one_accepted_per_application_key"
    ON "loan_offers" ("application_id")
    WHERE "status" = 'ACCEPTED';

-- Submitted versions become immutable; later changes must create a new version.
CREATE FUNCTION "prevent_submitted_application_version_mutation"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD."submitted_at" IS NOT NULL THEN
            RAISE EXCEPTION 'Submitted application versions are immutable; create a new version instead.';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD."submitted_at" IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Submitted application versions are immutable; create a new version instead.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "application_versions_immutable_after_submission"
    BEFORE UPDATE OR DELETE ON "application_versions"
    FOR EACH ROW
    EXECUTE FUNCTION "prevent_submitted_application_version_mutation"();

COMMIT;
