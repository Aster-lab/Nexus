# WP12.1 — Backend and Database Optimization

Date: 2026-11-21  
Status: Implementation complete; verification intentionally not run.

## Change

The investor portfolio summary previously loaded every investment, posted contribution, and completed payout row into Node.js to count or sum them. It now asks PostgreSQL to return grouped investment counts and aggregate contribution/payout sums. Wallet lookup remains unchanged, and all four independent reads still run concurrently.

The API response contract and calculation rules are unchanged:

- Only investments for the authenticated investor are counted.
- Only contributions linked to `POSTED` ledger transactions are included.
- Only completed payouts linked to `POSTED` ledger transactions are included.
- BigInt money totals are formatted as decimal strings.
- Outstanding principal remains `max(invested principal - received principal, 0)`.
- A missing aggregate value maps to zero.

The existing investor and contribution indexes were reviewed. No speculative index or migration was added without an observed query plan or measured workload. The borrower dashboard currently performs three parallel reads and loads current-version installments for active loans; repayment terms bound each schedule, so this was left unchanged pending measurement.

## Correlated coverage added

The investor API integration coverage now checks that two separately posted contributions are both reflected in portfolio totals and that a completed posted payout's principal/interest totals appear in the portfolio. It also retains the existing checks for contribution detail and ledger status.

Tests, lint, builds, and query-plan checks were not run, per the user's instruction. The coverage is written but its result is unverified.

## Remaining WP12 backend/database work

- Capture production-like query plans and row counts before adding indexes.
- Audit all list APIs for pagination, deterministic ordering, and bounded relation selection.
- Measure dashboard query volume with realistic histories.
- Review Prisma/PostgreSQL pool limits against the chosen hosting plan.
- Run fresh-database migration checks only on a disposable local database.
- Keep repayment, payout, ledger, idempotency, transaction isolation, and retry semantics unchanged during performance work.

