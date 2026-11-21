# NEXUS WP9.5-A — Investor API and Frontend Audit

**Date:** 2026-11-21  
**Scope:** WP9.5-A audit of investor frontend, shared client/auth conventions, API routes/contracts, service boundaries, and test inventory.  
**Method:** Static source and documentation review. No tests or application commands were run.

## Summary

Investor UI implementation is mostly placeholder content. The investor route group is protected by the existing `RoleGuard`, but only overview, marketplace, and portfolio pages exist, and all three currently render `WorkspacePlaceholder`. No investor-specific UI components, client service modules, or focused frontend tests exist yet.

WP8 exposes read and contribution APIs for marketplace opportunities, investments, portfolio summary, repayment allocations, payouts, and profile. It does **not** expose a dedicated investor dashboard endpoint, investor wallet/transaction history endpoint, marketplace filters beyond pagination/sort, payout filters, or allocation detail by ID. WP9.5 must use the endpoints and semantics that exist; it must not create frontend workarounds for absent data. If dashboard/wallet activity is required as a first-class feature, record it as an API gap for a later backend work item.

## Existing frontend inventory

| Area | Current source | Current behavior |
|---|---|---|
| Investor route protection | `src/app/investor/layout.tsx` | Wraps children in `RoleGuard`; backend investor routes still enforce active investor role/profile. |
| Investor overview | `src/app/investor/page.tsx` | Placeholder only. |
| Marketplace | `src/app/investor/marketplace/page.tsx` | Placeholder only; copy correctly says recommendations are unavailable in MVP. |
| Portfolio | `src/app/investor/portfolio/page.tsx` | Placeholder only. |
| Other investor UI routes | None | No investments, allocations, payouts, wallet, or details pages. |
| Investor UI components/client modules | None | No dedicated investor frontend data layer or components. |
| Investor-specific frontend tests | None | Existing tests cover API/service behavior, not investor UI behavior. |

The shared API client, authentication provider, role navigation, Tailwind/shadcn conventions, responsive theme tokens, and request-state components from WP9.2/WP9.3 should be reused. Do not add a separate investor session/auth layer. The investor route guard is a navigation/display affordance; API authorization remains the security boundary.

## Actual investor API contract map

All routes below require an authenticated session, active `INVESTOR` role, and active investor profile. Investor-scoped reads are filtered by the authenticated investor profile. Monetary fields use satang strings at the JSON boundary.

| Capability | Actual route(s) | Request/response and limits | WP9.5 implication |
|---|---|---|---|
| Profile | `GET/PATCH /api/investor/profile` | Own profile; PATCH strict `{ displayName }`. | Optional profile UI; not part of proposed main journey. |
| Marketplace list | `GET /api/investor/marketplace` | Only currently eligible `FUNDING` loans with future deadline, open escrow, and remaining capacity. Paginated. `sortBy=createdAt|fundingDeadline`; `sortOrder`. Returns id/status/principal/funded/rate/term/deadline/created and remaining capacity. | No interest/term/status/amount filters. No borrower identity or application description. Do not promise returns or show personal/underwriting data. |
| Marketplace detail | `GET /api/investor/marketplace/{loanId}` | Same safe public loan terms for a currently eligible loan. No longer-eligible/fully funded loan is a 404. | Handle stale opportunity by refreshing and showing the backend result; do not assume prior list eligibility. |
| Contribution / investments list | `GET/POST /api/investor/investments` | GET lists own investments with linked loan, contributions, and payout-allocation summaries; paginated, sorts by `createdAt`. POST body `{ loanId, amountSatang }`, requires `Idempotency-Key`; service enforces active wallet/funds, current loan eligibility, funding deadline/capacity, escrow. Matching retry reuses result; key conflict is 409. | Use backend constraints; no invented min/max. Confirm only after returned result. Investment detail fields can show persisted contributions and payout allocations. |
| Investment detail | `GET /api/investor/investments/{investmentId}` | Own investment only; includes loan status/terms, contribution rows and ledger refs/status, allocation rows including principal/interest/recovery and repayment reference. Foreign/unknown ID is non-disclosing 404. | No separate investment API gaps for basic detail. This response does not directly include payout relations per allocation. |
| Portfolio summary | `GET /api/investor/portfolio` | Aggregates investment counts, total invested principal, principal/interest received through posted completed payouts, outstanding principal, and own wallet balance/currency/status or null. No forecast. | Good overview source, but not a recent activity feed and not a dedicated dashboard endpoint. Do not call `principalReceived + interestReceived` “profit.” |
| Allocation list | `GET /api/investor/allocations` | Own investments' allocation rows; paginated, sorts by `createdAt`; returns allocation ID, principal/interest/recovery, allocation method/date, investment and repayment IDs, repayment status/date/loan/ledger reference, linked payout details when present. | Can implement allocation history from list; no allocation-by-ID/detail route and no filtering contract. Preserve persisted values; allocations are not wallet credits. |
| Payout list | `GET /api/investor/payouts` | Own payout rows; paginated, sorts by `createdAt`; response includes principal/interest, status, ledger transaction, completion/creation dates, and allocation/repayment/investment references. | No status filter is supported. Use paginated full history and client presentation, not fake server filters. |
| Payout detail | `GET /api/investor/payouts/{payoutId}` | Own payout only; includes wallet/allocation/loan and transaction references, amount split, status, timestamps. | Detail page is supported. No investor detail of another investor's payout (404). |
| Payout initiation | `POST /api/investor/payouts` | Explicitly returns `405 METHOD_NOT_ALLOWED`. Admin/service payout only. | No payout/retry action may be presented to investors. |
| Wallet and wallet activity | No investor-specific wallet route found | Portfolio includes the wallet balance, currency, and status only. | Wallet balance can be shown through portfolio. Transaction history/recent activity is a backend gap; do not substitute ledger internals or derive an incomplete timeline from investment/payout lists. |
| Investor dashboard | No dedicated `/api/investor/dashboard` | Portfolio summary is the only aggregate summary. | Dashboard can compose portfolio + existing lists with independent states, but list pages are paginated and must not be presented as complete aggregate activity. Keep dashboard metrics to portfolio response and clearly scoped recent rows if used. |
| Recommendations | `POST/GET /api/ml/investor-recommendations` | Depends on compatible model and saved preferences; run results may be stale/filtered by live eligibility. | MVP prediction/recommendation remains unavailable per current product decision; never fabricate. If surfaced later, report service availability faithfully. |

