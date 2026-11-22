# NEXUS — Simulated wallet top-ups and recommendation form repair

**Date:** 22 November 2026  
**Scope:** Self-service simulated THB wallet credits for borrowers and investors, plus the investor recommendation preference form defect reported from the UI.

## Decisions

- A borrower or investor can add simulated funds to their own active THB wallet.
- Each top-up is limited to THB 50,000. Users may post additional top-ups later.
- NEXUS does not collect a bank deposit or initiate an external payment. The UI and ledger description identify each top-up as simulated.
- Only a posted ledger result is shown as success. The operation is idempotent and audited, and failed posting is transactionally rolled back.

## Wallet implementation

- Added borrower and investor `POST /api/{role}/wallet/top-ups` endpoints. The request carries only a satang amount and requires the existing `Idempotency-Key` header; wallet ownership comes from the authenticated identity.
- Added a shared service that locks the owner wallet and source account, checks active role/profile and THB wallet eligibility, enforces the THB 50,000 per-request cap, and posts the credit with the existing serializable transaction retry helper.
- The posting debits the configured simulated funding asset account 1300 and credits the user's wallet. The ledger transaction, wallet projection, completed idempotency snapshot, and audit record are committed together.
- Repeating the same key and request returns the saved posting result. Reusing the key with different request data is rejected. A retry after a network-uncertain response uses the same key to avoid a duplicate credit.
- Added a shared confirmation form to the borrower and investor wallet pages. It validates THB precision, explains that funds are simulated, shows the cap, refreshes posted wallet activity after success, and does not present a request as successful before the API confirms it.

## Recommendation preference repair

- The form constructed each range as `{ min, max, valid }`. The API's strict Zod contract accepts only `{ min, max }`, so saving otherwise valid selections returned `Invalid request data`.
- Added a preference payload builder that converts strings to numbers and deliberately reconstructs only the contract fields. The `valid` UI flag is no longer sent to the API.
- Changed the preference range grid to use two columns at compact/tablet widths and three columns only at extra-large widths. Range fieldsets, labels, and inputs now allow shrinking (`min-w-0`, `w-full`, `max-w-full`, and `box-border`) so they stay within the card.

## Tests added or updated

- Added API integration coverage for borrower and investor top-ups, balanced ledger entries, wallet balance, audit attribution, sequential and concurrent idempotent replay, conflicting reuse, amount cap, cross-role denial, and atomic failure when the simulated source is inactive.
- Added client tests for role-specific API paths and THB-to-satang parsing/cap behavior.
- Added UI coverage for the top-up disclosure and responsive recommendation range controls.
- Updated the user manual to describe the self-service simulated top-up flow.

## Verification status

Tests were **not run**, in keeping with the instruction to wait for an explicit request before executing tests. No test, lint, typecheck, build, or database migration command was executed during this change. Review the new code and then run only the correlated tests when requested.
