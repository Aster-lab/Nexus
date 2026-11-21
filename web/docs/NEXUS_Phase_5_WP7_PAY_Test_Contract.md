# NEXUS Phase 5 WP7 Investor Payout Contract

## Scope

WP7 posts investor payments from immutable `PayoutAllocation` records. Each payout debits the active THB Repayment Clearing wallet (platform account 2300), credits the owning investor's active THB wallet, and records a completed `InvestorPayout` linked to a posted ledger transaction. Processing is atomic and serialized. Completed payouts cannot be edited or deleted; corrections require compensating financial records.

## PAY test scenarios

| ID | Scenario | Expected behavior |
| --- | --- | --- |
| PAY-01 | Valid pending allocation | One completed payout and balanced posted transfer for allocation principal plus interest. |
| PAY-02 | Allocation already paid with a different key | Reject duplicate without changing payout, ledger, or wallet state. |
| PAY-03 | Repayment or repayment ledger not posted | Reject eligibility. Schema triggers make this persisted state invalid, so the service's pure guard is checked directly. |
| PAY-04 | Investor wallet is non-active (`CLOSED`) | Reject before financial writes. |
| PAY-05 | Investor wallet currency is not THB | Reject before financial writes. The database enforces THB-only wallet currency, so the integration case exercises the service's currency guard directly rather than persisting an invalid wallet. |
| PAY-06 | Clearing wallet is non-active or underfunded | Reject; the balance guard is tested separately because the wallet ledger trigger prevents constructing a stale underfunded projection. |
| PAY-07 | Principal-only allocation | Transfer principal exactly. |
| PAY-08 | Interest-only allocation | Transfer interest exactly. |
| PAY-09 | Principal and interest allocation | Transfer the combined amount. |
| PAY-10 | Multiple investors share one repayment | Pay each investor the exact persisted allocation. |
| PAY-11 | One investor has allocations across repayments | Pay each allocation once, retaining distinct payout and ledger references. |
| PAY-12 | Zero-value allocation | Keep it unpaid and identifiable; create no payout or financial transfer. A payout attempt is rejected. |
| PAY-13 | Sequential duplicate with same key | Return the original result without a second credit. |
| PAY-14 | Concurrent duplicate with same key | Resolve to one payout and one transfer. |
| PAY-15 | Same key, different allocation | Reject the idempotency conflict. |
| PAY-16 | Concurrent payouts for different investors | Both succeed with no lost wallet updates. |
| PAY-17 | Concurrent payouts exceed available clearing funds | Recheck after wallet locking; no overdraft, and only the affordable payout succeeds. |
| PAY-18 | Ledger persistence failure | A database trigger failure after ledger posting rolls back payout and wallet changes. |
| PAY-19 | InvestorPayout persistence failure | A real foreign-key failure after transfer posting rolls back ledger and wallet writes. |
| PAY-20 | Payout completion update failure | A real database constraint failure rolls back the complete transaction. |
| PAY-21 | Retry after a failed transaction | The same idempotency key succeeds once after the failed attempt rolled back. |
| PAY-22 | Successful payout lifecycle | Persist the schema-supported `COMPLETED` status. |
| PAY-23 | Invalid transition from completed | Reject the transition and preserve the completed row. |
| PAY-24 | Direct edit or deletion of completed payout | Reject both operations; the added database trigger enforces immutability. |
| PAY-25 | Borrower attempts payout | Reject the unauthorized request without financial effects. |
| PAY-26 | Authorized administrator initiates payout | Allow the operation. |
| PAY-27 | Successful payout audit | Record actor, allocation, investor payout, ledger transaction, amount, success outcome, and timestamp. |

Every successful payout test checks the correct investor and clearing wallet movements, a posted ledger transaction with two balanced entries, payout references and amount, and unchanged allocation history. Tests also check that unrelated wallets remain unchanged where applicable.

## REC reconciliation scenarios

| ID | Scenario | Expected behavior |
| --- | --- | --- |
| REC-01 | Completed payout ledger verification | Every completed payout links to a posted transaction with clearing debit and investor credit. |
| REC-02 | Investor wallet reconciliation | Wallet projections equal balances derived from posted ledger entries. |
| REC-03 | Repayment Clearing reconciliation | A payout reduces clearing by its allocation amount; the report reconciles the wallet to all posted ledger movements and separately reports collection, payout, and other posted movement totals. |
| REC-04 | Allocation-to-payout reconciliation | Completed payout principal and interest equal their source allocation. |
| REC-05 | Pending allocation reconciliation | Allocations without completed payouts remain listed as unpaid. |
| REC-06 | Full payout reconciliation | Report ledger, payout, allocation, and wallet consistency without changing financial records. |

Reconciliation is administrator-only and read-only. It returns issue codes and unpaid allocation identifiers; it never modifies financial records. Clearing may have valid posted adjustments and historical transfers in addition to borrower collections and investor payouts. The reported clearing equation therefore includes all such posted movements and surfaces the other movement total, while the REC-03 scenario asserts that its payout debit reduces clearing by the exact payout amount.

## Implementation decisions

- `InvestorPayoutStatus` supports `PENDING`, `PROCESSING`, `COMPLETED`, and `FAILED`; tests do not introduce unsupported states. `WalletStatus` supports `ACTIVE`, `RESTRICTED`, and `CLOSED`; `CLOSED` represents the non-active wallet cases.
- Payout amount is allocation principal plus interest. Recovery allocations are rejected until a recovery payout representation is defined.
- A zero-value allocation remains in immutable allocation history but is not paid and does not create a payout record or ledger transfer.
- Repeating the same allocation with the same idempotency key returns the original completed result. A different key for an already paid allocation is rejected. Reusing a key for another allocation is an idempotency conflict.
- Payout, ledger, wallet, audit, and payout status changes share one serializable transaction with bounded retry handling.
- Database constraints make a persisted repayment with a non-POSTED status or ledger link invalid. PAY-03 therefore exercises the exact pure guard used by the service instead of disabling integrity triggers to create corrupt state.
- Wallet and platform account currencies are constrained to THB by the database. PAY-05 exercises the same pure guard used by the payout service with an invalid candidate currency instead of attempting an invalid database update.
- The clearing wallet's cached balance is checked against its ledger projection. PAY-06 tests the insufficient-balance guard directly because database triggers prevent creating a stale underfunded wallet balance.
- The added migration protects completed payout rows from update and delete. Corrections require compensating financial activity.

## Artifacts

- Service: `src/lib/services/investor-payout.service.ts`
- Read-only reconciliation service: `src/lib/services/investor-payout-reconciliation.service.ts`
- Integration suite: `tests/services/investor-payout.integration.test.ts`
- Append-only completion rule: `prisma/migrations/20261120100000_wp7_completed_investor_payout_immutable/migration.sql`

The PAY and REC test cases were written and statically reviewed. They were not run, per the requested workflow.
