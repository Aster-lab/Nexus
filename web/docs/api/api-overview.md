# NEXUS Backend API Overview

**Version:** WP8 API contracts, 21 November 2026  
**Base path:** `/api`

This guide describes the Next.js App Router APIs implemented in WP8. Every successful API envelope uses `success`, `data`, and `message`. Errors use `success: false` and an `error` object. Paginated collection responses add a `pagination` object at the envelope level. Responses carrying user or financial information are marked `Cache-Control: no-store, max-age=0`.

## Authentication

Session-protected routes accept the opaque session token through either:

- Cookie: `nexus_session=<session-token>`
- Header: `Authorization: Bearer <session-token>`

The token is validated against its hash in the existing `Session` table. The server derives the user ID and active roles from that session. A request body, query parameter, or role header cannot establish identity. See [authentication](authentication.md).

The browser can establish a local session through `POST /api/auth/login` and end it through `POST /api/auth/logout`. Configured OpenID Connect sign-in is handled by NextAuth routes. OAuth links only to an existing active NEXUS user with a verified matching email; account provisioning remains outside these endpoints. See [authentication](authentication.md) for configuration and behavior.

## Response envelopes

Success:

```json
{
  "success": true,
  "data": { "id": "resource-id" },
  "message": "Request completed successfully"
}
```

Paginated success:

```json
{
  "success": true,
  "data": [],
  "message": "Request completed successfully",
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0,
    "hasPreviousPage": false,
    "hasNextPage": false
  }
}
```

Error:

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Invalid request data" }
}
```

Integer THB monetary values are persisted in satang. API responses serialize satang amounts as decimal strings to preserve integer precision. Rates and timestamps are returned as JSON numbers/ISO date values as applicable.

## Pagination and filtering

Collection endpoints that support pagination accept `page` (default `1`), `limit` (default `20`, maximum `100`), `sortBy` (endpoint allowlist), and `sortOrder` (`asc` or `desc`, default `desc`). Supported filters vary by endpoint. Unknown, repeated, invalid, or unsupported query parameters return `400 VALIDATION_ERROR`.

## Endpoint guides

- [Authentication and user APIs](authentication.md)
- [Borrower APIs](borrower-api.md)
- [Investor APIs](investor-api.md)
- [Administrator APIs](administrator-api.md)
- [Wallet and financial API behavior](wallet-and-financial-api.md)
- [ML integration APIs](ml-integration-api.md)
- [Error codes](error-codes.md)

## Role summary

| API group | Required identity |
| --- | --- |
| `/api/auth/me`, `/api/users/me` | Any authenticated session; profile updates are role-specific. |
| `/api/borrower/*` | Authenticated user with `BORROWER` role and borrower profile. |
| `/api/investor/*` | Authenticated user with active `INVESTOR` role and profile. |
| `/api/admin/*` | Authenticated user with `ADMIN` role. |
| `/api/ml/borrower-evaluation*` | Borrower role for borrower-facing evaluation and retrieval. |
| `/api/ml/investor-recommendations` | Active investor role and profile. |
| `/api/applications/[applicationId]/predictions` | Service-to-service bearer token; not a browser/user session endpoint. |

## Important integration notes

- All application, loan, repayment, allocation, payout, wallet, and ledger writes must pass through their domain services.
- Repayment submission, investment contribution, payout, and disbursement require an `Idempotency-Key`; see [wallet and financial APIs](wallet-and-financial-api.md).
- Investor marketplace responses omit borrower identity and internal underwriting data.
- Reconciliation endpoints are read-only and report discrepancies; they do not repair financial records.
- Runtime tests and production build have not been verified. See the WP8 final status report.
