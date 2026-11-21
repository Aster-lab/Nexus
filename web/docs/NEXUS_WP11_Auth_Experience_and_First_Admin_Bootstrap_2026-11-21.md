# NEXUS — Registration UX and First Administrator Bootstrap

**Workstream:** WP11 stabilization follow-up  
**Date:** 2026-11-21  
**Status:** Registration, initial-admin, notification API/UI, and core event producers implemented; focused tests added but not run in this pass.

## Decisions applied

- Borrower and investor self-registration remain open. One account may select both roles; ADMIN cannot be self-selected.
- Registration stays immediately usable for the MVP. Email verification is not introduced in this change.
- Thai address entry uses a bundled/offline data package, loaded only after Borrower is selected.
- The first administrator is created through a one-time interactive CLI. There is no public HTTP registration path for ADMIN and no hard-coded credentials.
- The existing model has no username field, so the form does not invent one. Email is the sign-in identifier; legal and display names have clear length limits.
- UX uses a calm, guided sequence and clear review. It does not use urgency or scarcity cues.

## Registration changes

`src/components/auth/registration-form.tsx` now guides a user through **account type → details → review**. Borrower and Investor roles are selectable independently. The review step clearly states that account creation does not submit a loan application or make an investment.

The form now:

- Normalizes email to lowercase and limits it to 254 characters.
- Requires borrower legal names of 2–150 characters and investor display names of 2–60 characters. Thai and other Unicode names are accepted.
- Keeps the password policy aligned with the existing authentication contract: 12–128 characters.
- Adds accessible show/hide password controls on registration and login.
- Collects a required borrower street address and dependent Province → District → Subdistrict dropdowns restricted to Thailand.
- Autofills the postal code when the selected subdistrict has one code, and asks the user to choose when the source data has multiple codes.
- Preserves entered details after recoverable registration errors and prevents repeat submission while pending.
- Uses Tailwind utilities and existing NEXUS shadcn-style `Button` components, with registration presentation rules in `src/styles/components/registration.css`.

The authoritative registration API schema was tightened in `src/lib/contracts/registration.ts` to match email and name limits. Profile addresses continue to be stored in the backend's existing versioned address object; there is no new address API contract.

Thai location data comes from `@geothai/core`, loaded on demand after Borrower is selected. It is bundled for offline use and does not call an external address service. Attribution and licensing are recorded in `THIRD_PARTY_NOTICES.md`.

## Initial administrator provisioning

New files:

- `src/lib/auth/bootstrap-admin.ts` — transactional first-admin creation.
- `scripts/bootstrap-admin.ts` — interactive CLI with hidden password input.
- `tests/services/admin-bootstrap.test.ts` — focused guard, account creation, and audit-event tests.

The bootstrap operation:

1. Takes a PostgreSQL transaction advisory lock.
2. Refuses if any ADMIN role assignment already exists, including a revoked assignment.
3. Requires the ADMIN role to have been seeded and rejects an already registered email.
4. Hashes the password using the existing scrypt mechanism.
5. Creates an ACTIVE user and ADMIN role grant in one serializable transaction.
6. Records a high-severity `ADMIN_BOOTSTRAP` security event in that transaction.

The CLI checks the configured database URL fingerprint before connecting. Development requires a loopback PostgreSQL host. Production requires a non-loopback host, `--confirm-production`, and an exact interactive confirmation phrase. Both environments require an interactive terminal so the password is not echoed.

### Local MVP command

Seed the local development database first if the ADMIN role has not been seeded, then run:

```powershell
npm run db:seed:dev
npm run admin:bootstrap
```

Use the email and password prompts to provision the first administrator. Do not pass the password as a command-line argument or environment variable. The command refuses to create another admin once an assignment exists.

For production, run `npx tsx scripts/bootstrap-admin.ts --confirm-production` from the protected deployment environment with its production `DATABASE_URL`, `DATABASE_ENV=production`, and matching `DATABASE_URL_SHA256`. The operator must have direct, approved access to that environment.

## Dashboard personalization

- Borrower dashboard already greets the borrower using the legal name or account email.
- Investor dashboard now greets the investor using their display name, falling back to email.
- Administrator dashboard now greets the signed-in administrator using email.
- No balances or loan values are synthesized for these changes.

## Notification center and API

The user approved adding authenticated notification list/read APIs and an optional internal destination field.

- `Notification.actionPath` is optional and constrained by a database check to internal borrower, investor, or administrator routes.
- `GET /api/notifications` returns only the current user's notifications, unread count, and pagination. It supports `status=UNREAD|READ`.
- `PATCH /api/notifications/{notificationId}/read` is owner-scoped and idempotent. Another user's notification is returned as not found.
- API output only retains a destination path if it is same-origin, is not an API path, and matches one of the caller's roles.
- The application shell now displays a responsive bell panel with unread count, All/Unread filters, mark-as-read, empty/loading/error states, retry, and a safe link when the notification has an allowed destination.
- The read/read-status API does not create notifications or modify financial information. Source workflows persist notices in their own transactions.

Migration `20261121120000_notification_action_path` adds the column and database constraint. Prisma Client was regenerated, but the migration has not been applied to the development or test database.

## Focused tests added or updated

- `tests/components/registration-form.test.tsx`
- `tests/components/login-form.test.tsx`
- `tests/contracts/registration-contract.test.ts`
- `tests/services/admin-bootstrap.test.ts`
- `tests/api/notification-api.integration.test.ts`
- `tests/components/notification-center.test.tsx`
- `tests/lib/client/notifications.test.ts`
- Existing investor and administrator dashboard tests now assert personalized greetings.

Tests were deliberately not run in this pass. No full suite, lint, or build was run.

## Remaining UX audit findings

- Scheduled repayment reminders remain unsupported because no scheduling/worker path is wired to the notification system. The due date and repayment amount continue to be shown in the borrower's existing dashboard and loan screens.
- Borrower, Investor, and Administrator dashboards already have backend-driven role-specific summaries, independent resource states, and quick links. Borrower and Investor include personalized greetings; Administrator now does as well.
- Wallet transaction views are backed by role-scoped wallet APIs. Search/date/type filtering must only be added if the endpoint supports those filters or is extended accordingly.
- A repayment calculator must not recompute an authoritative schedule in the browser. A preview should use a backend quote/preview API if one is added; actual offer and schedule values must continue to come from backend responses.
- The application, loan, repayment, payout, and marketplace pages already exist. The next UI pass should refine their step-by-step guidance and confirmation states against their current APIs, rather than duplicating financial rules.

## Verification limits

Only `git diff --check` was used for whitespace review, and Prisma Client was generated from the updated schema. Tests, TypeScript, lint, and build were not run. The new interactive CLI has not been exercised against either database. The notification migration remains unapplied. Before creating an actual admin account, verify `.env` targets the intended local PostgreSQL database and confirm the ADMIN role is present.
