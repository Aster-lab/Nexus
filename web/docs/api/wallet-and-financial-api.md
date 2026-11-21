# Wallet and Financial API Behavior

## Amount representation

The currency is THB. Persisted monetary amounts use integer satang (`100 satang = 1 THB`). Request amounts for investment and repayment are decimal-free integer strings. Responses serialize satang as decimal strings; clients should use integer arithmetic/decimal-safe money types and must not parse these values through binary floating point.

## Financial write endpoints

| Operation | Endpoint | Actor | Idempotency |
| --- | --- | --- | --- |
| Investor contribution | `POST /api/investor/investments` | Active investor | Required `Idempotency-Key`; delegates to `postInvestorContribution()`. |
| Borrower repayment | `POST /api/borrower/repayments` | Borrower who owns the loan | Required `Idempotency-Key`; delegates to `submitRepayment()`. |
| Loan disbursement | `POST /api/admin/loans/{loanId}/disburse` | Administrator | Required `Idempotency-Key`; matching posted operation returns its original result. |
| Investor payout | `POST /api/admin/payouts` | Administrator | Required `Idempotency-Key`; delegates to `postInvestorPayout()`. |

All keys are trimmed and limited to 255 characters. Clients should generate a high-entropy unique key for each logical operation and reuse that same key only for retries of that operation. A key collision with a different operation or payload is a conflict. Failed transactions do not count as a successful financial posting; retry behavior follows the relevant service contract.

## Financial integrity boundaries

- Route handlers validate inputs and derive the actor from the session. Existing domain services own eligibility, balances, allocation, posting, and idempotency rules.
- Do not update wallet balances or create ledger entries directly through HTTP routes.
- A successful posting is committed with the linked domain records according to the service's transaction boundary.
- Reconciliation endpoints are read-only. Any correction to posted financial history must follow the compensating-transaction workflow; posted ledger entries remain immutable.
- Investor payout initiation is not available to investor users. It is an administrator/service operation.
- Receipts are generated from persisted repayment records and only returned after the linked ledger transaction is posted.

## Read-only financial APIs

Investor portfolio, investment, payout, and allocation endpoints expose only records scoped to the authenticated investor. Administrator repayment, payout, funding, audit, and reconciliation views require the administrator role. Monetary amounts remain satang strings. See [borrower](borrower-api.md), [investor](investor-api.md), and [administrator](administrator-api.md) endpoint details.

## Representative repayment request

```http
POST /api/borrower/repayments
Idempotency-Key: repay-2026-11-21-<random-value>
Content-Type: application/json
```

```json
{ "loanId": "<loan-uuid>", "amountSatang": "125000" }
```

The result contains a posted ledger transaction reference, persisted repayment rows with principal/interest components, and a receipt breakdown. It does not expose a successful receipt when posting fails.
