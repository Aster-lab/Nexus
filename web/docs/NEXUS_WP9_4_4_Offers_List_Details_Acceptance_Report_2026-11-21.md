# WP9.4.4 — Offers List, Details and Acceptance

Date: 2026-11-21

## Scope completed

Implemented the borrower offers list and detail routes, display of persisted offer terms and platform-fee policy, and a confirmation-based acceptance flow using the existing transactional offer-acceptance service.

## API behavior

- `GET /api/borrower/offers` is now borrower-scoped and returns the borrower's persisted offer history, including issued, accepted, expired, declined, and cancelled records. It retains pagination and supported sorting.
- List rows contain offer/application references, principal, annual rate, term, repayment frequency, status, acceptance/creation timestamps, expiration, `isExpired`, and server-computed `permissions.canAccept`.
- Added `GET /api/borrower/offers/{offerId}`. It returns a non-disclosing 404 for offers belonging to another borrower and provides full stored terms, loan linkage if accepted, active interest calculation terms, and active platform-fee disclosure terms.
- Acceptance eligibility is computed from offer state, expiry, approved application state, current application version, and absence of an associated loan. The existing acceptance service remains authoritative and rechecks all conditions under row locks and a serializable transaction.
- Fee percentage and terms come from the active platform-fee policy. No fee amount or repayment amount is independently estimated by the frontend.

## Frontend behavior

- Added `/borrower/offers` with responsive offer cards, pagination, loading, retryable error, and empty states.
- Added `/borrower/offers/{offerId}` with offer reference, application reference, principal, rate, term, frequency, interest calculation, status, expiration date and time, and fee disclosure.
- The final repayment schedule is not shown because the current offer API/schema does not provide an installment estimate and schedule creation belongs to the later funding/disbursement lifecycle.
- The acceptance dialog summarizes key terms and separately explains that the platform fee is not deducted from the wallet.
- The accept control is shown only when the detail API returns `permissions.canAccept`. On confirmation, the page posts to the existing acceptance endpoint, refreshes offer detail, displays the returned loan reference/status, and emits the dashboard refresh event.
- In-flight duplicate clicks are locked per offer. Backend duplicate prevention remains in force.
- Added an Offers link to the borrower dashboard.

## Tests authored

- Added `tests/lib/client/borrower-offers.test.ts` for list/detail paths, empty-list detection, and acceptance locking.
- Added `tests/components/borrower-offers.test.tsx` for accessible loading markup.
- Extended `tests/api/borrower-api.integration.test.ts` for list/detail terms and fee disclosure, expiry eligibility, accepted-state refresh, and another borrower's offer returning 404. Existing acceptance lifecycle tests continue to cover successful acceptance, duplicate acceptance, and expired-offer rejection.
- Tests were not run, per instruction.

## Decisions and boundaries

- The list now includes expired and accepted offers so borrowers can see outcomes and handle already-accepted or expired offers. A past expiry is labeled as expired using the backend's `isExpired` field; acceptance still relies on the backend transactional recheck.
- The current schema provides monthly frequency and interest policy terms but no generated installment quote. The UI does not invent one.
- Fee disclosure displays the active policy rate and calculation terms; it does not add the fee into repayment figures or calculate an unapproved fee amount.
- Offer conflicts and other server errors are displayed from the API response, followed by a refresh to show current server state.

## Validation status

Source review only. No tests, typecheck, lint, build, or application code was executed in this stage. The tests are ready for an explicitly requested run.

- Added an integration case for application-state conflict after offer issuance; acceptance should return OFFER_NOT_AVAILABLE.
