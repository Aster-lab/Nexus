# NEXUS accounts 1200 and 2100

## Account 1200 — Simulated Loan Principal Receivable

Account 1200 is an active THB asset account. It tracks outstanding principal only; interest and the displayed platform fee do not post to it.

- Loan disbursement posts the existing escrow-to-borrower wallet transfer and, in the same database transaction, reclassifies principal with **DR 1200 / CR 1300**.
- Repayment posts the existing borrower-to-clearing wallet transfer and, in the same database transaction, reduces the receivable with **DR 1300 / CR 1200** for the principal portion only.
- A repayment's interest portion remains in the existing clearing workflow and does not change account 1200.
- Reconciliation compares account 1200's ledger balance with principal outstanding on disbursed loans, net of posted repayment principal and explicit repayment reversals.

## Account 2100 — Shared User-Wallet Control

Account 2100 is an active THB liability control account, not a wallet and not a source of funds. Each new user-wallet ledger line references both its wallet subledger and account 2100. The amount is still one ledger line and is counted once in transaction balancing and wallet projections.

Historical posted wallet entries remain immutable. The migration adds append-only account-mapping metadata for those existing user-wallet entries, rather than editing or reposting them. Reconciliation compares the combined 2100 ledger/mapping balance with the aggregate user-owned wallet projections.

Both account workflows run inside the existing financial transaction. Any ledger, wallet, repayment, installment, or allocation failure rolls back the account movements together with the business operation. Neither account receives its own platform wallet.

## Existing database migration

The migration activates only the exact seeded definitions for 1200 and 2100, creates them if absent, adds immutable legacy mappings for 2100, and establishes the pre-existing outstanding principal in 1200 by reclassifying it from active source asset 1300. It fails if definitions conflict, if 1200/2100 already have posted activity, or if account 1300 cannot cover the opening receivable reclassification.

For the disposable demo database, apply the migration from `web` with:

```powershell
npm.cmd run demo:migrate
```

This applies migrations only. It does not seed user balances or run tests.
