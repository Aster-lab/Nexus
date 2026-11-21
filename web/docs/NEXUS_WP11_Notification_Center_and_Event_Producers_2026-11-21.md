# NEXUS — Notification Center and Workflow Producers

**Workstream:** WP11 UX stabilization  
**Date:** 2026-11-21  
**Status:** Implementation complete; focused tests added but not run in this pass.

## Scope and decisions

The user approved authenticated notification list/read APIs, an optional internal destination field, and event producers for application decisions, offers, investment updates, repayment posting, and payouts. Notifications are persisted as ordinary in-app notices. They do not change wallet, loan, installment, ledger, repayment, or allocation data.

Scheduled repayment reminders are excluded because the project has no scheduler/worker wired to this notification table. Existing repayment dashboard and loan screens remain the source of upcoming due dates.

## Schema and migration

- `Notification.actionPath` is optional and capped at 500 characters.
- Migration `prisma/migrations/20261121120000_notification_action_path/migration.sql` adds `action_path` plus a check that only allows internal borrower, investor, or admin route prefixes and excludes control characters.
- `src/generated/prisma` was regenerated with Prisma 7.10.1.
- The migration was not applied to either local database.

## API behavior

### `GET /api/notifications`

- Requires an active authenticated session.
- Restricts every query and count to the current user's ID.
- Returns latest items, `unreadCount`, and pagination metadata.
- Supports `status=UNREAD|READ`, `page`, `limit`, `sortBy=createdAt`, and `sortOrder` through the shared pagination parser.
- Returns `actionPath` only when it is same-origin, not an API route, and belongs to one of the caller's roles.
- Sends `Cache-Control: no-store` through the shared API response helper.

### `PATCH /api/notifications/{notificationId}/read`

- Requires an active authenticated session and a UUID route parameter.
- Updates only a matching notification owned by the caller.
- Returns 404 for another user's notification so ownership cannot be probed.
- Repeated mark-as-read requests return the already-read record successfully.

## Notification center

`src/components/shared/notification-center.tsx` is mounted inside the authenticated application shell. It provides:

- A bell button with a screen-reader name and unread count badge.
- All and Unread filters, refresh, retry, empty, loading, and error states.
- Read/unread labels and a separate mark-as-read control.
- A role-scoped internal link when the backend provides an allowed action path.
- Responsive panel sizing and NEXUS light/dark theme tokens.

## Transactional event producers

`src/lib/services/notification.service.ts` provides a small helper that writes through the caller's Prisma transaction. Any failure to persist a notification aborts the source operation, so no success notice can outlive a rolled-back business operation.

| Source workflow | Recipient | Notice |
| --- | --- | --- |
| Administrator approves/rejects a loan application | Borrower | Application status update linking to application details |
| Administrator issues an offer | Borrower | Offer ready to review linking to offers |
| Investor contribution is posted | Contributing investor | Contribution confirmed linking to portfolio |
| Loan becomes fully funded | Borrower and every active investor in that loan | Funding complete linking to loans or portfolio |
| Repayment is posted | Borrower | Repayment confirmed linking to repayment history |
| Investor payout completes | Investor | Payout completed linking to payout history |

Idempotent replays that reuse an existing contribution, repayment, or payout return before creating another notice. Notices are inserted only along the successful transaction path.

## Focused tests written

- `tests/api/notification-api.integration.test.ts` covers unauthenticated access, owner scoping, filters, safe internal links, idempotent read, and cross-user denial.
- `tests/components/notification-center.test.tsx` covers the initial accessible notification control.
- `tests/lib/client/notifications.test.ts` covers query construction and list/read client calls.
- `tests/services/notification.service.test.ts` covers unread status and optional destination persistence.
- `tests/api/admin-api.integration.test.ts` asserts application-decision and offer notices.
- `tests/services/investor-contribution.service.test.ts` asserts contribution and full-funding notices.
- `tests/services/repayment-submission.integration.test.ts` asserts posted repayment notice creation.
- `tests/services/investor-payout.integration.test.ts` asserts completion notice creation.

No tests, TypeScript check, lint, or build were run. Only Prisma Client generation and a whitespace check were performed. Apply the migration before running notification API/integration tests.

## Remaining boundary

The feature does not send email or push notifications. `NotificationDelivery` remains unchanged. The UI only reflects persisted in-app notification records; scheduled reminders require a separately designed worker.
