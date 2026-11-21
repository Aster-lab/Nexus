# NEXUS WP9.3 Authentication and Role Shell

**Date:** 21 November 2026  
**Work package:** WP9.3 — Authentication, session refresh, role navigation, and protected route behavior  
**Validation:** Static review only. Tests, application code, lint, typecheck, and build were not run, per instruction.

## Summary

WP9.3 adds the first authenticated frontend experience on top of the existing NEXUS authentication APIs. The shared layout now restores the current user from `GET /api/auth/me`, displays navigation derived from the returned active roles, supports local email/password sign-in and configured OIDC sign-in, and provides a server-backed logout action. It also supports borrower and investor self-registration, including accounts with both roles. Borrower, investor, and administrator route groups use a role guard for clear client-side routing behavior.

Authorization remains server-owned. The role guard only controls what the browser renders and where it navigates; API handlers and services remain responsible for rechecking the active user and role. The client does not persist session tokens or accept user-selected roles.

## Authentication and session decisions

- Local sign-in posts credentials to `POST /api/auth/login`. The opaque session token remains in the existing HttpOnly cookie and is never read by JavaScript.
- After local login, the frontend calls `GET /api/auth/me` and uses that server-returned identity to select a destination.
- Organization SSO is offered only when NextAuth reports the configured `nexus-oidc` provider. The existing provider contract requires verified email matching an existing active NEXUS account; it does not create accounts or roles.
- Logout calls `POST /api/auth/logout`, which revokes the local session and clears local and NextAuth cookies. The browser clears its identity and routes to the sign-in page only after the endpoint succeeds.
- A 401 from the current-user request becomes an unauthenticated state. Network/server errors remain a retryable session-check error instead of silently appearing as a sign-out.
- Session refresh responses are sequence-guarded so a late response cannot restore an identity after a later sign-out or refresh.
- `returnTo` accepts only a same-site path. External URLs, protocol-relative paths, backslashes, and the sign-in route are rejected as return destinations.
- Borrowers and investors may self-register separately or together. The server rejects administrator self-registration, creates role assignments and selected borrower/investor profiles in one transaction, normalizes email, detects duplicate email addresses, and applies the existing 12–128 character scrypt password contract.
- Registration activates accounts immediately for the MVP and does not create a session. Users receive a confirmation and sign in through the existing local login flow. `emailVerifiedAt` remains unset; the schema supports adding verification later, but verification delivery and enforcement are not included.

## Role behavior

`src/lib/client/auth-access.ts` defines the UI routing policy:

| Active role | Landing route | Navigation areas |
|---|---|---|
| `BORROWER` | `/borrower` | Overview, applications, loans and repayments |
| `INVESTOR` | `/investor` | Overview, marketplace, portfolio |
| `ADMIN` | `/admin` | Operations, applications, administration |

For multi-role users, the landing-page priority is administrator, borrower, then investor. All navigation entries are derived from the current server identity. The route guard checks role-group paths and redirects unauthenticated visitors to sign-in with a safe return path. A user lacking the requested role is sent to their own role landing page.

The role pages currently contain deliberate workflow placeholders. They confirm the protected route shell and signpost that detailed borrower, investor, and administrator screens are built in subsequent WP9 phases. Investor copy explicitly does not imply MVP recommendations are available.

## Registration

`/register` allows the user to choose borrower, investor, or both. Borrower details collect a legal name, optional phone, and the existing versioned borrower address shape; investor details collect a display name. The strict request contract requires each selected role's profile and rejects profile data for unselected roles. It validates email and password server-side, rejects duplicate email addresses with `409 EMAIL_ALREADY_REGISTERED`, and never accepts `ADMIN` as a self-selected role.

The registration endpoint uses the existing scrypt implementation and commits the user, active role assignments, and profile rows atomically. It does not create a session during account creation. On success, the page confirms the active account and links to sign-in. Existing login then sends the user to the role landing route, preferring administrator, borrower, then investor for an account with multiple roles.

