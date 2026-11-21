# WP12.8 — Financial Read Indexes and Ledger Detail Boundaries

Date: 2026-11-21
Status: Schema and migration changes prepared; migration and query plans not run.

## Indexes added

- `ledger_transactions(status, posted_at)` supports the administrator financial activity view, which filters by status and sorts by posting time.
- `repayments(status, received_at)` supports the administrator repayment list's status filter and received-time order.
- `payout_allocations(repayment_id, created_at)` supports the new repayment-scoped allocation history page and its date ordering.

The Prisma schema and a forward-only SQL migration were updated together. No existing financial records or constraints are changed.

## Ledger entry detail boundary

The admin ledger transaction list retains all entries per transaction. Existing posting paths write two balanced entries, while compensation reverses each original entry one-for-one. Truncating entries could hide part of the accounting evidence or make the detail appear unbalanced, so the nested entries are not capped. This conclusion is based on static inspection of the current posting services and has not been tested against production data or direct database writes.

## Verification and follow-up

No tests, lint, build, typecheck, migration, or database query plan was run. Before applying the migration, inspect `EXPLAIN (ANALYZE, BUFFERS)` on representative local data and confirm the indexes are selected. Check write overhead and index size after realistic volume tests.
