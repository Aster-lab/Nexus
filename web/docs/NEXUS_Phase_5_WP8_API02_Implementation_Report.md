# NEXUS Phase 5 WP8 — API-02 Authentication and User APIs

**Date:** 20 November 2026  
**Scope:** API-02 — session validation, current-user APIs, role/ownership checks, permitted self-profile updates

## Summary

API-02 adds request authentication using the existing `Session` model, current-user endpoints, role and resource-ownership helpers, and self-service profile updates. The session token is opaque, is SHA-256 hashed before lookup, and is accepted from a `nexus_session` cookie or a Bearer authorization header. The database stores only the hash. Expired or revoked sessions and inactive accounts are rejected, and only unrevoked role assignments are returned.

The test suite was written before the route and helper implementation. **Tests were not run**, following the standing instruction to run them only when explicitly requested.

## Files added or updated

- `src/lib/api/authentication.ts` — resolves an active session and returns server-derived user identity, active roles, and own profile summaries.
- `src/lib/api/authorization.ts` — requires one of the supported roles, requires administrator role, and checks resource ownership. Administrator ownership override is opt-in.
- `src/app/api/auth/me/route.ts` — authenticated current-user identity and role endpoint.
- `src/app/api/users/me/route.ts` — authenticated self-profile retrieval and restricted PATCH endpoint.
- `tests/api/authentication.integration.test.ts` — API-02-01 through API-02-10 scenarios.
- `tests/helpers/api.ts` — default test session cookie now matches `nexus_session`.
- `tests/lib/api/api-foundation.test.ts` — API-01 cookie-helper expectation updated to the custom Session model token name.

## Behavior and security boundaries

- The authenticated user ID, email, and roles are loaded from the session's database user relation; caller-supplied user IDs, role metadata, and request query values do not establish identity.
- User profile PATCH permits only borrower `phone` and investor `displayName`, and only when the authenticated user has the matching active role and profile. The schema rejects all unrecognized properties such as `userId`, `email`, `accountStatus`, and `roles`.
- Profile writes are grouped in a Prisma transaction. Responses use the API-01 success/error envelopes and no-store response headers.
- Role checks use active `UserRole` rows. The schema currently has role assignments but no granular permission model, so API-02 provides role and ownership checks; named permission policy remains undefined.
- Tests create session rows directly using hashed random tokens. The helper metadata is not sent as trusted headers.

## Test coverage

The API-02 suite covers current-user identity and role response, unauthenticated rejection, borrower/investor/admin role checks, borrower denial from admin operations, cross-user ownership denial and ignored user-ID input, permitted investor profile update, protected field rejection with no user status change, and invalid, expired, or revoked session rejection.

## Findings and remaining integration dependency

Inspection found `src/lib/auth.ts` is empty and no NextAuth/provider configuration or login service is referenced in the application source. The database has `passwordHash`, `OAuthAccount`, and hashed `Session` records, but the repository does not define the password hashing scheme or a trusted session issuer. To avoid introducing a second or incompatible password authentication system, this scope does not implement login, logout, password verification, or token issuance. A trusted provider must issue secure session tokens and set the cookie with appropriate `HttpOnly`, `Secure`, and `SameSite` attributes before a frontend can establish a session. The current-user and authorization endpoints are ready to validate those stored sessions.

## Verification state

- Reviewed the WP8 plan, existing Prisma identity/session schema, API-01 response/error helpers, and installed Next.js Route Handler guidance.
- Reviewed the API-02 tests, routes, and session/authorization helpers statically.
- No tests, type checks, lint, or build were run. Runtime status is unverified.

## Next step

Confirm or implement the trusted sign-in/session issuance provider, then continue with API-03 borrower endpoints. Keep session validation bound to the existing Session table and derive actors from the authenticated identity in every route.