## Borrower repayment-history API prerequisite

The audit identified that the borrower dashboard could not show persisted recent repayments because only receipt-by-ID lookup existed. `GET /api/borrower/repayments` has now been added to the existing repayment route. It scopes rows through the authenticated borrower's loan ownership, supports pagination and `receivedAt`/`createdAt` sorting, returns satang as strings, and includes installment and ledger transaction references/status. The borrower API guide and WP9.1 API map were updated.

## User experience and responsive styling

- The login screen explains the available account types, shows progress while a request is in flight, uses a generic local credential failure message, and provides a retryable server/network error.
- The registration page follows the new public registration contract for borrower/investor roles; it does not offer administrator self-registration.
- Navigation and account controls reflow for narrow screens. Auth cards and workspace content use the shared light/dark theme tokens and selected blue/white/charcoal palette.
- Form labels, status and alert roles, visible focus styling, disabled in-flight actions, and reduced-motion support are included.
- Styling is in `src/styles/components/auth.css`; the app page and route pages compose components rather than defining UI styles inline.

## Tests authored

`tests/lib/client/auth-access.test.ts` covers:

- role-specific home routes and multi-role landing priority;
- denial of unrelated/unknown roles, including a lookalike path boundary;
- filtering navigation to persisted roles;
- safe same-site return paths and rejection of external or ambiguous paths.

These tests were authored but not run. The repository does not yet have a selected browser/component harness for exercising form interactions or navigation end to end. Runtime verification remains outstanding.

Additional tests authored but not run:

- `tests/contracts/registration-contract.test.ts`: role/profile matching, multiple roles, administrator rejection, email normalization, password bounds, and strict fields.
- `tests/api/authentication.integration.test.ts`: registration with both roles, password hashing, immediate activation, no session until login, duplicate email rejection, and invalid role/weak password rejection.
- `tests/api/borrower-api.integration.test.ts`: borrower-scoped repayment history, persisted component/reference values, pagination, and unauthenticated access rejection.

## Files added or changed for WP9.3

- `src/lib/client/auth-access.ts`
- `src/components/auth/auth-provider.tsx`
- `src/components/auth/application-shell.tsx`
- `src/components/auth/login-form.tsx`
- `src/components/auth/role-guard.tsx`
- `src/components/auth/workspace-placeholder.tsx`
- `src/components/auth/registration-form.tsx`
- `src/lib/contracts/registration.ts`
- `src/lib/auth/register-user.ts`
- `src/app/api/auth/register/route.ts`
- `src/app/register/page.tsx`
- `src/app/api/borrower/repayments/route.ts` (adds collection `GET`; existing submission `POST` retained)
- `src/app/login/page.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/borrower/**`
- `src/app/investor/**`
- `src/app/admin/**`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/globals.css`
- `src/styles/components/auth.css`
- `tests/lib/client/auth-access.test.ts`
- `tests/contracts/registration-contract.test.ts`
- `tests/api/authentication.integration.test.ts`
- `tests/api/borrower-api.integration.test.ts`
- `docs/api/authentication.md`
- `docs/api/borrower-api.md`
- `docs/api/api-overview.md`
- `docs/NEXUS_WP9_1_Frontend_Audit_and_UI_API_Map_2026-11-21.md`
- This report

## Static review and limits

`git diff --check` completed without whitespace errors. Git emitted line-ending conversion notices for existing tracked edits. No test runner, application server, linter, typechecker, or build was started.

The role guard is not a security boundary by itself. It improves route behavior and prevents accidental display of role-specific screens, while the existing backend authentication and authorization checks remain authoritative. Role workflow pages are placeholders until WP9.4–WP9.6.

## Completion status

The WP9.3 frontend shell, local/OIDC sign-in, logout, self-registration, role routing, and registration contract/API are authored. The borrower repayment-history API prerequisite for WP9.4.1 is also resolved. Focused tests are authored but execution and framework-level verification remain outstanding under the current no-run instruction. Detailed role workflows remain in their planned later work packages.
