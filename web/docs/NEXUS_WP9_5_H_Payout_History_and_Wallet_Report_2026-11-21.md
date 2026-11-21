# NEXUS WP9.5-H — Investor Payout History and Wallet Summary

**Date:** 2026-11-21  
**Status:** Implemented; review completed; tests not run per instruction.

## Scope

WP9.5-H adds investor-facing payout history and payout detail views, plus a read-only simulated wallet summary. It builds on the existing investor API and role-protected application shell. It does not add payout processing controls or a new receipt, payout, or wallet-history backend model.

## Implementation

- Added typed payout list/detail client helpers in `src/lib/client/investor-payouts.ts`. The list helper sends only API-supported pagination and sorting parameters (`page`, `limit`, `sortBy=createdAt`, `sortOrder`); detail IDs are URL-encoded.
- Added `src/components/investor/investor-payouts.tsx` for paginated history and individual payout details. Views show persisted principal and interest portions, payout and allocation references, linked investment/repayment/loan references, status, timestamps, and the payout ledger transaction reference.
- A payout is described as credited only when its persisted status is `COMPLETED` and it has a ledger transaction reference. Failed payouts are identified as administrator-managed; investors receive no retry, initiation, edit, or reversal controls.
- Added `src/components/investor/investor-wallet.tsx` and the `/investor/wallet` route. It displays the portfolio endpoint's persisted wallet balance, currency, and status, with loading/error/empty states. It contains no balance-changing controls.
- Added `/investor/payouts` and `/investor/payouts/[payoutId]` routes. They inherit investor route protection from the established role shell.
- Updated investor dashboard links and role navigation so payout history and wallet summary are discoverable.
- Corrected `docs/api/investor-api.md` to describe actual payout query support and the missing wallet activity endpoint.

## Tests authored

- `tests/api/investor-api.integration.test.ts`: API-04-09 now checks the wallet summary against persisted wallet data; API-04-11 exercises repayment, allocation, payout posting, and verifies the owner's payout list and detail response.
- `tests/lib/client/investor-payouts.test.ts`: URL construction, sorting contract, detail-path encoding, and payout response handling.
- `tests/components/investor-payouts.test.tsx`: loading and empty states, completed/failed rendering, references, amount splits, and absence of investor payout actions.
- `tests/components/investor-wallet.test.tsx`: loading, persisted balance/currency/status, activity-endpoint gap, and absence of wallet mutation controls.
- `tests/lib/client/auth-access.test.ts`: investor navigation now includes payout history and wallet summary.

**Execution:** no tests, application commands, or type checks were run. Review was limited to source inspection and `git diff --check`; that check reported line-ending normalization warnings in existing and edited files, but no whitespace errors.

## API and product decisions

- Payout records are read from `GET /api/investor/payouts` and `GET /api/investor/payouts/{payoutId}`; portfolio wallet data comes from `GET /api/investor/portfolio`.
- The payout API supports sorting only by `createdAt`; it does not support the previously documented `completedAt` sort or a status filter. UI sorting therefore uses only the supported creation-date sort order.
- There is no investor wallet transaction-history API. The wallet screen states this plainly and does not infer a ledger feed from contributions, allocations, or payouts.
- Investors cannot initiate or administer payouts, and cannot change wallet balances. These screens are read-only.
- Amounts and statuses are presented from backend response data; no financial figures or payout state are recalculated in the UI.

## Review notes and follow-up

- The backend payout detail endpoint is investor-scoped and returns 404 for a payout belonging to another investor; existing API-04-14 covers that boundary.
- `InvestorPayoutDetailsPage` shows payout, allocation, investment, repayment, loan, and linked repayment-ledger references available from the current detail response.
- The API list has no status filter; do not add a frontend-only status filter pretending it is server-side pagination until the backend contract supports it.
- Wallet activity requires a future backend/API work item if product needs a transaction history. Until then, balance summary is the full supported wallet scope.
- Run the focused tests and type checks only when explicitly requested.
