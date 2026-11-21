# NEXUS Phase 5 WP8 — API-03 Borrower APIs

**Date:** 20 November 2026  
**Scope:** Borrower application, offer, loan, schedule, repayment, and receipt APIs

## Summary

API-03 implements the borrower journey through Next.js App Router handlers. Every route derives its actor and borrower profile from the authenticated API-02 session, uses API-01 response and validation helpers, scopes record access to that borrower, and returns satang values as decimal strings. Financial submission and receipt generation call the existing WP6 services.

## Follow-up: API-03-13–18 authorization fixture

**Date:** 20 November 2026

The schedule, repayment, and receipt cases (API-03-13–18) used sessions created for borrowers from the repayment lifecycle fixture. That fixture creates a borrower user and profile but does not assign the `BORROWER` role. API-02 authentication therefore returned a valid identity with no borrower role, and the API correctly rejected these requests with `403 FORBIDDEN` at `requireRole()` before reaching schedule ownership or repayment logic.

The API-03 test helper now grants or restores the `BORROWER` role for the lifecycle-fixture borrower before creating the session. Test teardown removes that temporary role assignment and keeps the fixture's account-state restoration. The API-03-13 diagnostic `console.log` calls were removed. No production authorization rule was weakened or changed.

Tests were not run for this fix, as requested. The updated test behavior remains unverified by execution.

The WP8 plan assumed application and offer-acceptance services already existed. Repository review found neither, so API-03 adds those domain services and keeps their lifecycle rules out of route handlers. The integration suite covers API-03-01 through API-03-18. **Tests were not run**, as requested; runtime and type-check status remain unverified.

## Endpoints

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET, POST | `/api/borrower/applications` | List the authenticated borrower's applications with pagination; create a validated draft against the active loan-offer policy. |
| GET, PATCH | `/api/borrower/applications/[applicationId]` | Retrieve an owned application; update a DRAFT by creating a new immutable version. |
| POST | `/api/borrower/applications/[applicationId]/submit` | Submit an owned DRAFT and mark its current version submitted. |
| GET | `/api/borrower/offers` | List only unexpired ISSUED offers on the borrower's APPROVED applications. |
| POST | `/api/borrower/offers/[offerId]/accept` | Accept an eligible offer once and create its FUNDING loan. |
| GET | `/api/borrower/loans` | Paginated list of the borrower's loans. |
| GET | `/api/borrower/loans/[loanId]` | Retrieve an owned loan's status and persisted terms. |
| GET | `/api/borrower/loans/[loanId]/schedule` | Retrieve the current persisted schedule for an owned loan; does not calculate or generate a schedule. |
| POST | `/api/borrower/repayments` | Require an `Idempotency-Key`, validate the amount, derive borrower actor from session, and call `submitRepayment`. |
| GET | `/api/borrower/repayments/[repaymentId]/receipt` | Verify ownership, then call `generateRepaymentReceipt` for the persisted posted transaction. |

All routes return the shared API-01 envelopes with `Cache-Control: no-store`. Dynamic IDs are validated as UUIDs; unknown application and loan records are returned as non-disclosing 404s.

## Services and business boundaries

- `src/lib/services/borrower-application.service.ts` creates and versions applications transactionally, locks an application while updating/submitting it, and checks the current effective ACTIVE `LOAN_OFFER_POLICY` for requested principal and term.
- `src/lib/services/borrower-offer-acceptance.service.ts` locks the application and offer, validates ownership, approval, current-version linkage, status, and expiry, and creates the FUNDING loan plus initial status history in one serializable transaction with bounded retry support.
- `repayment-submitrepayment.ts` remains responsible for the financial transaction, allocations, idempotency, and persisted receipt returned after commit.
- `repayment-receipt.ts` remains the source for owner-authorized receipt data. Routes serialize bigint satang amounts as strings for JSON.

## Offer deadline decision

The project had no offer-acceptance service or configured loan funding window. The user selected `LoanOffer.expiresAt` as the new loan's `fundingDeadline`, matching the existing loan fixture convention. Offer acceptance returns the accepted offer and created FUNDING loan references. This decision is isolated in the offer-acceptance service.

## Test coverage

`tests/api/borrower-api.integration.test.ts` includes:

- API-03-01–07: application creation and validation, borrower-only listing and retrieval, draft version update, submitted-version immutability, and submit transition.
- API-03-08–10: issued-offer visibility, valid and expired offer acceptance, and duplicate acceptance prevention.
- API-03-11–13: own-loan list/detail, cross-borrower denial, and persisted schedule retrieval.
- API-03-14–18: service-backed repayment, overpayment rejection with unchanged wallet balance, idempotent duplicate reuse, owner receipt retrieval, and cross-user receipt denial.

The repayment cases create context through the existing repayment integration fixture, then use the real route and repayment/receipt services. The suite creates test identities and hashes their session tokens into the existing Session model; caller-supplied role and user ID metadata is not treated as identity.

## Review against API-01 and API-02 findings

- Success and failure responses use the shared response helpers; errors do not expose SQL, stack traces, or raw database details.
- Route identities and actor IDs come from the validated session. Request bodies do not accept an actor or borrower ID.
- Resource reads are owner-scoped at the Prisma query. The receipt route looks up repayment through the owned loan before generating a receipt.
- Role checks use active session roles through `requireRole`; borrower profile presence is required for borrower endpoints.
- UUIDs and body schemas are validated with Zod; application snapshots are strict and reject unsupported properties.
- Satang values are serialized as strings, avoiding JSON bigint errors and preserving exact integer amounts.
- Application versioning and offer acceptance business rules are in services. The route layer reuses the existing WP6 repayment and receipt services.
- Known repayment business errors are mapped centrally to 422 without returning raw exception details.

## Remaining integration dependencies and limitations

- API-02 found no configured sign-in provider or trusted session issuer. API-03 therefore relies on API-02's session validation; a provider must issue `nexus_session` tokens before frontend users can authenticate.
- Application submission validates against an effective ACTIVE offer policy. If no such policy exists, creation/update return a controlled 503; the API does not invent fallback policy values.
- The schedule route returns an existing schedule only. Schedule creation remains tied to a loan becoming active and disbursed through the existing lifecycle.
- Test fixtures simulate the administrator's approval by setting an application to APPROVED and creating an issued offer; offer issuance and administrator application decisions belong to API-05.

## Verification state

- Reviewed the WP8 API-03 plan, API-01/02 helpers, application/offer/loan schema constraints, existing repayment and receipt services, and the Next.js Route Handler conventions read during API-01.
- Per instruction, no tests, type checks, lint, or builds were run. All results are therefore unverified at runtime.
