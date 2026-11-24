# NEXUS

NEXUS is a role-based, simulated peer-to-peer micro-lending platform. Borrowers manage applications and repayments, investors review eligible opportunities and track investments, and administrators oversee policies and financial operations.

> **Simulation notice:** NEXUS does not connect to banks or move real money. Wallet balances, investments, repayments, and payouts are simulated and recorded in the platform ledger.

## Product scope

- Borrower applications, review, offers, loan schedules, repayments, and receipts.
- Investor marketplace, contributions, portfolio, allocations, payouts, and preference-based recommendations.
- Administrator policy governance, application and loan operations, payout processing, user oversight, financial reconciliation, and audit logs.
- Role-aware dashboards, profiles, in-app notifications, responsive navigation, onboarding tours, and user guides.
- Python ML service integration. Borrower risk predictions remain unavailable until an approved NEXUS dataset and model are ready. Investor recommendation scores represent preference similarity, not risk or expected return.

Email notifications and real deposits or withdrawals are outside the current MVP scope.

## Architecture

| Service | Location | Purpose |
| --- | --- | --- |
| Web application and API | `web/` | Next.js App Router, React, TypeScript, Tailwind CSS, authenticated API routes, and lending/financial workflows |
| Data store | PostgreSQL through Prisma | Authoritative profiles, policies, applications, loans, wallets, ledger, repayments, payouts, and audit data |
| ML service | `ML/` | Python FastAPI service for supported inference and recommendation contracts |
| Deployment | `vercel.json` | Vercel multi-service configuration; web calls the internal ML service through a binding |

Core financial writes are owned by the NEXUS web backend. Posted ledger entries are balanced and immutable; corrections use compensating records. The browser displays backend-provided balances, schedules, statuses, and payable amounts.

## Repository layout

```text
Nexus/
├── Diagrams/          System and workflow diagrams
├── ML/                FastAPI service, model code, and Python tests
├── web/               Next.js application, Prisma schema/migrations, and web tests
├── vercel.json        Multi-service deployment configuration
└── README.md
```

More detailed setup, API, testing, deployment, and user documentation is in [`web/docs/`](web/docs/). The borrower, investor, and administrator manual is [`web/docs/NEXUS_User_Manual_Borrower_Investor_Admin.md`](web/docs/NEXUS_User_Manual_Borrower_Investor_Admin.md).

## Local development

### Requirements

- Node.js compatible with the version used by the project and npm.
- PostgreSQL for web persistence.
- Python compatible with the pinned packages in `ML/requirements.txt` if running the ML service locally.

### Configure the web app

In PowerShell, open the web application directory and install the dependencies:

```powershell
cd web
npm.cmd install
```

Create local PostgreSQL databases and ignored environment files by following [`web/docs/LOCAL_POSTGRES_SETUP.md`](web/docs/LOCAL_POSTGRES_SETUP.md). Keep development and test databases separate. Configure `web/.env` with the local database URLs, `DATABASE_ENV=development`, the matching `DATABASE_URL_SHA256`, an `AUTH_RATE_LIMIT_SECRET` of at least 32 characters, and local ML settings if needed. Do not commit `.env` files or share secret values.

Apply committed migrations, seed platform reference records, and start Next.js:

```powershell
npm.cmd run db:deploy:dev
npm.cmd run db:seed:dev
npm.cmd run dev
```

Open `http://localhost:3000`.

### Run the ML service locally

From a second terminal, make `ML_SERVICE_TOKEN` available in the process environment with the same value configured in `web/.env`, then install and start the service. The `ML/.env.example` file documents the variable but Uvicorn does not load it automatically.

```powershell
cd ML
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

Set `web/.env` `ML_SERVICE_URL` to `http://127.0.0.1:8000`. Keep service tokens server-side.

## Demo environment

The local demo uses a separate, disposable loopback PostgreSQL database named `nexus_demo`. It must not point to staging or production. Follow the guarded steps in [`web/docs/NEXUS_Demo_Mode_and_Pre_WP12_Review_2026-11-22.md`](web/docs/NEXUS_Demo_Mode_and_Pre_WP12_Review_2026-11-22.md), then use:

```powershell
npm.cmd run demo:setup
npm.cmd run demo:start
```

Demo setup prints generated account passwords once. Store them securely. Setup creates platform roles, policies, platform accounts, and demo identities; it does not fabricate loan, repayment, payout, or ledger history. Use the application’s approved workflows to create simulated activity.

## Useful web commands

Run commands from `web/`:

| Command | Purpose |
| --- | --- |
| `npm.cmd run dev` | Start the local web app |
| `npm.cmd run build` | Create a production build using the configured Webpack build |
| `npm.cmd run lint` | Run ESLint |
| `npm.cmd test` | Run the guarded Vitest suite against `.env.test` |
| `npm.cmd run test:e2e` | Run local Playwright browser checks |
| `npm.cmd run test:e2e:staging` | Run staging Playwright checks configured through `.env.staging` |
| `npm.cmd run db:status:staging` | Check staging migration status using `.env.staging.runtime` |
| `npm.cmd run db:migrate:staging` | Apply committed migrations to the guarded staging database |
| `npm.cmd run db:seed:staging` | Seed staging platform reference records |
| `npm.cmd run admin:bootstrap:staging` | Interactively provision the first staging administrator |

Database-backed tests are guarded to use the isolated `nexus_test` database. Never aim tests, demo reset, or staging commands at production. Production migrations and bootstrap require a separate reviewed operator procedure.

## Staging and deployment

The root [`vercel.json`](vercel.json) declares `web` as the public service and `ml` as an internally bound service. Vercel provides the `ML_SERVICE_URL` binding to the web service. Configure environment variables separately for Preview and Production, and point each at its own PostgreSQL database. Do not manually override the service binding in Vercel.

For staging environment setup and certification steps, see [`web/docs/VERCEL_MULTI_SERVICE_DEPLOYMENT.md`](web/docs/VERCEL_MULTI_SERVICE_DEPLOYMENT.md) and [`web/docs/NEXUS_Browser_E2E_and_Staging_Certification.md`](web/docs/NEXUS_Browser_E2E_and_Staging_Certification.md). Deployment readiness depends on more than a successful build: verify database identity, migrations, active policies and platform accounts, service connectivity, backups, and the controlled cross-role workflow.

## Security and financial safeguards

- Keep production secrets in the hosting provider’s environment settings or a protected local operations file; never commit them.
- Use separate databases and credentials for development, tests, demo, staging, and production.
- Keep database URLs server-side and URL-encode reserved password characters.
- Never edit wallet projections, posted ledger transactions, repayment records, or payouts directly in the database to create demo data.
- Confirm consequential financial actions through the UI and rely on the backend for eligibility, balance, schedule, idempotency, and ownership checks.
- Investor-facing borrower information is limited to approved marketplace disclosure fields.

## Project status notes

NEXUS is deployed, and the repository contains substantial local automated verification. Production acceptance should be based on a current recorded end-to-end workflow and operational checks, not deployment status alone. Borrower risk predictions remain disabled until the model and data approval requirements are met.
