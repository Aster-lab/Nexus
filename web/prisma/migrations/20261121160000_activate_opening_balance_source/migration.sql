-- Account 1300 is the approved source account for administrator-posted opening
-- balances. Activate only the exact seeded THB asset definition; never change a
-- conflicting account configuration or any other operational account.
UPDATE "platform_accounts"
SET "status" = 'ACTIVE'::"platform_account_status"
WHERE "account_code" = '1300'
  AND "account_name" = 'Simulated Opening Balance Asset'
  AND "account_type" = 'ASSET'::"platform_account_type"
  AND "currency" = 'THB'
  AND "status" = 'INACTIVE'::"platform_account_status";
