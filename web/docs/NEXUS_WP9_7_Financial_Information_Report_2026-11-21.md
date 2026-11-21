# NEXUS WP9.7 — Financial Information Implementation Report

**Date:** 2026-11-21  
**Scope:** Shared money formatting, borrower and investor wallet views, administrator wallet/ledger visibility, and role-consistent financial presentation.

## Outcome

Implemented WP9.7 frontend and read-only API support. Financial screens consume persisted backend values; they do not update wallets, calculate financial postings, or treat unpaid allocations as wallet credits.

The TypeScript check (`npx tsc --noEmit`) passes after the WP9.7 changes. Per the user's instruction, tests and lint were not run. No production build was run.

## Implementation by stage

### 9.7.1 Shared financial data and formatting

- Added `src/lib/client/financial-format.ts` as the shared satang formatter and status label helper.
- Formats integer satang using `BigInt`, avoiding binary floating point, and supports zero, negative values, large integers, and non-THB currencies.
- Reused the shared formatter in borrower, investor, and administrator financial pages.
- Maintained explicit loading, empty, and error states on the new wallet/ledger views.

### 9.7.2 Borrower wallet

- Added `/borrower/wallet` using the existing borrower wallet endpoint.
- Displays the persisted simulated wallet balance and status separately from the dashboard's outstanding loan obligations.
- Shows paginated posted ledger entries with direction, date, reference, and amount.
- Includes available repayment receipt links for repayment rows associated with a wallet ledger transaction.
- Added navigation from the borrower dashboard.

### 9.7.3 Investor wallet integration

- Added investor-scoped `GET /api/investor/wallet` and `/investor/wallet` activity view.
- The API derives wallet ownership from the active investor session and returns only the wallet's posted ledger entries.
- Wallet page refreshes on entry, explicit refresh, and browser focus. The investor payout page remains read-only and distinguishes completed posted credits from pending or failed payout records.

### 9.7.4 Investor financial portfolio

- Existing portfolio and dashboard data continue to supply posted invested principal, outstanding principal, completed payout principal/interest, active/completed counts, and wallet balance.
- Existing allocation history continues to show each allocation's principal, interest, and payout status without computing a frontend total.
- Updated the dashboard's wallet activity panel to link to persisted wallet transactions and distinguish allocations from wallet credits.

### 9.7.5 Transaction history and details

- Borrower and investor wallet history show posted transaction type, ledger reference, direction, date, amount, and status.
- Investor allocation and payout pages remain distinct, preserving the difference between repayment allocation and completed payout credit.
- Administrator ledger rows expand to show each ledger entry and its wallet/platform account reference. The existing API has no separate ledger transaction detail endpoint, so the UI expands the details included in the list response.

### 9.7.6 Administrator financial consistency

- Kept WP9.6's read-only reconciliation report and added paginated wallet and ledger views to the administrator financial page.
- Added `GET /api/admin/wallets` with supported status, currency, owner, sorting, and pagination filters.
- Added `GET /api/admin/ledger-transactions` with status, transaction type, reference, sorting, and pagination filters. Entries serialize satang as decimal strings.
- Both new routes require administrator authorization and are GET-only; they do not edit ledger or wallet state.

### 9.7.7 Consistent presentation

- Centralized THB/satang formatting across financial surfaces.
- Kept zero values visible and negative values sign-correct.
- Used responsive Tailwind layouts, semantic tables, status badges, and existing shadcn UI primitives.
- Displayed loading, empty, and error states instead of placeholder balances.

## API and test updates

- Updated borrower, investor, administrator, and wallet/financial API documentation.
- Added API integration cases for investor wallet ownership/posting behavior and administrator wallet/ledger access.
- Added client/UI tests for formatting, role wallet paths, administrator filters, borrower wallet state, investor wallet behavior, and admin financial activity.
- Updated the investor dashboard assertion to reflect the new wallet activity link.

## Verification state

- `npx tsc --noEmit`: passed.
- Tests: not run, at the user's direction.
- Lint: not run, at the user's direction.
- Build: not run.
- Database-backed API cases are therefore not verified in this turn.

## API behavior constraints

- Borrower and investor wallet queries identify the owner from the authenticated role session; clients cannot request another user's wallet.
- Wallet history includes only entries linked to posted transactions with a posting timestamp.
- Administrator wallet and ledger APIs are read-only and administrator-gated.
- Monetary API values remain integer satang strings. Only display formatting converts them into THB text.
- Reconciliation remains report-only; no UI or endpoint silently repairs financial records.
