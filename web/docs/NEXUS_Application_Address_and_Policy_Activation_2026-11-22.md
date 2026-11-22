# NEXUS Application Address Inputs and Policy Activation

**Date:** 2026-11-22
**Scope:** Borrower application entry, onboarding-tour behavior, and administrator policy activation.

## Borrower application inputs

- Province, district, subdistrict, and postal code use cascading dropdowns from the bundled `@geothai/core` Thailand address dataset.
- The selections are stored using the English names and postal-code fields expected by the existing application snapshot API. The dropdown selection codes are not sent as new API fields.
- Purpose is a dropdown matching the existing supported values: `business`, `education`, `medical`, `personal`, `home`, and `other`.
- Province, district, subdistrict, and postal code remain optional because the current backend contract treats these address details as optional. Address line 1 remains required.
- Saved legacy address or purpose values are preserved as selectable “Previously saved” entries so opening an old draft does not erase data. Changing an upstream geographic selection clears dependent fields.
- Province/district/subdistrict choices show English and Thai names. Postal code is selected from the subdistrict’s supported codes; a single code is selected automatically.

## Administrator policy approval and activation

The application-policy error occurred because the seeded `LOAN_OFFER_POLICY` version is `PROPOSED`; borrower application creation requires an effective `ACTIVE` version. Seed behavior remains unchanged, so a database seed cannot silently grant itself production authority.

The administrator workspace now includes **Policies** (`/admin/policies`) and authenticated API routes to list versions and approve or activate one. A version moves through `PROPOSED → APPROVED → ACTIVE`. Approval alone does not make it effective. Activating a version supersedes the former active version for that policy in the same transaction and records the action in append-only audit history. The schema already had the required status, approver, and effective-time fields; no migration was needed.

Before the borrower flow is available, an administrator must approve and activate the seeded loan-offer policy. Activate the loan-interest and repayment policy versions with matching annual rates; the current repayment contract fixes the MVP rate at 12%. The admin page exposes the values for review and asks for confirmation before activation.

## First-sign-in tours

Borrower, investor, and administrator tours automatically open until the user finishes them. The administrator tour covers operational metrics, policy governance, applications, loans/disbursement, repayments, payouts, reconciliation, and user/audit oversight. Pausing saves incomplete progress and resumes from that step on a later visit. Completion is stored in browser local storage per account and role; completed tours do not auto-open again, but can be replayed with **Take the tour**. Clearing browser storage or using another browser/device causes the first-visit tour to appear again.

The policy page uses responsive version cards instead of a wide table, keeping the status, dates, review values, and approval action readable without a horizontal scroller on narrow screens.

## Verification status

- Reviewed route authorization, policy state transitions, existing schema fields, and supported application snapshot fields.
- No tests, lint, or build were run for this subphase, per the current workflow instruction.
- Operator verification remains: sign in as an administrator, approve and activate the required staging policy versions, then create a borrower draft and verify no policy-unavailable response appears.
