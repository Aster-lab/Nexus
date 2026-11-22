# NEXUS Demo Mode and Pre-WP12 Review

Date: 2026-11-22  
Status: Demo database guard and account bootstrap implemented. Administrator-controlled simulated wallet funding is available in source. Synthetic loan/repayment history remains intentionally unseeded. WP12 optimization is scoped for audit, not yet implemented.

## Demo mode decisions

- Demo data belongs in a separate, disposable local PostgreSQL database named `nexus_demo`.
- Demo accounts receive randomly generated passwords. The setup command prints them after successful provisioning; the application stores only password hashes.
- Demo activity must be labeled as simulated.
- Demo setup and reset require an interactive confirmation and reject non-loopback hosts, any database name except `nexus_demo`, and any environment other than `DATABASE_ENV=demo`.
- Starting the application with `NEXUS_DEMO_MODE=true` enforces the same database guard before Prisma connects.

## Implemented

- `.env.demo.example` documents the dedicated local connection. Copy it to `.env.demo` and fill in the local `nexus_app` password. The local `.env.demo` file is ignored by Git.
- `npm run demo:setup` validates the database, requires the exact confirmation `SET UP NEXUS DEMO`, deploys migrations, seeds platform roles/policies/accounts, refuses to provision over existing user data, and creates one administrator, borrower, and investor. It then prints each generated password once.
- Fresh setup seeds account 1300 as the active THB opening-balance asset. Migration `20261121160000_activate_opening_balance_source` activates only the exact approved account definition in existing isolated databases. It does not credit any wallet.
- Fresh setup and reset approve and activate only the seeded version-one `LOAN_OFFER_POLICY`, `LOAN_INTEREST_POLICY`, `PLATFORM_FEE_POLICY`, and `REPAYMENT_POLICY` versions for the isolated demo. The guarded activation validates the demo environment, requires the active `demo-admin@nexus.local` account, rejects unexpected/edited versions, and records the admin actor in audit logs. This enables application/offer/schedule demo workflows without changing production policy state. It does not activate the notification policy or any future policy versions.
- For an existing demo database, `npm.cmd run demo:activate-policies` uses `.env.demo`, verifies the same loopback/database/environment guard, requires interactive confirmation `ACTIVATE NEXUS DEMO POLICIES`, and activates only the approved initial lending policies. It does not reset data or credentials.
- Borrower and investor profiles receive active zero-balance THB wallets. Migration `20261121150000_provision_user_wallets` backfills existing profiles without ledger entries or funds.
- An authorized administrator can use **Admin → Financial → Wallet balances → Assign initial balance**. The action requires a reason and confirmation and posts through the atomic ledger-backed opening-balance service. It does not directly edit a wallet balance. Each recipient wallet can receive one opening balance; later corrections require the existing compensation process.
- `npm run demo:reset` only operates against the guarded demo database. It permanently resets that database after the exact confirmation `RESET NEXUS DEMO`, recreates the platform seed, and prints newly generated credentials.
- `npm run demo:start` starts Next.js with `.env.demo` loaded.
- The application shell displays a responsive light/dark notice that marks the environment and its balances, investments, and transactions as simulated.
- Tests were added for demo database URL restrictions, generated-password shape/uniqueness, and the visible demo notice. Per instruction, they have not been run.

### Setup sequence

1. Create an empty local PostgreSQL database named `nexus_demo` owned by the local application role.
2. Copy `.env.demo.example` to `.env.demo`, set the local password, and replace both secret placeholders with different random values of at least 32 characters.
3. Run `npm run demo:setup` from the `web` directory and save the generated passwords securely.
4. Run `npm run demo:start`, then sign in with the exact email and password printed by setup. Generated emails are `demo-admin@nexus.local`, `demo-borrower@nexus.local`, and `demo-investor@nexus.local`; the `demo-` prefix is part of each address.
5. If using an existing demo database after updating code, first run `npm.cmd run demo:migrate`, then `npm.cmd run demo:activate-policies` and enter the exact confirmation above. Confirm its output reports `127.0.0.1/nexus_demo` and all four policies as `ACTIVE`. This preserves demo accounts and financial records.
6. Stop any previously running Next.js server, then start the UI with `npm.cmd run demo:start`. Plain `npm run dev` uses `.env` and may connect to a different database, which would still show the policy as unavailable.
7. To discard all demo data and create new accounts, use `npm.cmd run demo:reset` only when you intend to delete the disposable database contents; save the newly displayed passwords.

Never put hosted or production database credentials in `.env.demo`.

## Demo data boundary and open decision

The setup creates demo identities and role profiles but does not create fabricated loan/repayment histories. Admins can assign an initial simulated wallet balance through the approved posting path after migrations are applied. Demo setup activates the narrowly allowlisted initial lending policies, while the regular policy seed leaves them proposed for other environments. Directly inserting fake loans, repayments, allocations, or ledger records would bypass the normal financial lifecycle and could make the demo inconsistent.

No financial records are fabricated by this implementation. A fuller demonstration can be built later by invoking the existing application, funding, disbursement, repayment, and payout services. Email notifications are excluded from the accepted MVP scope; in-app workflow notifications remain available.

## Pre-WP12 optimization baseline

The requested optimization areas are recorded below as the WP12 audit scope. This is an initial code review, not a full performance/security verification and not a claim that WP12 is complete.

### Backend and database

- The borrower dashboard currently runs three queries in parallel. It loads active loans with each current schedule's installments, then computes payable summaries in application code. Terms cap schedule lengths, but query volume should be measured with realistic account sizes.
- The investor portfolio summary runs four parallel queries and loads contribution/payout rows to aggregate totals in application code. Assess database aggregates and bounded history reads before changing it.
- Audit all list endpoints for pagination, stable ordering, and query plans. Do not change financial transaction isolation, locks, idempotency, or retry behavior to improve throughput.
- Run fresh-database migration checks against an isolated disposable database before deployment; do not point these checks at hosted data.

### Frontend

- Review client components and request counts role by role. Use server components for non-interactive, server-authorized reads where that fits the current authentication design.
- Check long history tables for pagination or incremental loading, and keep request loading/error/empty states intact.
- Measure image/assets and loading behavior on slower connections before changing rendering or caching.

### Python ML

- The Python service was not inspected in this pass. WP12 should verify model lifetime/loading, request/response validation, unavailable-service handling, deployment artifacts, and measured latency without changing model behavior or retraining.

### Security and reliability

- Verify production secrets, database separation, session cookie configuration, trusted origins/CORS, backend role checks, rate limits, input validation, and error/log redaction against the deployment configuration.
- Review PostgreSQL pool limits alongside expected demonstration traffic and hosting limits.
- Confirm repayment/payout rollback, idempotency, and concurrency behavior remain covered by existing correlated tests; do not rerun those tests as part of this change unless requested.

### Suggested WP12 order

1. Capture a baseline and inspect query counts/data volume for borrower, investor, administrator, and ML flows.
2. Prioritize measurable N+1, unbounded history, or duplicate API request issues.
3. Implement low-risk query/UI optimizations while preserving current financial service boundaries.
4. Review deployment configuration, secrets, database limits, Python artifact/startup behavior, and recovery procedures.
5. Verify only the correlated tests and checks after explicit authorization to run them.

