# NEXUS WP9.4.1 — Borrower Dashboard

**Date:** 21 November 2026  
**Scope:** WP9.4.1 only  
**Validation:** Static review; tests were authored but not run, following the standing instruction not to run tests without an explicit request.

## Outcome

The borrower landing page now presents a dashboard backed by borrower-scoped APIs. Financial summary values are read and calculated on the server from persisted current schedule records; the browser formats those values and does not derive balances, installments, interest, or repayment allocations.

## Dashboard content

- Summary cards show active and delinquent loan count, total schedule outstanding, the next unpaid installment and due date, pending application count, and valid available offer count.
- Application rows show reference, requested amount and term when present, status, and last updated date.
- Loan rows show reference, original principal, current outstanding amount when supported by an active schedule, next due date, and status.
- Upcoming and overdue installments show persisted remaining principal plus interest. No penalty is calculated or displayed.
- Recent repayment rows show persisted repayment totals, principal and interest, status, date, and a receipt API link only when both repayment and ledger transaction are posted.
- Empty states provide an explanation and relevant navigation. Loading, error, and retry states are independent for each API resource.

## Backend and data decisions

- Added `GET /api/borrower/dashboard`, protected by the existing session authentication and `BORROWER` role check.
- The summary is scoped by the authenticated borrower's profile ID. It queries active/delinquent loans, open applications, and unexpired issued offers.
- Outstanding amounts are principal due plus interest due less persisted principal and interest paid, across the current schedule version. Integer `BigInt` arithmetic is used and values leave the API as decimal satang strings.
- Installments are sorted by due date, classified against the current UTC date, and limited to the five nearest upcoming and five nearest overdue entries for the dashboard. The total outstanding still includes every installment in each active loan's current schedule.
- An active loan missing its current schedule causes the summary resource to fail rather than report a misleading zero balance.
- The existing application list response now includes `updatedAt`, which the dashboard displays.
- A shared `nexus:borrower-dashboard-refresh` browser event and notifier establish the refresh contract for borrower mutations. Dashboard refresh controls and per-section retries are also present. Later mutation screens should call `notifyBorrowerDashboardMutationComplete()` after a successful mutation.

## UI implementation

- Dashboard layout and states use Tailwind utility classes, with shadcn-compatible `Button`, `Card`, `Badge`, and `Skeleton` primitives under `src/components/ui`.
- Added `components.json` with the project's Next.js, Tailwind v4, CSS-variable, and Lucide settings. The repository did not previously have a shadcn component set, so the dashboard's small primitives follow shadcn conventions and use the existing `class-variance-authority`, `clsx`, `tailwind-merge`, and `lucide-react` dependencies.
- Tailwind semantic color utilities map to the existing Nexus light/dark theme tokens. The previous dashboard-specific stylesheet was removed.
- Responsive layout changes from five metric columns on wide screens to two and then one column on smaller screens. Interactive controls include keyboard focus styles and accessible loading/error announcements.
- Detail links currently lead to the existing borrower application and loan workspaces; detailed record pages belong to later WP9.4 stages.

## Tests authored

- Extended `tests/api/borrower-api.integration.test.ts` with dashboard summary correctness, empty-account summary, and non-borrower authorization scenarios (DASH-01, DASH-02, DASH-03, DASH-07).
- Extended `tests/lib/client/borrower-dashboard.test.ts` for independent resource failures, initial loading resources, incremental completion without waiting for the slowest request, refresh event subscription, and integer satang formatting (DASH-04, DASH-05, DASH-06).
- Added `tests/components/borrower-dashboard.test.tsx` to verify accessible dashboard loading indicators render before responses arrive (DASH-05).
- Tests, typecheck, lint, build, and browser rendering were not run. No runtime claims are made.

## Follow-up

WP9.4.1 is implemented. WP9.4.2–WP9.4.7 still need the application, offer, loan-detail, repayment, and receipt pages. Their successful mutations should publish the dashboard refresh event. Request the focused dashboard tests when ready to execute them.
