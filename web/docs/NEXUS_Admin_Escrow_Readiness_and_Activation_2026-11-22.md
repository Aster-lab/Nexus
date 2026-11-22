# NEXUS Admin Escrow Readiness and Activation

**Date:** 2026-11-22  
**Work area:** Demo loan funding configuration  
**Status:** Implemented in source; tests not run.

## Problem

Borrower offer acceptance requires platform account `2200` to be an active THB liability account and to have an active shared THB platform wallet. If this operational configuration is missing or inactive, offer acceptance returns the generic temporary funding-unavailable message. The seed creates these records for fresh databases but preserves existing account and wallet statuses, so rerunning the seed does not silently reactivate an operator-disabled account.

## Changes

- Added administrator-only `GET /api/admin/escrow` to report whether account 2200 and its wallet satisfy the funding prerequisites.
- Added administrator-only `POST /api/admin/escrow` to activate the seeded escrow account and wallet.
- Activation validates the account type/currency and wallet ownership/currency, serializes concurrent updates, and refuses to reopen a `CLOSED` wallet.
- If account 2200 is missing, the admin action provisions the fixed approved THB liability account and an active platform wallet at zero balance. If the account exists but its wallet is missing, it provisions the wallet at zero balance.
- Activation changes no balance and creates no ledger transaction. The audit event records the administrator, reason, old/new statuses, wallet identity, and unchanged balance.
- Added a **Loan funding escrow** readiness and activation card to the administrator Financial Overview.
- Added API integration coverage for activation, balance/ledger preservation, audit attribution, readiness reporting, and non-admin rejection.

## Operator flow in demo

1. Sign in as the demo administrator.
2. Open **Financial overview** (`/admin/financial`).
3. Review the **Loan funding escrow** status card.
4. If it needs attention, enter the reason and choose **Review activation**.
5. Confirm the action. The card should report **Ready** afterward.
6. Retry borrower offer acceptance.

If account 2200 is missing, the activation action provisions the fixed approved chart-of-accounts entry and a zero-balance wallet. Do not edit the wallet balance directly.

## Verification

- Tests were added to `tests/api/admin-api.integration.test.ts` and were not run.
- No lint, typecheck, build, or browser verification was run.
- Existing demo database state has not been inspected or modified by this change.
