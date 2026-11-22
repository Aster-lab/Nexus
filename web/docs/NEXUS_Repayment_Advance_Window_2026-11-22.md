# Repayment Payable Window

**Date:** 2026-11-22  
**Scope:** Borrower repayment eligibility and payable summary

## Decision

Borrowers may repay unpaid installments whose due date falls on or before the same calendar date one month ahead. The cutoff uses a UTC calendar month and clamps to the last day of the target month when necessary (for example, January 31 advances to February 28 or 29).

## Implementation

- Added a shared due-window helper so payable summaries, eligibility checks, repayment submission, and row locking use the same cutoff.
- Included qualifying future installments in the server-calculated payable amount and the authoritative repayment allocation.
- Made the transaction's installment-lock cutoff an explicit SQL `DATE`, matching the `Installment.dueDate` column type. The read-only payable summary used the new cutoff, while the posting path also locks eligible rows before applying allocations.
- Updated the borrower repayment page to explain that the amount includes installments due within the next month.
- Added the borrower's available simulated wallet balance to the repayment summary and frontend validation against that balance, with a link to wallet management when funds need to be added.
- Preserved server response messages when a repayment result is uncertain and mapped known wallet configuration and idempotency failures to explicit API errors.
- Removed a debug log from repayment allocation persistence that printed investor contribution amounts during financial transactions.
- Updated repayment eligibility and payable-summary assertions to use the same rule, including an integration scenario for an installment due within the advance window and one beyond it.

## Verification

- Reviewed all repayment service date filters and the transaction row-lock query for consistent use of the cutoff.
- Tests, lint, typecheck, and build were not run, per the standing instruction not to run them unless requested.

