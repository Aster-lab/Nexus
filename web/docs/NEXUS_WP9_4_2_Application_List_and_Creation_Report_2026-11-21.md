# NEXUS WP9.4.2 — Application List and Creation

**Date:** 21 November 2026  
**Scope:** WP9.4.2 only  
**Validation:** Tests authored first, then implementation reviewed statically. Tests, lint, typecheck, build, and browser rendering were not run, following the instruction not to execute tests without an explicit request.

## Outcome

Implemented a responsive borrower application list and a create-draft flow using Tailwind and the shadcn-compatible UI primitives established in WP9.4.1. The list uses the authenticated borrower's API and exposes its supported pagination and created-date sorting.

## Application list

- Shows the full application UUID reference, requested amount, term, purpose, status, submitted date, and last updated date.
- Provides status filtering and pagination, with newest-first and oldest-first sorting by `createdAt`, the only currently supported sort field.
- Adds loading, retryable error, empty, and no-filter-match states, plus a clear create-application action.
- Displays a draft-specific continue action and a view action for other states. The application detail route is part of WP9.4.3 and is the next integration step.
- The list API projects only request amount, term, and purpose from its persisted snapshot rather than returning the full submitted snapshot.

## Application creation

- The form follows `ApplicationSnapshotSchema` exactly: borrower legal name, phone and address; employment status and optional employer/occupation/months; and requested amount, term, and purpose.
- Legal name and phone are prefilled from the authenticated borrower profile when available. Nullable schema fields are sent as `null` when blank.
- Amount input accepts decimal THB with at most two decimal places, converts to integer satang without floating-point arithmetic, and validates THB 1,000–50,000. Term choices are 3, 6, 9, 12, 18, and 24 months.
- Purpose remains free text because the application API contract requires a non-empty string and does not constrain it to the separate ML-purpose enum. This avoids coupling the unavailable MVP prediction feature to application entry.
- A review step summarizes the exact request before the browser calls the existing `POST /api/borrower/applications` endpoint. That backend operation creates a `DRAFT`; actual application submission remains in WP9.4.3 because the API has a separate draft-submit endpoint.
- A single-flight lock and disabled submit control prevent duplicate in-flight creates. API validation messages are shown to the borrower. Successful draft creation publishes the WP9.4.1 dashboard refresh event.

## API and authorization

- Extended `GET /api/borrower/applications` with a validated optional `status` filter. Pagination and `sortBy=createdAt` remain server-supported; unsupported statuses are rejected.
- Existing borrower session and profile authorization remains authoritative. The create API integration test covers rejection of an authenticated investor.
- Updated the borrower API reference with the status filter behavior.

## Tests authored

- Added `tests/lib/client/borrower-applications.test.ts` for the exact request contract, THB/satang conversion boundaries, valid terms, required fields, free-text purpose, pagination/filter URL construction, empty-list detection, validation error display, status text, draft endpoint call, and duplicate-submit lock.
- Extended `tests/api/borrower-api.integration.test.ts` with server status filtering, pagination metadata, persisted purpose projection, and investor authorization rejection. Existing API-03-01 covers successful draft creation.
- No test command, lint, typecheck, build, or UI server was run.

## Follow-up

WP9.4.2 implementation is complete. WP9.4.3 should implement application detail, draft editing, and final submission, then connect the list's draft/view actions to that detail route. Run the focused application client and borrower API tests when explicitly requested.
