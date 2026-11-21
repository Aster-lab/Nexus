# NEXUS Phase 5 RCP Test Contract

**Scope:** Repayment receipt generation and verification  
**State:** Receipt service implemented and focused tests pass  
**Verification:** RCP integration test file: 7 passed; TypeScript check has unrelated generated route errors

## Receipt contract proposed by the RCP tests

A successful `submitRepayment()` result includes a receipt only after its ledger transaction is posted and the transaction commits. The receipt is a response object derived from the persisted ledger and repayment rows; the current schema has no separate receipt table.

The receipt exposes:

- `receiptId`, `loanId`, and `ledgerTransactionId` references.
- `status: "POSTED"`, a receipt timestamp, and total received satang.
- One detail item per persisted repayment row, with repayment and installment references, installment number, principal, interest, total, and remaining installment balance.
- A list of the repayment row IDs represented by the receipt.

The tests require amounts and installment balances to match committed records. They also require a failed posting to reject without creating ledger or repayment rows or returning a completed receipt.

`src/lib/services/repayment/repayment-receipt.ts` now builds this response from a committed `POSTED` borrower repayment transaction. `submitRepayment()` calls it after the serializable posting transaction resolves, including on an idempotent retry. Receipt generation validates the ledger entry totals, repayment status, loan/transaction links, and installment remaining balance before returning a receipt.

## Test coverage

`tests/services/repayment-receipt.integration.test.ts` covers RCP-01 through RCP-07 using the normal funding and disbursement lifecycle fixture. The tests assert receipt timestamps against the posted ledger timestamp, compare multi-installment receipt rows with persisted repayment rows, and verify remaining balances from the persisted installment projection.

The focused RCP file passed all seven tests. `npx tsc --noEmit --pretty false` reported only existing generated route errors in `.next/types/validator.ts` for `src/app/marketplace/page.ts`.
