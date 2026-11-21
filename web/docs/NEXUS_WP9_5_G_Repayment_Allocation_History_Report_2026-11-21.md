# NEXUS WP9.5-G — Repayment Allocation History

**Date:** 2026-11-21  
**Scope:** Investor read-only repayment allocation history.  
**Status:** Implemented; source reviewed. Tests were authored first and remain unrun per instruction.

## Delivered

Added `/investor/allocations` under the existing investor role-protected route group. The page uses the existing `GET /api/investor/allocations` endpoint and its server pagination and `createdAt` sorting. It also adds an allocation-history entry from the investor dashboard.

The existing API already scopes rows through the authenticated investor's investments and returns persisted allocation principal, interest, recovery, allocation method/date, investment and repayment references, repayment status/date/loan/transaction, and linked payout status/references when present. No new endpoint, allocation detail route, database model, or backend calculation was added.

## UI behavior and financial boundaries

- Displays allocation reference, linked investment, loan and repayment references, allocation date, principal/interest/recovery portions, persisted method, repayment status, and payout status where present.
- Links the investment reference to its existing owner-scoped investment detail page.
- Clearly separates allocation from payout: an allocation with no payout is “Not paid out”; a pending/processing/failed payout is “Not credited to wallet”; credit is indicated only for a completed payout with a ledger transaction reference.
- Does not sum allocation amounts in React, recompute the largest-remainder allocation, infer a payout, or modify records.
- Uses supported pagination and created-date ordering only. No unsupported filters or allocation-by-ID detail link was added.
- Provides loading, empty, error/retry, refresh, and responsive table states.

## Tests authored first

- `tests/lib/client/investor-allocations.test.ts` checks the actual paginated path, supported sort parameters, and exact allocation payload preservation.
- `tests/components/investor-allocations.test.tsx` covers loading, empty, retryable error, persisted amount splits, allocation method display, and no false wallet credit.
- Existing `tests/api/investor-api.integration.test.ts` `API-04-13` was strengthened to create a real repayment/allocation lifecycle and compare the investor API response to persisted allocation and repayment references/amounts. Existing role scoping is retained.

The tests were not run. Typecheck, lint, build, and browser verification were not run.

## Files changed

- `src/lib/client/investor-allocations.ts`
- `src/components/investor/investor-allocations.tsx`
- `src/app/investor/allocations/page.tsx`
- `src/components/investor/investor-dashboard.tsx` — adds allocations navigation.
- `tests/lib/client/investor-allocations.test.ts`
- `tests/components/investor-allocations.test.tsx`
- `tests/api/investor-api.integration.test.ts`
- `docs/api/investor-api.md`

## Remaining WP9.5 scope

This completes WP9.5-G only. Payout history/details and wallet summary remain WP9.5-H; full investor workflow integration/regression remains WP9.5-I. Wallet transaction history still requires a backend API and is not fabricated from allocation records.
