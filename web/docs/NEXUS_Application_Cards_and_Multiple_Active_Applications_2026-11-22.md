# NEXUS Application List and Responsive Data Views

**Date:** 2026-11-22  
**Decision:** Borrowers may have more than one active application at a time.  
**Scope:** Application submission rule and responsive presentation of wide data tables.

## Application workflow decision

The previous database migration created a partial unique index that limited each borrower to one application in `SUBMITTED`, `UNDER_REVIEW`, `INFORMATION_REQUESTED`, or `APPROVED` status. A second submission therefore failed with a generic conflict, including when the first application had already been approved.

The product decision is to allow multiple active applications. Each application retains its own status, review history, versioning, and offer lifecycle. The submission service still locks and validates the individual application being submitted; it no longer serializes submissions at the borrower level.

Migration `20261122150000_allow_multiple_active_borrower_applications` drops the partial unique index. Existing applications and their statuses are not changed. The migration must be applied to each target database before multiple active submissions work there. Until it is deployed, the old database constraint will continue to reject the second active application.

The API integration suite now includes a correlated scenario that submits one application, advances it to `APPROVED`, then submits a second application and checks that both statuses persist. Per the current instruction, this test has not been run.

## Responsive data views

Dense tables in the shared borrower, investor, and administrator shell now switch to labeled record cards at viewports up to 90rem. This removes the horizontal table scrollbar on laptop, tablet, and phone widths while keeping field labels and row actions visible. Header text is associated with each cell for the card presentation, and table accessibility roles are retained.

The responsive behavior is implemented centrally so the existing table-backed screens receive the same treatment. The policy version page already uses responsive version cards. No browser viewport check has been run; staging verification should cover the borrower application list and representative investor/admin tables at phone, tablet, and desktop widths.

## Wallet funding clarification

**Superseded by the later simulated top-up decision and implementation in `NEXUS_Simulated_Wallet_TopUps_and_Recommendation_Fix_2026-11-22.md`.** Borrowers and investors can now request ledger-backed simulated top-ups of up to THB 50,000 per request, with later top-ups allowed. Administrators can still assign initial simulated balances through the opening-balance workflow. Neither action connects to a bank or payment rail or represents real funds received. Borrowers can also receive simulated loan disbursements; investors can receive completed repayment payouts.

## Verification status

- Source and migration were reviewed; whitespace/diff checks only.
- No tests, lint, typecheck, build, or browser session were run.
- Deploy the migration before validating the multiple-active-application behavior in staging.
