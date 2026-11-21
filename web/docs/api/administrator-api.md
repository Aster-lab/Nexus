# Administrator APIs

Every `/api/admin/*` route requires an authenticated session with the persisted `ADMIN` role. The actor is always the user from that session. Administrative and financial writes are audited through their service paths.

## Applications

- `GET /api/admin/applications`: paginated list; filters `status`; sort by `createdAt`, `updatedAt`, or `submittedAt`.
- `GET /api/admin/applications/{applicationId}`: detail, current version, borrower, reviews, and information requests.
- `POST /api/admin/applications/{applicationId}/decision`: strict body:

```json
{ "decision": "APPROVED", "reason": "Underwriting review complete", "notes": "Optional internal notes" }
```

`decision` is `APPROVED` or `REJECTED`; `reason` is required (1–1000 characters); optional `notes` is up to 4000 characters. Final decisions require an eligible application state and are recorded with the administrator actor.

## Loans and funding

- `GET /api/admin/loans`: paginated loans; `status` filter; sort by `createdAt`, `fundingDeadline`, or `principalSatang`.
- `GET /api/admin/loans/{loanId}`: loan, borrower, escrow summary, and status history.
- `GET /api/admin/loans/{loanId}/funding`: funding and escrow transaction history.
- `POST /api/admin/loans/{loanId}/disburse`: body `{ "reason": "Approved disbursement" }` and required `Idempotency-Key` (1–255 characters). The endpoint composes existing request, approval, and posting services. A matching posted request returns the existing transaction; a conflicting key is rejected.

## Repayments and payouts

- `GET /api/admin/repayments`: paginated repayment monitoring with installment, allocation, and ledger status details. Filters: `status=POSTED|REVERSED` and `loanId=<uuid>`; sort by `receivedAt` or `createdAt`.
- `GET /api/admin/payouts`: paginated payouts; filters `status` and `investorProfileId`; sort by `createdAt` or `completedAt`.
- `GET /api/admin/payout-allocations`: paginated unpaid allocations with investor, investment, repayment, installment, and source-ledger references. It reports current payout eligibility as advisory state; the posting service rechecks every rule transactionally.
- `POST /api/admin/payouts`: body `{ "payoutAllocationId": "<uuid>" }` and required `Idempotency-Key`. Calls the WP7 payout service; no direct wallet or ledger updates are exposed.

## Reconciliation and audit

- `GET /api/admin/reconciliation`: read-only financial and payout reconciliation reports. Reports discrepancies; never repairs records.
- `GET /api/admin/wallets`: read-only paginated wallet projections with owner/platform-account references. Supports `status`, `currency`, `ownerUserId`, `ownerPlatformAccountId`, `sortBy=createdAt|balanceSatang`, and `sortOrder` filters.
- `GET /api/admin/ledger-transactions`: read-only paginated ledger transactions and their entries. Supports `status`, `transactionType`, `referenceType`, `referenceId`, `sortBy=createdAt|postedAt`, and `sortOrder` filters. Entry amounts are satang strings; this endpoint never changes ledger or wallet state.
- `GET /api/admin/audit-logs`: paginated persisted audit history; filters `action`, `targetType`, `targetId`, and `actorUserId`; sort by `createdAt`.

## User administration

- `GET /api/admin/users`: paginated users; filters `accountStatus` and `role`; sort by `createdAt` or `email`.
- `PATCH /api/admin/users/{userId}`: changes only the account status supported by the route (`ACTIVE`, `RESTRICTED`, `DEACTIVATION_PENDING`, or `DEACTIVATED`). Role assignment changes are rejected. Self-restriction is rejected. Changes are audited.

```http
PATCH /api/admin/users/<user-uuid>
Content-Type: application/json
```

```json
{ "accountStatus": "RESTRICTED" }
```

The success response contains `id`, `email`, `accountStatus`, `deactivatedAt`, and `updatedAt`.

## Pagination

Paginated administrator collections accept `page` (default 1), `limit` (default 20; maximum 100), and `sortOrder` (`asc` or `desc`). Each collection above documents its `sortBy` and filter allowlist. Unsupported query keys and repeated parameters return `400 VALIDATION_ERROR`.

Common responses: `200` read/update, `201` financial posting, `400` invalid body/query/path, `401` unauthenticated, `403` non-admin, `404` missing resource, `409` state/idempotency conflict, and `422` business-rule rejection. Amounts in satang are serialized as decimal strings.
