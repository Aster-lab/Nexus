DROP INDEX IF EXISTS "wallets_owner_user_id_key";

CREATE UNIQUE INDEX "wallets_owner_user_id_key"
ON "wallets" ("owner_user_id");

DROP INDEX IF EXISTS "wallets_owner_platform_account_id_key";

CREATE UNIQUE INDEX "wallets_owner_platform_account_id_key"
ON "wallets" ("owner_platform_account_id");