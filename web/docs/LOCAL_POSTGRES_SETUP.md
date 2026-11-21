# Local PostgreSQL setup for NEXUS development and tests

## Current status

The checked-in project configuration supports separate development and test database URLs, and the safety guard verifies both `DATABASE_ENV` and a SHA-256 fingerprint of the exact `DATABASE_URL` value.

PostgreSQL 18 is installed and running on port 5432. The local provisioning script created `nexus_app`, `nexus_dev`, and `nexus_test`, and updated the ignored `.env` and `.env.test` files to use `127.0.0.1`. Hosted databases were not contacted.

Both local databases have all 35 committed Prisma migrations applied and have been seeded with roles, initial platform policies, and platform accounts. Migration status checks confirmed both schemas are up to date. No tests were run as part of database setup.

## Database separation

Use two databases on the local server:

- `nexus_dev` for `.env`
- `nexus_test` for `.env.test`

Run the PowerShell provisioning script from this `web` directory:

```powershell
.\scripts\setup-local-postgres.ps1
```

It securely prompts for the local `postgres` administrator password and a new `nexus_app` password. The application password must be at least 20 characters. The script stops without changing anything if the `nexus_app` role or either target database already exists; inspect existing objects before proceeding. It creates the role and fresh `nexus_dev`/`nexus_test` databases, writes local URLs and matching fingerprints to `.env` and `.env.test`, and never connects to the hosted database. The temporary SQL file containing the new local credential is removed after provisioning.

## Environment files

Set both `DATABASE_URL` and `DIRECT_URL` to the local connection string in each file. A local instance does not need a pooled/direct split:

```dotenv
# .env
DATABASE_URL=postgresql://nexus_app:<URL-encoded-password>@127.0.0.1:5432/nexus_dev?schema=public
DIRECT_URL=postgresql://nexus_app:<URL-encoded-password>@127.0.0.1:5432/nexus_dev?schema=public
DATABASE_ENV=development
DATABASE_URL_SHA256=<sha256-of-the-exact-DATABASE_URL-value>
AUTH_RATE_LIMIT_SECRET=<unique-random-secret-at-least-32-characters>
```

```dotenv
# .env.test
DATABASE_URL=postgresql://nexus_app:<URL-encoded-password>@127.0.0.1:5432/nexus_test?schema=public
DIRECT_URL=postgresql://nexus_app:<URL-encoded-password>@127.0.0.1:5432/nexus_test?schema=public
DATABASE_ENV=test
DATABASE_URL_SHA256=<sha256-of-the-exact-DATABASE_URL-value>
AUTH_RATE_LIMIT_SECRET=<different-unique-random-secret-at-least-32-characters>
```

URL-encode any reserved characters in the password. The fingerprint must be calculated from the exact `DATABASE_URL` string, not `DIRECT_URL`. To print the development fingerprint after loading `.env`, use:

`AUTH_RATE_LIMIT_SECRET` must be independently generated for each environment and kept server-side. The login and registration rate limiter uses it to HMAC account/network identifiers before storing security events. If it is missing or shorter than 32 characters, those authentication requests fail closed.

```powershell
dotenv run -f .env -- node -e "process.stdout.write(require('node:crypto').createHash('sha256').update(process.env.DATABASE_URL).digest('hex'))"
```

Use `-f .env.test` for the test fingerprint. Store the resulting hash as `DATABASE_URL_SHA256` in the corresponding environment file.

## Applying the schema

For a fresh database or to apply already-committed migrations, use deploy commands:

```powershell
npm run db:deploy:dev
npm run db:migrate:test
```

`db:migrate:dev` runs Prisma's interactive development migration flow, which requires the application role to create a shadow database. The local `nexus_app` role intentionally lacks that privilege, so use `db:deploy:dev` to apply committed migrations. Do not broaden the role's privileges solely to avoid this limitation.

Seed each database so the fresh local environments include platform accounts and policies:

```powershell
npm run db:seed:dev
npm run db:seed:test
```

Do not use the reset scripts as part of a connection switch; they are destructive. The hosted databases remain untouched. Do not run tests as part of this setup unless separately requested.
