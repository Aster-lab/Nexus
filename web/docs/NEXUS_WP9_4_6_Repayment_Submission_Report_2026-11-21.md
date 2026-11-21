# WP9.4.6 — Repayment Submission

Date: 2026-11-21

## Scope completed

Added the borrower repayment screen at `/borrower/loans/{loanId}/repay`, linked from eligible loan details. The screen consumes the existing payable, loan, schedule, wallet, repayment history, and submission APIs.

## Form and validation

- Shows selected loan, total outstanding obligation, backend payable amount, due installment count, overdue count, installment balances, and current wallet balance when available.
- Parses user-entered THB into satang exactly, accepts no more than two decimal places, requires a positive amount, and rejects amounts above the currently payable value.
- Uses backend payable data to disable early repayment when no installment is currently payable. The server remains authoritative for every rule and the actual installment allocation.
- Confirmation summarizes the amount, payable limit, and affected installment set; the UI explains that the backend determines final allocation.
- Prevents repeated submission with a synchronous per-loan in-flight guard and disabled controls.

## Posting, idempotency and uncertain results

- Uses the documented POST body `{ loanId, amountSatang }` and the shared API client's supported `idempotencyKey` option, which sends the existing `Idempotency-Key` header. No new request field/header was introduced.
- The same key and amount are kept in session storage while a request outcome is uncertain. A timeout/network/server error displays an uncertain state and requires checking history before offering a same-key retry.
- The submission request is aborted client-side after 30 seconds; that timeout is treated as uncertain because aborting the browser request cannot prove the server transaction rolled back.
- History check displays recent records for the selected loan and refreshes loan, payable, schedule, and wallet data. It does not claim that a matching record proves the uncertain request succeeded.
- While a request is uncertain, the amount field and normal submission path remain disabled until the borrower checks history; any retry uses the exact saved amount and idempotency key.
- Success is shown only after the backend response includes a POSTED receipt and ledger transaction reference.
- After success, refreshes loan details, payable summary, schedule, wallet, and repayment history, and emits the borrower dashboard refresh event.
- Displays persisted receipt breakdown and opens the existing borrower receipt API for a repayment ID.

## Authorization handling

- Added error mapping for a repayment attempt against a loan owned by another borrower, returning 403 FORBIDDEN rather than a generic 500. Missing loans return 404.
- The existing payable, loan, schedule, wallet, history, submission, and receipt APIs remain borrower-scoped.

## Tests authored

- Added `tests/lib/client/borrower-repayments.test.ts` for amount validation, payable/history API paths, use of the supported idempotency option, uncertain outcomes, and in-flight duplicate prevention.
- Added `tests/components/borrower-repayments.test.tsx` for accessible initial loading markup.
- Extended `tests/api/borrower-api.integration.test.ts` with REP-FE-15 ownership rejection and no-posting/balance-change assertions. Existing integration cases cover payable amount, successful submission, overpayment rejection, idempotent retry, receipt persistence, and receipt ownership.
- Tests were not run, per instruction.

## Decisions and boundaries

- Current payable amount comes from `GET /api/borrower/loans/{loanId}/payable`; the page does not independently compute it from the schedule.
- Installment schedule values/statuses are rendered from the backend API. Frontend validation is convenience only.
- Repayment history is fetched for uncertainty review and refreshed after success; the dedicated history/receipt browsing stage remains WP9.4.7.
- If a successful posting cannot refresh related data, the UI preserves the confirmed success and warns that some refreshed information may be stale.

## Validation status

Source review only. No tests, typecheck, lint, build, or application code was executed in this stage. The focused tests are ready for an explicitly requested run.
