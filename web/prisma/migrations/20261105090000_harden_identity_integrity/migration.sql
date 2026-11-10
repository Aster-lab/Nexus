-- Domain 1 integrity fixes that Prisma schema syntax cannot fully represent.
BEGIN;

-- Stop rather than discard any values stored in the accidental user enum-array column.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "users"
        WHERE cardinality("modelActivationActions") > 0
    ) THEN
        RAISE EXCEPTION 'Cannot remove users.modelActivationActions: non-empty values exist. Review and migrate the data first.';
    END IF;
END $$;

-- Fail with a clear message if existing values collide after canonicalization.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "users"
        GROUP BY LOWER(BTRIM("email"))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot add normalized email uniqueness: duplicate emails exist after trim/lowercase normalization.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "user_roles"
        WHERE "revoked_at" IS NULL
        GROUP BY "user_id", "role_id"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot add active user-role uniqueness: duplicate active assignments exist.';
    END IF;
END $$;

ALTER TABLE "users" DROP COLUMN "modelActivationActions";

CREATE UNIQUE INDEX "users_email_normalized_key"
    ON "users" (LOWER(BTRIM("email")));

DROP INDEX "users_email_key";

CREATE UNIQUE INDEX "user_roles_active_user_role_key"
    ON "user_roles" ("user_id", "role_id")
    WHERE "revoked_at" IS NULL;

COMMIT;
