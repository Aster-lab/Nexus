-- RenameForeignKey
ALTER TABLE "application_documents" RENAME CONSTRAINT "application_documents_application_version_owner_fkey" TO "application_documents_application_id_application_version_i_fkey";

-- RenameIndex
ALTER INDEX "wallets_owner_platform_account_id_idx" RENAME TO "wallets_owner_platform_account_id_key";

-- RenameIndex
ALTER INDEX "wallets_owner_user_id_idx" RENAME TO "wallets_owner_user_id_key";