## Financial and permission constraints confirmed

- Marketplace eligibility, investment limits, wallet balance checks, contribution posting, allocation amounts, payout status, and wallet effects are backend-owned.
- `postInvestorContribution()` is the authorized investment operation. UI must not mutate wallet balance or ledger directly.
- WP7 payout processing remains administrator/service initiated. Investors have read-only allocation/payout views and no retry capability.
- Allocation rows are persisted results from repayment processing; they must not be recalculated in React and must not be represented as completed payouts.
- A payout should be shown as complete only with backend `COMPLETED` status and its posted transaction linkage. Failed/pending status must not be confused with available wallet funds.
- Zero allocation policy and full-allocation payout behavior are backend concerns; the UI displays returned rows/statuses and does not create a payout entry for a zero allocation.
- The contribution contract requires idempotency. Retry behavior must retain the same key for the same logical request and must not automatically replay a financial write.

## Existing test/fixture inventory

- API integration: `tests/api/investor-api.integration.test.ts` exercises profile, role rejection, public marketplace data, contributions, investor scoping, portfolio, allocations, payout visibility, and investor payout-initiation rejection.
- Service/integration: `tests/services/investor-contribution.service.test.ts`, `tests/services/investor-payout.integration.test.ts`, `tests/services/investor-refund.service.test.ts` cover financial services and WP7 payout/reconciliation behavior.
- Fixtures: `tests/fixtures/investor-contribution.fixture.ts`, `tests/fixtures/repayment-allocation.fixture.ts` support persisted investor and allocation lifecycles.
- Frontend tests and investor client modules: absent at audit time.
- UI tooling: Vitest is installed. Existing WP9 component checks use server-rendered markup, not browser interactions. No browser automation or DOM test dependency/configuration is present in `package.json`.

## API gaps to track (do not solve in the frontend)

1. Investor wallet transaction history/recent activity endpoint.
2. Optional investor dashboard aggregation endpoint if a consistent multi-section snapshot is required; otherwise compose only supported portfolio/list APIs and accept independent loading states.
3. Marketplace filters (none currently supported beyond page/sort); implement no unsupported filters.
4. Payout status filter (not supported); implement no server-filter UI unless the API contract changes.
5. Allocation detail endpoint (not available); allocation list row can link to its investment or repayment/loan where supported, but must not imply a dedicated allocation detail API.

These are gaps only if product acceptance requires them. The core investor journey can proceed with the existing list/detail, portfolio, contribution, allocation, payout, and wallet summary APIs.

## Approved implementation sequence

1. WP9.5-A audit — complete in this document.
2. WP9.5-B tests-first design — document scenario coverage and contract limits before implementation; write focused investor client/component/API tests before each UI stage.
3. WP9.5-C investor dashboard — portfolio summary with independent API request states and honest limitations; no invented wallet activity.
4. WP9.5-D marketplace list/detail — use supported pagination/sort only and handle stale eligibility.
5. WP9.5-E contribution flow — exact API contract, local convenience validation based on real schema only, confirmation, idempotency, uncertain result handling, then refresh portfolio/list.
6. WP9.5-F portfolio and investment details — distinguish invested, allocated, paid out, and remaining amounts according to API data; no forecasts.
7. WP9.5-G allocation history — display persisted backend breakdown; link to related investment/loan; no independent calculation.
8. WP9.5-H payout history/details and wallet summary — read-only payouts, no retry/initiation controls; wallet balance from portfolio API only.
9. WP9.5-I cross-flow integration and regression — after investor pages are implemented, do focused static review, then execute tests only when authorized.

## Scope consistency note

The WP9 implementation review from 2026-11-21 leaves WP9.4.8 integration/regression open and records WP9.5–WP9.9 as future work. This plan labels WP9.4 complete. The WP9.5 implementation can begin without altering that prior status, but the final WP9 report must continue to distinguish implemented borrower stages from unexecuted integration/regression validation.

## Audit completion

WP9.5-A audit deliverables are complete: frontend inventory, actual API mapping, request/response limits, UI mapping, missing API capabilities, test/fixture inventory, financial boundaries, and a contract-aligned implementation sequence are recorded above. No code was changed and no tests or runtime commands were run.
