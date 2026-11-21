# NEXUS WP9.5-F — Portfolio and Investment Details

**Date:** 2026-11-21  
**Scope:** Investor portfolio list and owned investment details.  
**Status:** Implemented; source reviewed. Tests were authored before implementation and remain unrun as instructed.

## Delivered

Replaced the `/investor/portfolio` placeholder with a paginated investor-owned investment list and added `/investor/investments/{investmentId}` for persisted detail. Both pages use Tailwind and the project's shadcn-compatible Card, Badge, Button, and Skeleton components and remain under the existing investor role guard.

Portfolio supports pagination and created-date ordering (`asc`/`desc`) provided by `GET /api/investor/investments`. No active/completed status filter was added because the endpoint does not support one, and client filtering of a single server page would be incomplete.

Investment detail uses the existing owner-scoped `GET /api/investor/investments/{investmentId}` endpoint. Foreign IDs remain non-disclosing 404s through the backend query.

## API response improvements

The actual API did not expose a per-investment posted contribution total or payout status on allocation rows. Those gaps prevented the UI from clearly showing amount invested and distinguishing allocation from wallet credit without client-side financial calculations. The existing read endpoints were extended:

- Investment list and detail now return `totalContributedSatang`, aggregated in the backend from contributions linked to `POSTED` ledger transactions.
- Investment detail allocation rows now include their linked payout, when present: payout ID/status, principal/interest amounts, ledger transaction reference, and completion timestamp.
- `docs/api/investor-api.md` documents these existing-route response fields.
- No new endpoints or data models were added. No financial records are modified by these reads.

## Frontend behavior

### Portfolio list

- Shows investment reference, backend-derived posted contribution amount, loan reference/status, investment status, and investment date.
- Includes loading, retryable error, empty, pagination, and created-date sort states.
- Provides a details link for each owned investment and a marketplace action for an empty portfolio.

### Investment details

- Shows posted contribution total separately from the associated loan principal, rate, term, and current loan/investment statuses.
- Lists each contribution with its amount, date, and linked ledger status.
- Lists persisted repayment allocations with principal, interest, and recovery split and repayment reference.
- Separately shows payout status/amount/timestamp when a payout exists. An allocation without a completed payout is explicitly not described as a wallet credit. A credit is described as complete only when the payout status is `COMPLETED` and a ledger transaction reference exists.
- Does not calculate allocation amounts, combine separate amount fields into a frontend total, infer outstanding principal, or show borrower-private data.
- Loading, retry, and unavailable/ownership error states are included.

## Tests authored first

- `tests/lib/client/investor-portfolio.test.ts` checks supported list pagination/sorting, list/detail paths, URL encoding, posted contribution total preservation, and payout status preservation.
- `tests/components/investor-portfolio.test.tsx` checks loading, empty portfolio, and separate invested/allocated/not-yet-paid display.
- `tests/api/investor-api.integration.test.ts` extends `API-04-09` to create a posted contribution and verify list/detail `totalContributedSatang` against the successful contribution record. Existing `API-04-10` checks cross-investor detail denial.
- Tests were not run. Typecheck, lint, build, and browser rendering were not run.

## Files changed

- `src/app/api/investor/investments/route.ts`
- `src/app/api/investor/investments/[investmentId]/route.ts`
- `src/lib/client/investor-portfolio.ts`
- `src/lib/client/investor-dashboard.ts` — aligned list response type with the new aggregate.
- `src/components/investor/investor-portfolio.tsx`
- `src/app/investor/portfolio/page.tsx`
- `src/app/investor/investments/[investmentId]/page.tsx`
- `tests/api/investor-api.integration.test.ts`
- `tests/lib/client/investor-portfolio.test.ts`
- `tests/components/investor-portfolio.test.tsx`
- `docs/api/investor-api.md`

## Remaining WP9.5 work

This completes WP9.5-F only. Allocation browsing and payout/wallet pages remain WP9.5-G/H; end-to-end investor flow integration and regression remain WP9.5-I. Wallet transaction history and server-side status filters remain unavailable API capabilities and were not simulated in the UI.
