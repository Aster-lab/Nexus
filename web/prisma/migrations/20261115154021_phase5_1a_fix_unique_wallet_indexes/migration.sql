-- DropIndex
DROP INDEX "wallets_owner_platform_account_id_key";

-- DropIndex
DROP INDEX "wallets_owner_user_id_key";

-- CreateIndex
CREATE INDEX "wallets_owner_user_id_key" ON "wallets"("owner_user_id");

-- CreateIndex
CREATE INDEX "wallets_owner_platform_account_id_key" ON "wallets"("owner_platform_account_id");
