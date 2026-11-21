# NEXUS Phase 5 WP8 — API-05 Administrator APIs

**Date:** 21 November 2026  
**Scope:** Administrator application review, loan oversight, disbursement, repayment monitoring, payout processing, reconciliation, audit history, and user administration

## Summary

API-05 adds the administrator API surface defined in the WP8 implementation plan. Every endpoint authenticates through the API-02 session helper and requires the persisted `ADMIN` role. Financial operations call existing WP5/WP7 services; reconciliation and audit retrieval are read-only. The only new workflow service is the missing administrator final-decision service for loan applications.

The API-05 integration suite was authored before the route and service implementations in `tests/api/admin-api.integration.test.ts`, with scenarios API-05-01 through API-05-17. **No tests or test files, typecheck, lint, or build were run**. The results below describe the source implementation and review only, not successful runtime verification.

## Endpoints implemented

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/admin/applications` | Paginated applications; optional status filter; current submitted terms are returned with satang serialized as strings. |
| GET | `/api/admin/applications/[applicationId]` | Application, borrower identity, current version, review history, and information requests. |
| POST | `/api/admin/applications/[applicationId]/decision` | Final `APPROVED` or `REJECTED` decision, persisted review, application transition, and audit event. |
| GET | `/api/admin/loans` | Paginated loans; optional status filter; persisted terms and borrower identity. |
| GET | `/api/admin/loans/[loanId]` | Loan detail, borrower, escrow summary, and status history. |
| GET | `/api/admin/loans/[loanId]/funding` | Funding progress and escrow deposit/disbursement/refund history with ledger references. |
| POST | `/api/admin/loans/[loanId]/disburse` | Requires an idempotency key; invokes disbursement request, approval, and posting services. Matching duplicate keys return the original posted transaction. |
| GET | `/api/admin/repayments` | Paginated repayment records with installment, allocation, and ledger status information. |
| GET, POST | `/api/admin/payouts` | Paginated payout history; POST invokes the WP7 `postInvestorPayout()` service. |
| GET | `/api/admin/reconciliation` | Combines financial-state and investor-payout reconciliation reports; performs no repair. |
| GET | `/api/admin/audit-logs` | Paginated immutable audit history with actor/action/target filters. |
| GET | `/api/admin/users` | Paginated user administration view with active roles and borrower/investor profiles. |
| PATCH | `/api/admin/users/[userId]` | Changes account status and writes an audit event. Role fields are rejected; self-restriction is blocked. |

## Implementation decisions

- **Administrator identity:** `requireAdministrator()` derives identity from the validated session and checks the persisted `ADMIN` role. Financial services also independently validate the administrator actor before posting or reconciliation.
- **Application review:** `administrator-application-review.service.ts` locks the application, requires a submitted current version and a `SUBMITTED` or `UNDER_REVIEW` state, then writes an `ApplicationReview`, updates status, and appends an audit event in one serializable transaction. Repeated decisions against a final state are rejected.
- **Disbursement:** The route requires a reason and `Idempotency-Key`. It calls `requestLoanDisbursement()`, `approveLoanDisbursement()`, and `postLoanDisbursement()` in order. A matching posted transaction is replayed; reusing a key for another loan or operation returns an idempotency conflict. The existing workflow does not enforce distinct requester and approver identities, so this endpoint uses the authenticated administrator for both steps.
- **Payout:** POST delegates to `postInvestorPayout()` and returns its persisted payout and ledger references. No wallet, payout, or ledger rows are edited directly by the handler.
- **Reconciliation:** The endpoint composes `reconcileFinancialState()` and `reconcileInvestorPayouts()`. Their issue lists are combined, and payout clearing balances are serialized as decimal strings. No repair path is exposed.
- **Audit history:** GET reads persisted audit rows only. New application decisions and account-status updates record the acting administrator, target, old/new status, reason, and timestamp through the existing audit model.
- **User administration:** The PATCH schema is strict and only accepts `accountStatus`. It cannot grant or revoke roles; unknown fields such as `role` fail validation before any database write.
- **Errors:** Added API error mappings for application review and disbursement lifecycle conflicts, plus safe payout business-rule errors. Internal database or implementation details are not returned.

## Files added or changed

- `tests/api/admin-api.integration.test.ts`
- `src/lib/api/administrator.ts`
- `src/lib/services/administrator-application-review.service.ts`
- `src/app/api/admin/applications/route.ts`
- `src/app/api/admin/applications/[applicationId]/route.ts`
- `src/app/api/admin/applications/[applicationId]/decision/route.ts`
- `src/app/api/admin/loans/route.ts`
- `src/app/api/admin/loans/[loanId]/route.ts`
- `src/app/api/admin/loans/[loanId]/funding/route.ts`
- `src/app/api/admin/loans/[loanId]/disburse/route.ts`
- `src/app/api/admin/repayments/route.ts`
- `src/app/api/admin/payouts/route.ts`
- `src/app/api/admin/reconciliation/route.ts`
- `src/app/api/admin/audit-logs/route.ts`
- `src/app/api/admin/users/route.ts`
- `src/app/api/admin/users/[userId]/route.ts`
- `src/lib/api/errors.ts`

## Test coverage authored

The integration suite covers administrator application list/detail/approval/rejection/invalid decision; loan list/funding details; eligible, ineligible, and duplicate disbursement; repayment monitoring; successful and duplicate payout; reconciliation; audit retrieval; non-administrator denial; and rejection of role escalation.

The fixtures create submitted applications and funded-loan contexts directly through persisted records and existing financial services. Payout tests use the existing repayment-allocation lifecycle fixture, then exercise the real repayment and payout services.

## Verification status and limitations

- Tests were not run, following the standing instruction. Test assertions, fixtures, route invocation, generated Prisma types, and transaction behavior therefore remain unverified by execution.
- Typecheck, lint, and Next.js build were also not run.
- The plan specifies one disbursement endpoint while the service layer exposes request, approval, and posting as separate operations. The route composes all three under the authenticated administrator because no distinct-actor requirement is enforced by the current services. Add a separate request/approval API if governance later requires separation of duties.
- User management is intentionally limited to account status. Role administration is not implemented through this route; role escalation requests are rejected.

## Completion

The API-05 endpoint surface and 17-scenario integration suite have been implemented and reviewed against the WP8 plan and current services. Execution verification remains pending.
