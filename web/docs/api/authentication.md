# Authentication and User APIs

## Session requirements

Protected user APIs accept a valid session token as the `nexus_session` cookie or as `Authorization: Bearer <token>`. Local login issues an opaque token, stores only its SHA-256 hash, and sets an `HttpOnly`, `SameSite=Lax` cookie. The cookie is `Secure` in production. Sessions expire after eight hours and logout revokes the server-side session. The account must be active; active roles are read from persisted, unrevoked role assignments.

NEXUS supports local email/password login and configurable OpenID Connect sign-in. OAuth identities must have a verified email matching exactly one existing active NEXUS user. The first successful OAuth sign-in links the provider subject to that user; OAuth does not create accounts or assign roles. The OAuth callback uses PKCE and state checks. API authorization rechecks the NEXUS user and roles on every request.

Local passwords use a versioned scrypt hash (`scrypt$v1$...`). Existing accounts need a hash in this format before local login is enabled. Self-registration is open for borrower and investor roles; administrator roles remain administrator-created. Registration activates accounts immediately for the MVP. New accounts leave `emailVerifiedAt` unset so a future verification workflow can add a verification requirement without changing the account/profile structure. Password reset and email-verification delivery are not implemented.

Configure `NEXTAUTH_SECRET` (at least 32 random characters), `NEXTAUTH_URL`, `NEXUS_OIDC_ISSUER`, `NEXUS_OIDC_CLIENT_ID`, and `NEXUS_OIDC_CLIENT_SECRET` in deployment secrets. The issuer must be HTTPS outside localhost. When the OIDC settings are absent, local login remains available and the OAuth provider is not registered.

The NextAuth-compatible session callback maps OAuth/JWT sessions to an active NEXUS user. Local login through the NEXUS endpoint uses the revocable database `Session` row. Browser clients should use the same-origin login/logout endpoints and must not log credentials or session tokens.

## `POST /api/auth/login`

Strict JSON body:

```json
{ "email": "borrower@example.test", "password": "a long password" }
```

Returns the caller's ID, email, active roles, borrower/investor profile summaries, and session expiry. The password is never returned. The email/password failure response is generic. Passwords must contain 12–128 characters when stored with `hashPassword`.

## `POST /api/auth/register`

Creates an active local account and one or both supported self-service roles. `ADMIN` is never accepted as a self-selected role. The endpoint normalizes email to lowercase, rejects an existing email with `409 EMAIL_ALREADY_REGISTERED`, hashes the password with the existing scrypt mechanism, and creates the user, role assignments, and selected profile(s) atomically. It does not create a session; users sign in through the normal login endpoint after registration.

Strict JSON body:

```json
{
  "email": "borrower@example.test",
  "password": "a long secure passphrase",
  "roles": ["BORROWER", "INVESTOR"],
  "borrowerProfile": {
    "legalName": "Example Borrower",
    "phone": "+66 80 123 4567",
    "address": {
      "schema_version": "borrower_profile_address.v1",
      "line1": "12 Example Road",
      "line2": null,
      "subdistrict": null,
      "district": "Pathum Wan",
      "province": "Bangkok",
      "postal_code": "10330",
      "country_code": "TH"
    }
  },
  "investorProfile": { "displayName": "Example Investor" }
}
```

Each role requires its matching profile object; profile objects for unselected roles are rejected. Passwords must contain 12–128 characters. The response is `201` with the new user ID, normalized email, active roles, and profile summaries. Registration is same-origin when an `Origin` header is present.

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
