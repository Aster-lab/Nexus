# NEXUS Role-Based First-Sign-In Tours

**Date:** 2026-11-22  
**Status:** Implemented; browser behavior not yet exercised against staging.

## User experience

- A borrower sees a five-step guide on the first borrower dashboard visit in a browser: dashboard, applications, offers, loans/repayments, and history/receipts.
- An investor sees a six-step guide on the first investor dashboard visit in a browser: simulated wallet, marketplace eligibility, investment review, portfolio/allocations, payouts, and wallet activity.
- An administrator sees an eight-step guide on the first administrator dashboard visit in a browser: operational summary, policy governance, applications, loans/disbursement, repayments, investor payouts, reconciliation, and user/audit oversight.
- Each step highlights and scrolls to its real dashboard section. Where relevant, the guide links directly to the corresponding read-only feature page. Users can interact with the page while the guide remains visible.
- Back/Next moves between steps. **Pause tour** saves incomplete progress; **Resume tour** continues from that step. **Finish tour** completes it. The guide is always reopenable from the dashboard.
- Completion and progress are remembered separately by account ID and role in browser local storage. The guide does not block dashboard access if storage is unavailable; it remains usable for that session.
- The tour is informational. It does not submit applications, investments, repayments, disbursements, or payouts.

## Business-rule notes included

- Approval alone does not create a marketplace opportunity. An administrator issues an offer and the borrower accepts it to create a funding loan.
- Marketplace availability, payable amounts, schedules, repayment allocation, and ledger results are determined by NEXUS backend records.
- Administrators are reminded that policy activations and financial actions are audited, reconciliation is read-only, and borrower approval must be followed by offer issuance and borrower acceptance.
- Investor allocations are distinct from completed payout wallet credits.
- All wallet balances and transactions in the MVP are simulated; registration does not fund an account.

## Decision and limitation

The MVP stores tour progress per account and role in the current browser profile, avoiding a schema migration or new user-preference API. It does not synchronize completion between devices or browsers. If cross-device onboarding state is required, move the progress marker to a backend user preference.

## Verification

No test file was added or run for this subphase. Staging browser verification remains pending until the staging URL and dedicated role accounts are configured.
