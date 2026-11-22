# NEXUS Pre-Staging Code Optimization Review

**Review date:** 2026-11-22  
**Scope:** Static review of the current web code, database query patterns, and existing WP12 optimization records. No database was queried and no financial behavior was changed.  
**Financial invariant:** Repayment, payout, ledger posting, idempotency, serialization, and reconciliation semantics must remain unchanged during performance work.

## Applied low-risk optimization

`src/lib/prisma.ts` now passes an explicit `max` connection limit to the PostgreSQL adapter. `DATABASE_POOL_MAX` can override it, invalid values fail during initialization, the default is 2 connections per application process in production and 10 outside production. This avoids inheriting the `pg` pool default of 10 for every Vercel process while keeping local development behavior unchanged. `.env.example` documents the setting.

The final production value still needs to be sized against Vercel's maximum concurrent function instances and the selected Prisma Postgres plan. A per-instance cap alone cannot guarantee the global connection total when the platform scales out.

## Reviewed opportunities

### 1. Platform-wide reconciliation scans

`financial-reconciliation.service.ts` loads all posted ledger transactions and entries, all wallet ledger entries, all repayments and allocations, and all installments into application memory within a repeatable-read transaction. `investor-payout-reconciliation.service.ts` similarly reads the full posted ledger, all wallets and entries, and all allocations. These reads are intentionally comprehensive and read-only, but their memory/time cost grows with platform history; the payout report already required an increased transaction timeout.

**Recommendation:** before production-scale data, capture row counts, duration, memory, and PostgreSQL query plans on representative staging data. Then consider a database-side aggregate/reporting query with targeted discrepancy-detail queries, preserving the same snapshot consistency and complete issue reporting. Do not add arbitrary row limits to a financial reconciliation report.

### 2. Administrator dashboard request fan-out

The admin dashboard independently loads ten metrics/history sections, with three user queries and three application-status queries among them. Each request is bounded and each section has independent loading/error states.

**Recommendation:** measure the browser network waterfall on staging. If latency is material, add a bounded summary endpoint or combine only the related counts. Preserve per-section failure behavior and authorization. Do not batch before measurement because it would make one endpoint failure hide otherwise healthy cards.

### 3. Borrower dashboard schedule reads

The borrower summary reads current installments for each active loan and folds them to calculate accurate outstanding balances and due items. This is not an N+1 query, and loan terms bound schedule rows, but aggregate payload grows with the borrower's active-loan count.

**Recommendation:** check row counts and API timing under realistic borrower histories. A future database aggregation can reduce data transfer, but must keep exact satang arithmetic and the same due/overdue ordering. Current installment schedules are small enough that there is no evidence for a rewrite yet.

### 4. Index migration and query plans

WP12.8 prepared indexes for administrator ledger activity, repayment history, and repayment-scoped allocation history. Its report says the migration and query plans were not applied/verified at that review point.

**Recommendation:** review migration status on the staging database, apply committed migrations using the direct migration connection, and inspect query plans on representative data. Confirm write overhead and index size before production.

### 5. Frontend requests and rendering

Dashboard history panels are bounded; refreshes use cancellation in key pages; admin sections retain independent loading and error states. No large dashboard image assets or measured render bottlenecks were identified in the source review. Financial pages correctly retrieve authoritative values from backend responses.

**Recommendation:** use the browser E2E/staging environment to record desktop/mobile request timing, transfer size, and layout behavior before considering server-component migration, client caching, request batching, or chart/lazy-loading changes. Avoid caching user-specific financial responses without an explicit authorization and freshness design.

## Staging checks still needed

- Configure `DATABASE_POOL_MAX` for the selected Vercel scale and Prisma Postgres connection limits.
- Confirm `DATABASE_URL` uses the pooled runtime endpoint and `DIRECT_URL` is used by migrations/administration where appropriate for the chosen provider configuration.
- Apply and verify all migrations against a separate staging database.
- Capture representative query plans and report timings for reconciliation and dashboard endpoints.
- Run browser checks using dedicated role accounts; the current E2E suite does not submit financial actions.
- Verify backup and restore, secrets, and service connectivity in the deployed environment.

## Verification

The pool configuration was reviewed against the installed `@prisma/adapter-pg` type, whose constructor accepts PostgreSQL `PoolConfig`. TypeScript and focused ESLint were run for the current work and passed. No database, full test suite, production build, or staging deployment was run as part of this optimization review.
