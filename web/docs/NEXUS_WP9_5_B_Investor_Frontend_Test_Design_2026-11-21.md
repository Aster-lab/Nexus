# NEXUS WP9.5-B — Investor Frontend Acceptance Test Design

**Date:** 2026-11-21  
**Status:** Design baseline, before investor UI implementation.  
**Method:** Derived from the supplied WP9.5 plan and current investor API contracts. No tests were executed.

## Design principles

1. Preserve all 67 scenario IDs supplied in the plan. The plan's stated total of 68 is an arithmetic mismatch: the listed groups contain 6 auth + 8 dashboard + 7 marketplace + 12 investment + 8 portfolio + 8 allocation + 11 payout + 7 wallet = **67** scenarios.
2. Split verification into client/component behavior and existing API authorization/contract coverage. A UI test must not replace the API test for ownership or financial correctness.
3. Use actual backend response contracts and supported filters/sorts only. Do not add mocked fields that the API does not return.
4. Keep test setup isolated and correlated to each feature. Do not run any tests until explicitly requested.
5. Current component tests use server rendering. They can validate initial accessible markup, but interaction scenarios require a browser/DOM harness decision before claiming complete UI coverage.

## Test-to-feature mapping

| Scenario group | Planned frontend test location | Existing backend coverage / required treatment |
|---|---|---|
| INV-AUTH-01–06 | `tests/components/investor-access.test.tsx`; `tests/lib/client/investor-dashboard.test.ts` for session refresh | Existing role guards and authenticated investor API tests. Cross-investor resource ownership stays asserted in investor API integration tests. Session expiry needs auth provider handling; distinguish 401 from network failure. Admin access follows the actual investor layout guard policy and API role requirement; do not assume ADMIN implicitly has INVESTOR. |
| INV-DASH-01–08 | `tests/lib/client/investor-dashboard.test.ts`; `tests/components/investor-dashboard.test.tsx` | Portfolio summary contract from `GET /api/investor/portfolio`; no dedicated dashboard endpoint. Section failure isolation applies only if multiple requests are composed. Dashboard refresh follows successful contribution and page re-entry. Metrics limited to portfolio response. |
| INV-MKT-01–07 | `tests/lib/client/investor-marketplace.test.ts`; `tests/components/investor-marketplace.test.tsx`; route-level integration as appropriate | Existing API integration covers eligible funding loans, public-safe response, details, and role enforcement. No filters besides page/sort; INV-MKT-04 must verify only supported server sorting/pagination or be revised to a supported filter only if the endpoint contract changes. |
| INV-INVEST-01–12 | `tests/lib/client/investor-investments.test.ts`; `tests/components/investor-investment-form.test.tsx`; existing contribution API integration | Existing server contract requires `loanId`, positive integer satang string (max 20 digits), idempotency header, backend wallet/capacity/eligibility checks, and 201 confirmed result. No minimum/maximum beyond existing service/policy behavior may be invented. Other-investor investment is covered by existing GET detail ownership checks. |
| INV-PORT-01–08 | `tests/lib/client/investor-portfolio.test.ts`; `tests/components/investor-portfolio.test.tsx` | API coverage should verify portfolio own profile, persisted contribution and completed payout totals, wallet projection, and foreign data isolation. “Investment status changes” uses refresh and actual status strings. |
| INV-ALLOC-01–08 | `tests/lib/client/investor-allocations.test.ts`; `tests/components/investor-allocations.test.tsx` | Existing allocation API returns persisted principal/interest/recovery, repayment status/date/loan and optional payout. No allocation detail endpoint. Rounding/final-installment tests should compare against server-returned rows or API integration records; do not recompute in UI tests. |
| INV-PAYOUT-01–11 | `tests/lib/client/investor-payouts.test.ts`; `tests/components/investor-payouts.test.tsx` | Existing API lists/details only owned payouts; investor POST is 405. Status filtering is absent. Completed/pending/failed rendering only where those statuses are returned by schema/API. Failed administrator retry is a backend-admin action; investor test verifies refresh reflects changed status, not ability to retry. Zero allocation should not fabricate a payout. |
| INV-WALLET-01–07 | `tests/lib/client/investor-wallet.test.ts`; `tests/components/investor-wallet.test.tsx` | Current portfolio endpoint returns wallet balance/currency/status. No wallet transaction history route. INV-WALLET-02/03/04 require a future documented endpoint or a constrained no-activity/refresh assertion; do not derive a purported wallet ledger from unrelated lists. Wallet modification remains absent from UI, while investor POST payout API rejection remains covered. |

