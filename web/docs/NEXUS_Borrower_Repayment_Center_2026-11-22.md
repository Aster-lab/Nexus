# NEXUS Borrower Repayment Center

**Date:** 2026-11-22  
**Status:** Implemented in source; verification not run.

## Change

Borrowers can open a dedicated **Make a repayment** page from the dashboard or repayment history. The page lists the borrower's active loans with the outstanding obligation, next installment date, number of payable installments, and the current payable amount returned by the backend.

The page links to the existing per-loan repayment form only when the backend reports a positive payable amount. For a loan with no payable amount, it explains that nothing is payable yet and links to the schedule. If a loan's payable request fails, the page shows an error for that loan without suppressing the other loans.

The existing loan-specific form remains the authoritative confirmation and submission flow. It still validates against the backend payable amount, uses the supported idempotency behavior, and handles uncertain outcomes. The repayment-history and receipt routes remain separate and unchanged.

## Financial safety

- The page uses the borrower-scoped dashboard and payable APIs; it does not infer ownership from user input.
- It does not calculate installment or payable values in the frontend.
- It does not post a repayment when the page is opened.
- A successful repayment still requires backend confirmation from the existing submission API.

## Verification

Source and route wiring were reviewed. Tests, lint, typecheck, build, browser, and database checks were not run.
