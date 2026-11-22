-- Every borrower/investor profile needs one internal wallet. These accounts start
-- at zero; this migration must not create a ledger transaction or simulated funds.
INSERT INTO "wallets" (
    "id",
    "owner_user_id",
    "owner_platform_account_id",
    "currency",
    "balance_satang",
    "status",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    profile_users."user_id",
    NULL,
    'THB',
    0,
    'ACTIVE'::"wallet_status",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT "user_id" FROM "borrower_profiles"
    UNION
    SELECT "user_id" FROM "investor_profiles"
) AS profile_users
WHERE NOT EXISTS (
    SELECT 1
    FROM "wallets" existing_wallet
    WHERE existing_wallet."owner_user_id" = profile_users."user_id"
)
ON CONFLICT ("owner_user_id") DO NOTHING;
