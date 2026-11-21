# NEXUS Phase 5 WP8 — API-04 Investor APIs

**Date:** 20 November 2026  
**Scope:** Investor profile, loan marketplace, investments, portfolio, payout history, and payout allocations

## Summary

API-04 adds investor-facing Next.js App Router endpoints using the existing API-01 response, pagination, validation, and error helpers and API-02 session authentication. Investor identity is always derived from the persisted session. Read queries are scoped to that authenticated investor profile, and investment writes delegate to the existing contribution service so the API does not implement a second financial posting path.

The API-04 integration tests were authored first in `tests/api/investor-api.integration.test.ts`. They cover authenticated profile access, role denial, eligible marketplace visibility, borrower privacy, contributions, invalid amounts and unavailable loans, investment idempotency, owner-scoped portfolio/investment/payout/allocation access, investor payout denial, and profile updates. **No tests, test files, typecheck, lint, or build were run**, per instruction. The work has only had a source-level review; runtime behavior and generated Prisma typings remain unverified.

## Endpoints implemented

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET, PATCH | `/api/investor/profile` | Return the authenticated investor's profile; allow updating `displayName` only. |
| GET | `/api/investor/marketplace` | Paginate loans in `FUNDING` with a future funding deadline and open escrow; expose public loan terms without borrower identity. |
| GET | `/api/investor/marketplace/[loanId]` | Return one eligible loan with the same public-only field selection. |
| GET, POST | `/api/investor/investments` | List owned investments; post a contribution with an idempotency key through `postInvestorContribution()`. |
| GET | `/api/investor/investments/[investmentId]` | Return an owned investment, persisted contributions, and payout allocation breakdowns. |
| GET | `/api/investor/portfolio` | Summarize persisted posted contributions, completed posted payouts, investment counts, and the current wallet projection. |
| GET | `/api/investor/payouts` | Paginated payout history for the authenticated investor. |
| GET | `/api/investor/payouts/[payoutId]` | Return a payout only when it belongs to the authenticated investor. |
| POST | `/api/investor/payouts` | Explicitly reject investor-initiated payouts with `405 METHOD_NOT_ALLOWED`. |
| GET | `/api/investor/allocations` | Paginated allocation history for the authenticated investor's investments. |

All handlers declare the Node.js runtime and dynamic response behavior. Satang `bigint` values are serialized as decimal strings. List endpoints use the shared pagination parser and response envelope.

## Decisions and rules followed

- **Session-derived identity:** Every route calls `requireInvestor()`, which authenticates the API session, requires the `INVESTOR` role, verifies the linked profile exists and is active, and returns the authenticated profile for query scoping.
- **Marketplace privacy:** Marketplace queries explicitly select public loan fields. They do not select the borrower's profile, legal name, phone, email, application, or submitted application data.
- **Investment writes:** The POST route validates `loanId`, a positive integer `amountSatang`, and the `Idempotency-Key` header, then calls `postInvestorContribution()` with the session user ID. Existing service behavior remains authoritative for wallet status/funds, loan status, funding deadline, escrow, funding capacity, ledger posting, and idempotent replay/conflict handling.
- **Investment minimum:** No configurable minimum investment amount was found in the current contribution service or schema. The API does not invent one. Amounts must be positive whole satang and cannot exceed the remaining funding capacity enforced by the service.
- **Portfolio figures:** Invested amounts come from persisted contributions whose ledger transaction is `POSTED`. Received principal and interest come from completed investor payouts linked to `POSTED` transactions. Wallet balance is read from the ledger-maintained wallet projection; routes do not write or repair financial state.
- **Payout ownership and control:** Investor payout and allocation history is read-only and constrained by `investorProfileId`. Payout processing remains an administrative/service workflow and is not exposed as an investor write API.
- **Missing records:** Owner-scoped detail queries return `404` for missing or non-owned records, avoiding disclosure that another investor's resource exists.

## Files added or changed

- `src/lib/api/investor.ts` — common authenticated active-investor guard.
- `src/app/api/investor/profile/route.ts`
- `src/app/api/investor/marketplace/route.ts`
- `src/app/api/investor/marketplace/[loanId]/route.ts`
- `src/app/api/investor/investments/route.ts`
- `src/app/api/investor/investments/[investmentId]/route.ts`
- `src/app/api/investor/portfolio/route.ts`
- `src/app/api/investor/payouts/route.ts`
- `src/app/api/investor/payouts/[payoutId]/route.ts`
- `src/app/api/investor/allocations/route.ts`
- `tests/api/investor-api.integration.test.ts`

## Review notes and limitations

- The marketplace relies on the existing lifecycle invariant that a fully funded loan transitions out of `FUNDING`; it also filters rows with `fundedSatang < principalSatang` before returning them. The detail endpoint applies the same check.
- Portfolio `outstandingPrincipalSatang` is reported as posted contribution principal less principal from completed posted payouts, floored at zero. It does not independently estimate accrued interest or projected future cash flows.
- API-04 test setup creates realistic investor and loan fixtures. Contribution/opening-balance postings are append-only financial history, so the test cleanup revokes temporary sessions and restores shared account state through the lifecycle fixture; the integration database should be reset between runs to clear immutable test records.
- Tests were not run. In particular, no claim is made that Vitest execution, Prisma query typing, TypeScript compilation, lint, or Next.js route compilation succeeds yet.

## Completion

The requested API-04 investor API surface and test-first integration suite have been implemented and reviewed against the current authentication, contribution, payout, and database rules. Execution verification remains pending because it was explicitly prohibited.