## Scenario dispositions required by current contracts

The supplied baseline remains the target, but scenarios that presuppose unsupported API features must be handled accurately:

- **INV-MKT-04 filter opportunities:** unsupported today. Do not add a filter control; revise this scenario to check the supported page/sort query contract and empty/error handling. If product insists on filtering, request the backend filter contract first.
- **INV-WALLET-02 transaction history:** unsupported today. Keep it as an API-gap acceptance item, not a frontend fake. Current stage can verify that no unsupported feed is shown and wallet status/balance come from portfolio.
- **INV-WALLET-03/04 wallet updated after investment/payout:** test portfolio refresh after backend-confirmed operation/status change. Without transaction history, assert balance comes from the refreshed API response, not a client-side predicted delta.
- **INV-ALLOC detail:** no direct detail endpoint exists. Use a row/detail presentation from paginated allocation data only, linking to an owned investment or loan as API permits.
- **Payout filtering:** not explicitly listed as a scenario but mentioned in plan. No API filter exists; do not add one over a paginated subset.
- **INV-AUTH-04 administrator access:** investor API requires an active INVESTOR role/profile. Admin users without that role should be denied; actual multi-role admins with an investor role follow the same required role contract.
- **Failed/pending payout fixtures:** create/assert only statuses accepted by the current schema and service. Do not add lifecycle values unsupported by the enum.

## Coverage checklist for implementation stages

### WP9.5-C Dashboard

- Unit/client: portfolio path and payload preservation; currency/status/null wallet; no invented metrics; independent sections if supported sources are combined; refresh event.
- Component: accessible loading, error/retry, empty/no-investment and populated states; confirmed values only.

### WP9.5-D Marketplace

- Client: list/detail paths, page/limit/sort allowlist, pagination payload.
- Component: eligible/empty/unavailable/error states, stale-detail 404 refresh path, no borrower identifying fields, no unsupported filters or guaranteed-return language.

### WP9.5-E Investment submission

- Client: exact JSON body and idempotency header, input satang precision from actual integer contract, submission guard, uncertain timeout behavior and same-key retry.
- Component: confirmation, disabled/in-flight action, 201 success only, errors/conflicts without optimistic wallet change, refresh portfolio/marketplace.
- API integration remains responsible for wallet, escrow, capacity, concurrency, idempotency, and ownership.

### WP9.5-F Portfolio/details

- Client: list/detail paths and pagination; preserve nested contribution/allocation amounts/statuses.
- Component: empty and status views; separate invested, allocated, paid, outstanding amounts; never call allocations “paid”.

### WP9.5-G Allocation history

- Client: supported list pagination/sort; no invented detail path.
- Component: persisted principal/interest/recovery and optional payout status; empty/error/pagination; no allocation math.

### WP9.5-H Payout/wallet

- Client: own payout list/detail paths; no investor POST; portfolio wallet summary only.
- Component: actual pending/completed/failed enum statuses, completed-wallet-credit explanation only after confirmation, no investor retry or wallet mutation controls, no unsupported transaction feed.

### WP9.5-I Integration/regression

- Authenticated investor navigation and session-expiry recovery.
- Marketplace → contribution → portfolio/detail → allocations → payouts/wallet-summary flow.
- Confirm no sensitive borrower identity or internal underwriting data appears.
- Confirm dashboard/portfolio reflects server state after successful contribution and later payout status change.
- Maintain API ownership and financial-service tests as the authoritative financial assertions.

## Test harness limit

`package.json` currently provides Vitest without a DOM testing library/browser automation dependency. Existing component tests use `renderToStaticMarkup`. Before implementing interaction-heavy forms/dialogs, choose a compatible interactive component test approach (e.g. add a DOM environment and Testing Library, or rely on an approved browser E2E stack). Until that is configured and executed, mark interaction/browser acceptance as unverified. Do not install packages or run tests under this design-only checkpoint without explicit authorization.

## Completion criteria for WP9.5-B

- All supplied scenario IDs are accounted for.
- Unsupported API assumptions are explicitly revised or held as backend gaps.
- Tests are assigned to client/component/API layers without duplicating financial authority.
- UI implementation has not begun before this baseline is reviewed.

No tests were executed and no application code was changed for this test-design document.
