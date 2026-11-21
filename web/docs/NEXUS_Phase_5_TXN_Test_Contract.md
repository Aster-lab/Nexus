# Phase 5 — TXN Atomicity and Reconciliation Contract

The integration coverage is in `tests/services/transaction-atomicity.integration.test.ts`.
It uses the repayment fixture and checks transaction boundaries against persisted
ledger, wallet, repayment, installment, and investor allocation records.

| ID | Scenario | Contract |
| --- | --- | --- |
| TXN-01 | Ledger posting fails during repayment submission | A failure after the transfer helper has written inside the transaction leaves no repayment ledger header, entries, installment movement, allocation, or wallet movement. |
| TXN-02 | Repayment persistence fails after ledger posting | A failure after the repayment row is inserted rolls back the repayment and all earlier ledger and wallet writes. |
| TXN-03 | Allocation persistence fails | The allocation database failure rolls back ledger posting, repayment, installment, and wallet changes. |
| TXN-04 | Correct a posted financial transaction | A new posted transaction reverses the original entries and wallet effects; the original transaction and entries remain unchanged. Business-linked transactions require their domain correction workflow. |
| TXN-05 | Ledger and wallet reconciliation | The reconciliation report checks per-currency posted transaction balances and derives wallet projections from posted ledger entries. |
| TXN-06 | Repayment and allocation reconciliation | Repayment component totals, installment paid totals, payout allocation totals, and linked ledger amounts are checked together. |
| TXN-07 | Full repayment reconciliation | A fully due schedule is settled and checked across posted entries, wallets, repayments, installments, allocations, and the reconciliation report. |

`financial-reconciliation.service.ts` returns a report with issue codes rather
than stopping at the first mismatch. Its database reads use a repeatable-read
transaction to avoid mixed snapshots during concurrent posting.

Tests were implemented and statically reviewed. They were not executed, as
requested.
