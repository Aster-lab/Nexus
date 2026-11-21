# NEXUS WP9.6 Administrator Frontend Audit and API Map

Date: 2026-11-21

## Objective and working rules

WP9.6 builds administrator screens on the existing WP8 authorization and business services. The UI must not post financial records directly, infer financial decisions, or imply an operation succeeded before the backend confirms it. Pages and reusable UI use Tailwind CSS and the repository's shadcn-style components. UI implementation follows the existing page/component split and responsive light/dark theme.

## Existing frontend

- `/admin` renders a workspace placeholder.
- `/admin/operations` renders a workspace placeholder.
- `/admin/applications` renders a workspace placeholder.
- `src/app/admin/layout.tsx` applies the shared `RoleGuard`, which consults the authenticated session roles and routes unauthorized identities away from administrator paths.
- The global application shell supplies authentication, sign-out, theme, and top-level navigation. Admin navigation can be added in the nested admin layout without replacing these shared controls.
- Shared Tailwind/shadcn-style `Button`, `Card`, `Badge`, and request-state components exist. Design tokens provide NEXUS blue, light/dark surfaces, semantic states, and focus colors.

## WP8 administrator endpoint map

| Workflow | Existing endpoint | Supported data/actions | Frontend boundary |
| --- | --- | --- | --- |
| Application queue | `GET /api/admin/applications` | Pagination, status filter, supported sorting, requested amount/term and timestamps | No text search parameter is supported. |
| Application detail | `GET /api/admin/applications/:applicationId` | Borrower identity/contact, version snapshot, request values, reviews and information requests | Review actions use the decision/offer endpoints. |
| Application decision | `POST /api/admin/applications/:applicationId/decision` | `APPROVED` or `REJECTED`, reason and optional notes | Backend owns transition validation and audit. |
| Issue offer | `POST /api/admin/applications/:applicationId/offers` | Creates policy-compliant offer | Backend owns policy checks. |
| Loan queue/detail | `GET /api/admin/loans`, `GET /api/admin/loans/:loanId` | Status-filtered list; borrower, funding totals, escrow reference, status history | Detail does not include the repayment schedule. |
| Funding/escrow | `GET /api/admin/loans/:loanId/funding` | Funding state, amount remaining and escrow transactions | Read-only view. |
| Disbursement | `POST /api/admin/loans/:loanId/disburse` | Idempotent disbursement through WP5 services | Require reason, idempotency key, and explicit confirmation. |
| Repayment monitoring | `GET /api/admin/repayments` | Pagination, status/loan filters, repayment portions, installment summary, allocations and ledger state | There is no administrator repayment-by-ID endpoint or receipt route. Detail can be shown from loaded list records; avoid claiming a receipt is available to admins. |
| Payout history | `GET /api/admin/payouts` | Pagination and status/investor filters | Read-only listing; there is no payout-by-ID endpoint. |
| Payout processing | `POST /api/admin/payouts` | Processes an allocation through WP7, requires idempotency key | Backend service is authoritative and idempotent. |
| Pending payout allocations | **Missing** | Needed to discover/select unpaid allocations for the payout POST | User approved adding an administrator read endpoint. It must return persisted allocation and source records; processing still revalidates eligibility inside the payout service. |
| Financial reconciliation | `GET /api/admin/reconciliation` | Read-only financial and payout validation, issues, checked counts, clearing reconciliation totals | Does not return wallet balance rows or a ledger transaction listing. Show reports/issues and do not fabricate a ledger explorer. |
| User management | `GET /api/admin/users`, `PATCH /api/admin/users/:userId` | Paginated users, status/role/profile summaries; status changes only | Role changes are not supported. There is no user-by-ID GET endpoint or search filter. Confirm status changes. |
| Audit log | `GET /api/admin/audit-logs` | Paginated immutable events with actor/action/target/outcome/values; supported filters | Read-only. Search is restricted to supported filters. |

All admin endpoints call `requireAdministrator`, which authenticates the session and requires the `ADMIN` role. Financial posting and reconciliation services additionally enforce an active authorized administrator. User role assignment is not exposed by the user status endpoint.

## Dashboard data plan

There is no aggregate dashboard endpoint. The dashboard can assemble summaries from supported paginated endpoints by reading the server-reported `pagination.total`, with independent loading/error/empty states per section. Counts should use only API filters that exist. The activity panel can use the audit-log page and repayment page. Any failed section remains visibly unavailable without blocking other panels. The dashboard must not present mock totals or calculate financial balances from unrelated records.

## Gaps and decisions

1. **Pending payout discovery:** missing in WP8 and blocks safe payout selection. User approved extending WP8 with an admin allocation-list endpoint. The existing payout service remains authoritative at submission.
2. **Ledger transaction browser and wallet balance table:** neither is exposed by the current admin APIs. The reconciliation report exposes validation results, not a ledger/wallet data feed. WP9.6 will display reconciliation and discrepancy details from the existing response; a ledger browser or wallet table remains out of scope unless a backend API is separately authorized.
3. **Repayment and payout detail routes:** no administrator detail endpoints exist. Use complete related data returned from the paginated list where possible; do not add an uncontracted receipt/database model.
4. **Search:** applications and users do not accept free-text search parameters. Use supported status/role filters and server pagination only.

## Proposed frontend route structure

Preserve the existing `/admin`, `/admin/operations`, and `/admin/applications` routes. Add route pages only for supported workflows:

- `/admin/loans` and `/admin/loans/[loanId]`
- `/admin/repayments`
- `/admin/payouts` (eligible allocations and payout history)
- `/admin/financial` (reconciliation overview and issues)
- `/admin/users`
- `/admin/audit-logs`

Navigation links must remain within these implemented routes and administrator pages remain wrapped by `RoleGuard`.

## Delivery workflow

For each subphase: write correlated client/API/component tests first; implement only the relevant workflow; run only its correlated tests; review API contract/authorization boundaries; then write or update the subphase implementation report before moving to the next subphase. Do not run the full suite unless requested.
