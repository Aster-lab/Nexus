# Phase 5 — IDE Test Contract

## Repayment idempotency and concurrency

This contract records the integration coverage added to
`tests/services/repayment-submission.integration.test.ts`. It exercises the
public repayment submission service against the database and wallet ledger.

| ID | Scenario | Assertions |
| --- | --- | --- |
| IDE-01 | Sequential duplicate request | Both results match; one transaction, repayment set, allocation set, wallet debit, and installment update persist. |
| IDE-02 | Concurrent duplicate request | Both calls resolve to the same result and only one financial posting and allocation set persist. |
| IDE-03 | Same key, different amount | The second call rejects and the original persisted state is unchanged. |
| IDE-04 | Same key, different loan | The second call rejects and neither the original posting nor the other loan's state changes. |
| IDE-05 | Concurrent independent requests | Both postings persist; combined wallet and installment movements reconcile with the repayment records and allocations. |
| IDE-06 | Concurrent requests above outstanding | Exactly one request succeeds; no transaction is persisted for the rejected key and the remaining obligations reconcile. |
| IDE-07 | Failed request then valid retry | An overpayment rejection leaves no state behind; a valid request can then use the same key and post once. |

The IDE tests are written but were not run, per the requested test execution
constraint. The corresponding `REP-15` through `REP-17` checks remain in place
as earlier general idempotency and serialization coverage.

## Review improvements

After the submission and receipt services were implemented, the IDE assertions
were strengthened to compare exact installment component movements, posted
ledger entries, committed repayment rows, wallet balances, and allocation
reconciliation. Receipt failure coverage now also verifies that a rejected
posting leaves repayments, allocations, installments, and wallet balances
unchanged.
