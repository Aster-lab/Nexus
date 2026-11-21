# NEXUS WP10.2 — Cross-Role API Journey

**Date:** 2026-11-21  
**Status:** Test authored; runtime verification not performed.  
**Related test:** `tests/api/system-journey.integration.test.ts`

## Scope

Added a single database-backed system journey that exercises existing authenticated API handlers across borrower, investor, and administrator roles. The journey reuses `createRepaymentAllocationLifecycleContext(2)`, which creates two investor contributions through the funding service, confirms funding, performs the WP5 disbursement workflow, and generates a payable schedule.

The scenario then:

1. Authenticates the borrower, both investors, and administrator using persisted test sessions.
2. Reads the borrower's schedule and backend-calculated payable amount.
3. Submits a repayment through the borrower API with an idempotency key.
4. Confirms repayment rows and ledger entries persisted as posted, component totals reconcile, and the borrower's wallet was debited once.
5. Retrieves the receipt and repayment history through borrower endpoints and checks them against the persisted transaction.
6. Reads each investor's source allocations and balances.
7. Processes the resulting allocations through the administrator payout API.
8. Confirms investor wallet credit deltas match completed payout totals and installment state reflects the posted repayment.
9. Calls the administrator reconciliation API and expects a valid report.

## Requirements represented

This scenario contributes coverage to the borrower, investor, administrator, and financial consistency groups from the WP10 system test plan. It verifies API-level behavior using the application's route handlers and local test database. It does not claim browser-level UX, service orchestration, or deployment/staging coverage.

## Review notes

- The test uses the existing realistic funding and disbursement fixture rather than fabricating a funded loan state.
- Financial amounts and references are asserted against committed rows and ledger state; no frontend calculations are introduced.
- The fixture uses unique financial records and idempotency keys. It restores shared operational account statuses and removes temporary sessions; as with existing ledger integration tests, immutable posted financial history is retained in the test database.
- The reconciliation expectation is platform-wide, so pre-existing test-database inconsistencies will be surfaced by this test instead of hidden.
- Prediction is intentionally excluded from this successful financial journey; the MVP prediction capability remains unavailable pending approved NEXUS THB training data.

## Validation boundary and next work

The new test file was reviewed against the route response shapes and the existing lifecycle fixture. **It was not executed, and no other tests were run.** This follows the instruction to wait for a specific request before running the test file.

Next WP10 work is to execute this correlated test against `nexus_test` when authorized, address any failures, then add journey coverage for application submission/offer decision/acceptance and investor funding through authenticated APIs. Cross-role browser verification and reproducible multi-service startup remain separate open work.
