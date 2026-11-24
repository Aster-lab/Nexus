# NEXUS Web Application

The Next.js App Router application for NEXUS. It contains borrower, investor, and administrator workspaces, authenticated APIs, Prisma schema and migrations, and web tests.

For the full architecture, local setup, database safeguards, demo workflow, staging, deployment, and feature limitations, see the [repository README](../README.md).

## Quick start

1. Configure PostgreSQL and `web/.env` by following [`docs/LOCAL_POSTGRES_SETUP.md`](docs/LOCAL_POSTGRES_SETUP.md).
2. Install dependencies with `npm.cmd install`.
3. Apply migrations and seed platform reference data:

   ```powershell
   npm.cmd run db:deploy:dev
   npm.cmd run db:seed:dev
   ```

4. Start the application with `npm.cmd run dev` and open `http://localhost:3000`.

The application uses simulated THB balances and transactions only. Do not use demo or test setup commands against a hosted production database.
