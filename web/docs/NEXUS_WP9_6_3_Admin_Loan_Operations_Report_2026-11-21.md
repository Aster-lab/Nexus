# NEXUS WP9.6.3 Loan Operations Report

Date: 2026-11-21

## Delivered

- Added `/admin/loans` with backend-supported loan status filters, sorting, pagination, borrower reference, principal/funded totals, term, and funding deadline.
- Added `/admin/loans/[loanId]` with the persisted loan summary, borrower identity, status history, funding/escrow events, and repayment rows filtered by loan. Repayment rows include installment state and the linked ledger status returned by WP8.
- Added a disbursement action only when the returned loan status is `FUNDED`. It requires a reason and confirmation, uses the existing `/api/admin/loans/:loanId/disburse` route with an idempotency key, displays the confirmed ledger reference, and refreshes persisted summaries after success. It never writes wallet or ledger records directly.
- Loan summary, funding, and repayment activity have separate loading/error states.

## API boundaries

- Loan and funding information comes from the existing administrator GET endpoints.
- Repayment activity uses `GET /api/admin/repayments?loanId=...`; the API does not expose a separate full schedule endpoint, so the page labels this persisted repayment/installment activity rather than presenting a re-created schedule.
- Disbursement eligibility and posting remain authoritative in the WP5 backend service.

## Verification

- Passed correlated loan client/component checks: 2 files, 4 tests.
- The database-backed admin integration check remains unverified because the guarded local test run could not connect to `127.0.0.1:5432` in the sandbox, and the elevated attempt was rejected by automatic approval review. No retry path was used.
