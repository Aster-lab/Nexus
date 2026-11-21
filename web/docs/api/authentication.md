# Authentication and User APIs

## Session requirements

Protected user APIs accept a valid session token as the `nexus_session` cookie or as `Authorization: Bearer <token>`. Local login issues an opaque token, stores only its SHA-256 hash, and sets an `HttpOnly`, `SameSite=Lax` cookie. The cookie is `Secure` in production. Sessions expire after eight hours and logout revokes the server-side session. The account must be active; active roles are read from persisted, unrevoked role assignments.

NEXUS supports local email/password login and configurable OpenID Connect sign-in. OAuth identities must have a verified email matching exactly one existing active NEXUS user. The first successful OAuth sign-in links the provider subject to that user; OAuth does not create accounts or assign roles. The OAuth callback uses PKCE and state checks. API authorization rechecks the NEXUS user and roles on every request.

Local passwords use a versioned scrypt hash (`scrypt$v1$...`). Existing accounts need a hash in this format before local login is enabled. This implementation does not include public registration, password reset, or email verification workflows.

Configure `NEXTAUTH_SECRET` (at least 32 random characters), `NEXTAUTH_URL`, `NEXUS_OIDC_ISSUER`, `NEXUS_OIDC_CLIENT_ID`, and `NEXUS_OIDC_CLIENT_SECRET` in deployment secrets. The issuer must be HTTPS outside localhost. When the OIDC settings are absent, local login remains available and the OAuth provider is not registered.

The NextAuth-compatible session callback maps OAuth/JWT sessions to an active NEXUS user. Local login through the NEXUS endpoint uses the revocable database `Session` row. Browser clients should use the same-origin login/logout endpoints and must not log credentials or session tokens.

## `POST /api/auth/login`

Strict JSON body:

```json
{ "email": "borrower@example.test", "password": "a long password" }
```

Returns the caller's ID, email, active roles, borrower/investor profile summaries, and session expiry. The password is never returned. The email/password failure response is generic. Passwords must contain 12–128 characters when stored with `hashPassword`.

## `POST /api/auth/logout`

Revokes the current `nexus_session` when present and clears local and NextAuth browser session cookies. The endpoint is idempotent and returns `{ "signedOut": true }` even when no active local session exists.

## OAuth callback routes

NextAuth handles `/api/auth/*` callback routes, including the configured `nexus-oidc` provider. The callback rejects unverified email claims, unknown/inactive accounts, ambiguous email matches, and provider subjects already linked to another NEXUS user.

## `GET /api/auth/me`

**Access:** Any authenticated user.  
**Query/body:** None.

Returns `id`, `email`, active `roles`, and the caller's borrower/investor profile summaries (or `null`).

```http
GET /api/auth/me
Cookie: nexus_session=<session-token>
```

## `GET /api/users/me`

Returns the authenticated user's `userId`, `email`, `roles`, `borrowerProfile`, and `investorProfile`.

## `PATCH /api/users/me`

Strict JSON body. At least one supported field is required.

```json
{ "phone": "+66..." }
```

or:

```json
{ "displayName": "Investor display name" }
```

- `phone`: borrower role/profile required; string or `null`, 1–30 characters when a string.
- `displayName`: investor role/profile required; trimmed string, 1–100 characters.
- Unknown fields (`userId`, `email`, `roles`, `accountStatus`, etc.) are rejected.
- The update only applies to the authenticated user's matching profile.

## Common status codes

- `200`: read or update succeeded.
- `400 VALIDATION_ERROR` or `INVALID_JSON`: invalid request.
- `401 UNAUTHENTICATED`: missing, expired, revoked, malformed, or inactive-account session.
- `403 FORBIDDEN`: the session lacks the required profile/role.

See [error codes](error-codes.md) for envelope details.
