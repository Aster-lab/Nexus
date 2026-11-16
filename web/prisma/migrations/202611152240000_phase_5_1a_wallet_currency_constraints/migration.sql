
-- Prevent negative wallet balances
ALTER TABLE "wallets"
ADD CONSTRAINT "wallets_balance_satang_nonnegative_check"
CHECK ("balance_satang" >= 0);

-- Enforce THB-only wallet currency
ALTER TABLE "wallets"
ADD CONSTRAINT "wallets_currency_thb_check"
CHECK ("currency" = 'THB');

-- Enforce THB-only platform account currency
ALTER TABLE "platform_accounts"
ADD CONSTRAINT "platform_accounts_currency_thb_check"
CHECK ("currency" = 'THB');

-- Enforce THB-only ledger entry currency
ALTER TABLE "ledger_entries"
ADD CONSTRAINT "ledger_entries_currency_thb_check"
CHECK ("currency" = 'THB');
