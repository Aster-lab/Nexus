-- Domain 11: private document metadata and application-version ownership.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "application_documents" WHERE "file_size_bytes" <= 0 OR "version_number" <= 0) THEN
        RAISE EXCEPTION 'Domain 11 migration stopped: document file size and version number must be positive.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "application_documents"
        WHERE "object_key" ~* '^https?://'
    ) THEN
        RAISE EXCEPTION 'Domain 11 migration stopped: public URL-like document object keys require review.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "application_documents" d
        JOIN "application_versions" v ON v."id" = d."application_version_id"
        WHERE d."application_id" <> v."application_id"
    ) THEN
        RAISE EXCEPTION 'Domain 11 migration stopped: a document application_version belongs to a different application.';
    END IF;
END $$;

ALTER TABLE "application_documents"
    ADD CONSTRAINT "application_documents_file_size_positive" CHECK ("file_size_bytes" > 0),
    ADD CONSTRAINT "application_documents_version_number_positive" CHECK ("version_number" > 0),
    ADD CONSTRAINT "application_documents_private_object_key" CHECK ("object_key" !~* '^https?://');

ALTER TABLE "application_documents"
    DROP CONSTRAINT "application_documents_application_version_id_fkey",
    ADD CONSTRAINT "application_documents_application_version_owner_fkey"
        FOREIGN KEY ("application_id", "application_version_id")
        REFERENCES "application_versions" ("application_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
