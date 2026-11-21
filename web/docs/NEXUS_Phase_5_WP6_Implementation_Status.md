# NEXUS Phase 5 WP6 Implementation Status

**Date:** 20 November 2026  
**Scope:** Repayment collection and its allocation-persistence continuation  
**Currency:** THB, integer satang

## Implemented

- Added `repayment-allocation-persistence.ts` to load eligible investments and their posted contribution amounts, calculate principal and interest independently with proportional largest-remainder rounding, and write auditable allocation rows on the caller's transaction.
- Repayment submission calls that persistence helper inside the same transaction as the ledger transfer, repayment records, and installment updates. Investor payout records are still not created and investor wallets are not credited during collection.
- Replaced the allocation test's direct loan status/funding/disbursement mutations with a dedicated lifecycle fixture. It funds investors, posts contributions through `postInvestorContribution()`, checks the loan reaches fully funded status, requests and approves disbursement, posts via `postLoanDisbursement()`, then creates a repayment schedule and confirms a due installment.
- The WP5 service in this repository is named `postLoanDisbursement()`; there is no `disburseLoan()` export.
- Repayment completion updates the loan to `REPAID` and records `LoanStatusHistory` in that same transaction when the current schedule has no unpaid installments.
- Allocation persistence integration coverage includes one and multiple investors, inactive-investment exclusion, component reconciliation, deterministic row ordering, and the requirement that collection does not create investor payouts or credit investor wallets.
- `ALLOC-07` now induces an actual database failure by exceeding the allocation method column length, then checks that repayment, ledger, allocation, installment, and wallet changes all rolled back.
- Repayment submission coverage adds identical-key retry, conflicting-amount key reuse, concurrent full-outstanding submissions, and final schedule completion assertions.

## Verification

- Attempted only the focused repayment submission test and the focused allocation persistence test, using the project's guarded `npm run test` command. Both stop in the `pretest` database-identity check before Vitest starts. Node 26 fails in `os.userInfo()` with `uv_os_get_passwd returned ENOMEM`.
- `npx tsc --noEmit --pretty false` reports no errors in the changed repayment service or allocation test. It still fails on the existing generated `.next/types/validator.ts` references to `src/app/marketplace/page.ts` (not a module) and the resulting invalid route parameter type.
- No other test files were run. The database rollback and concurrency assertions remain unverified at runtime until the guarded test precheck can execute.

## Status

Implementation and focused test cases are in place, but WP6 is **not yet verified complete**. Re-run the two focused test files after resolving the Node `os.userInfo()` environment failure, then address the unrelated generated route type errors before claiming the wider project verification gate is clean.

The schema has no separate receipt model. The posted `Repayment` rows (`receivedAt`) linked to a posted ledger transaction remain the persisted repayment receipt evidence.
