# NEXUS WP9.5-D — Investment Marketplace

**Date:** 2026-11-21  
**Scope:** Marketplace list and eligible opportunity detail.  
**Status:** Implemented; source reviewed. Tests were authored first and remain unrun as instructed.

## Delivered

Replaced the investor marketplace placeholder with a responsive opportunity list at `/investor/marketplace` and an opportunity detail route at `/investor/marketplace/{loanId}`. The pages use Tailwind and existing shadcn-compatible Card, Badge, Button, and related UI primitives. The existing `/investor` role-protected layout continues to guard both routes.

The pages use the existing API contracts:

- `GET /api/investor/marketplace` for currently eligible funding opportunities.
- `GET /api/investor/marketplace/{loanId}` for current detail eligibility and terms.

The list supports only the server's pagination and sorting fields: creation date or funding deadline, ascending/descending. It does not add unsupported term, rate, status, or amount filters. API eligibility is rechecked by requesting the detail endpoint; a loan that is no longer eligible displays an unavailable state with retry and return navigation.

## Display and financial safety decisions

- Shows loan reference, backend status, principal, funded amount, remaining funding capacity, annual rate, term, and deadline where returned.
- No borrower identity, application snapshot, internal underwriting values, or unapproved recommendation data are exposed.
- Makes clear that the marketplace is not a guarantee of returns and that funding eligibility can change.
- Does not calculate projected returns, installment schedules, or funding progress percentages.
- No investment submission action was added in this stage; that is WP9.5-E and must use `POST /api/investor/investments` with the backend-supported idempotency key.
- Loading, empty, error/retry, and stale/unavailable detail states are implemented.

## Tests authored before implementation

- `tests/lib/client/investor-marketplace.test.ts` checks supported query construction, list/detail endpoint paths, payload preservation, URL encoding, and absence of unsupported filter parameters.
- `tests/components/investor-marketplace.test.tsx` covers initial loading, empty list, retryable list error, public detail terms, no borrower identity, and stale/unavailable opportunity state.
- Existing `tests/api/investor-api.integration.test.ts` already covers currently open funding loans, safe public detail data, and non-investor authorization rejection (`API-04-02` through `API-04-04`). No duplicate API tests were added in this UI checkpoint.

Tests, typecheck, lint, build, and browser rendering were not run.

## Files changed

- `src/lib/client/investor-marketplace.ts`
- `src/components/investor/investor-marketplace.tsx`
- `src/app/investor/marketplace/page.tsx`
- `src/app/investor/marketplace/[loanId]/page.tsx`
- `tests/lib/client/investor-marketplace.test.ts`
- `tests/components/investor-marketplace.test.tsx`

## Remaining WP9.5 work

This completes WP9.5-D only. Investment contribution flow is WP9.5-E; portfolio/detail, allocation, payout/wallet, and full investor integration remain. Recommendation models remain unavailable for the MVP.
