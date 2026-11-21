# WP9.4.7 — Repayment History and Receipt Retrieval

**Date:** 2026-11-21  
**Status:** Implemented; source reviewed. Tests and runtime commands were not run, per instruction.

## Scope delivered

Borrowers now have a paginated repayment history at `/borrower/repayments` and a receipt page at `/borrower/repayments/{repaymentId}/receipt`. The history shows repayment and loan references, date, total/principal/interest amounts, status, and receipt availability. The receipt page presents borrower, loan, repayment and transaction references, timestamp, persisted amount breakdown, and installment allocation rows.

Both pages use the existing Tailwind and shadcn UI components and provide responsive layouts, loading, empty, error, retry, and unavailable states. Receipt links are offered only when the repayment and linked ledger transaction are posted. Receipt content is shown only after the existing receipt retrieval request succeeds.

## API and financial data decisions

- History uses the existing `GET /api/borrower/repayments` endpoint and its supported page/limit/sort parameters.
- The endpoint does not support loan or status filters; no client-only filters were added that could misrepresent a page of server-paginated results.
- Receipt retrieval remains `GET /api/borrower/repayments/{repaymentId}/receipt`, backed by `generateRepaymentReceipt()`.
- No receipt database model or frontend-specific receipt API was introduced. The receipt is assembled from persisted repayments, the borrower profile, installments, and the linked posted ledger transaction.
- The existing receipt service now includes borrower legal name, repayment date, and aggregate principal and interest satang totals. The route serializes date and bigint amounts for JSON.
- Financial values displayed by React come from the API response. The UI does not calculate repayment allocation or totals.
- Receipt access remains scoped to the authenticated borrower’s own loan. Invalid and non-owned repayment references are not disclosed.

## Tests authored or updated

- API integration coverage for receipt identity and persisted totals/breakdown, invalid repayment reference, and cross-borrower denial (`REC-FE-04` through `REC-FE-07`).
- Client coverage for receipt route construction, response preservation, and posted-only receipt availability.
- Component coverage for accessible history/receipt loading states (`REC-FE-01/08`).
- Existing borrower repayment API history coverage is reused for the history data contract.
- The WP9.4.6 repayment client tests now also cover the paginated history path and loader.

## Review notes and limits

- The API history response is paginated and sorted, so the UI uses server pagination and does not locally filter incomplete pages.
- A submission that produces multiple repayment rows still links each row to the shared ledger transaction; the receipt service includes every row associated with that transaction.
- The borrower name comes from the related borrower profile; deployments should ensure that profile legal name is populated as required by the existing application data contract.
- API documentation now records the supported history query parameters, lack of loan/status filters, receipt assembly source, and receipt response fields.

## Validation

Source review only. No tests, test files, typecheck, lint, or build commands were executed. Run the focused component, client, and borrower API integration tests when explicitly requested.
