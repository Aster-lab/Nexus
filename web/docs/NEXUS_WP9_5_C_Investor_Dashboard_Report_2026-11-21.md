# NEXUS WP9.5-C — Investor Dashboard

**Date:** 2026-11-21  
**Scope:** Investor dashboard only.  
**Status:** Implemented; source reviewed. Tests were authored first and remain unrun per instruction.

## Delivered

Replaced the investor overview placeholder with an authenticated investor dashboard at `/investor`. The existing investor `RoleGuard` layout continues to protect the route. The page uses Tailwind and the project's shadcn-compatible Card, Badge, Button, and Skeleton components.

The dashboard concurrently reads three existing, investor-scoped APIs:

- `GET /api/investor/portfolio` for persisted portfolio totals and wallet summary.
- `GET /api/investor/investments?page=1&limit=5&sortBy=createdAt&sortOrder=desc` for five recent investment records.
- `GET /api/investor/payouts?page=1&limit=5&sortBy=createdAt&sortOrder=desc` for five recent payout records.

Each resource has independent loading, error, retry, and empty behavior. A failure in the recent investment or payout request does not prevent successful portfolio summary data from displaying. The dashboard refreshes all sections through a manual refresh control and a shared investor dashboard refresh event intended for successful investment mutations.

## Summary and display decisions

- Displays available wallet balance, wallet currency/status, total invested principal, active/completed investment counts, outstanding principal, principal received through completed posted payouts, and interest received through completed posted payouts.
- The principal and interest received amounts stay separate. The UI does not add them into a derived total or label them as profit.
- Recent investments show investment/loan references, date, and backend status. The existing list contract does not provide an investment principal field, so the dashboard does not derive one by summing contribution rows.
- Recent payouts show the persisted principal and interest portions separately, date, and payout status. They are not presented as wallet credits unless the backend payout status is `COMPLETED`.
- Allocated repayment amounts are not shown as paid-out money.
- Wallet activity displays an explicit unavailable state because there is no investor wallet-transaction history API. The dashboard does not infer a transaction feed from investment and payout lists.
- No marketplace filters, portfolio forecasts, ML recommendation, or other unsupported feature was added.

## Tests authored before implementation

- `tests/lib/client/investor-dashboard.test.ts`
  - Confirms the client uses only the existing portfolio, investor investment list, and investor payout list paths.
  - Verifies a failed investment-list request leaves portfolio and payout data usable.
  - Verifies the refresh notification lifecycle for later successful contribution integration.
- `tests/components/investor-dashboard.test.tsx`
  - Checks accessible initial loading markup.
  - Covers an empty investor account and absent wallet without fabricated balance values.
  - Checks that populated summary values are formatted from the API payload.
  - Confirms wallet transaction history is communicated as unavailable.

These tests were not run. No typecheck, lint, build, browser rendering, or app server was run.

## Files changed

- `src/lib/client/investor-dashboard.ts` — investor dashboard API response types, resource loaders, independent states, paths, and refresh event helpers.
- `src/components/investor/investor-dashboard.tsx` — responsive investor dashboard.
- `src/app/investor/page.tsx` — replaces the placeholder with the dashboard.
- `tests/lib/client/investor-dashboard.test.ts` — focused client tests.
- `tests/components/investor-dashboard.test.tsx` — focused component assertions.

## Remaining WP9.5 work

This completes WP9.5-C only. Marketplace, investment submission, portfolio/detail, allocation, payout/wallet pages, and full investor-flow integration remain in WP9.5-D through WP9.5-I. The wallet transaction history display remains limited until a backend endpoint is available.
