# NEXUS Repayment Clearing Readiness and Activation

**Date:** 2026-11-22  
**Scope:** Demo financial operations  
**Status:** Implemented in source; tests and runtime verification not run.

## What the reconciliation warning means

Platform account `2300` (Repayment Clearing) must have exactly one active, platform-owned THB wallet, and the account itself must be an active THB liability account. The screenshot reports a configuration discrepancy because reconciliation could not find exactly one wallet linked to account `2300`. The report alone does not distinguish a missing wallet from an inactive wallet or an ambiguous wallet setup.

The platform-account seed provisions this wallet for a newly created active account. It deliberately preserves the status of an existing account; when an existing account is inactive, rerunning the seed does not restore it or ensure its wallet exists.

## Financial flow

1. A borrower repayment posts inside one database transaction. The borrower's wallet is debited, Repayment Clearing wallet `2300` is credited, and repayment/installment/allocation records are persisted atomically.
2. Investor payouts debit Repayment Clearing and credit the investor wallet, with the payout and ledger transaction committed atomically.
3. Reconciliation derives the clearing wallet balance from posted ledger entries and compares collections less completed payouts. It is read-only and only reports discrepancies.

If account `2300` or its wallet is unavailable, repayment posting and payouts must fail without partial financial changes. Reconciliation cannot create or repair the wallet.

## Admin readiness and activation

- `GET /api/admin/repayment-clearing` reports the account, linked wallet count, wallet status, currency, and balance.
- `POST /api/admin/repayment-clearing` requires an active financial administrator and a reason. It locks and validates the configuration, then records an audit event.
- If account `2300` is absent, activation creates the approved THB liability account and one zero-balance wallet.
- If an eligible wallet exists but is inactive, activation reactivates it without changing its balance.
- More than one linked wallet, an incorrect account definition, or a closed wallet blocks activation for manual review.
- Activation does not create ledger entries or move money.

The **Repayment Clearing** card is shown under administrator **Financial overview** (`/admin/financial`). After activation it refreshes the read-only reconciliation report. A valid setup should remove `CLEARING_WALLET_CONFIGURATION`; other reconciliation discrepancies may remain and require separate investigation.

## Demo operator steps

1. Sign in with the administrator account.
2. Open **Financial overview**.
3. Inspect the **Repayment Clearing** card to see whether account `2300` is missing, inactive, or has an unexpected wallet count/status.
4. When the account definition is valid and no closed/duplicate-wallet condition is present, enter an audit reason and choose **Review activation**, then confirm.
5. Confirm that the card reads **Ready** and the reconciliation report no longer reports the clearing configuration discrepancy.
6. Retry the borrower repayment using its original idempotency key. If the client previously reported an uncertain outcome, inspect repayment history before retrying; the API returns the existing result for a committed request.

Do not alter wallet balances directly in the database. Initial clearing configuration is not a funding operation.

## Verification limits

The implementation was reviewed statically. No tests, lint, typecheck, build, or live database operation was run. The demo database has not been inspected or changed here.
