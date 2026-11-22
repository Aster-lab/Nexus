# NEXUS Vercel Multi-Service Deployment

**Prepared:** 2026-11-22  
**Purpose:** Deploy the Next.js app and FastAPI ML API from the NEXUS monorepo as one Vercel project.

## Deployment topology

The repository-root `vercel.json` declares two services:

| Service | Root | Framework / entrypoint | Public access |
| --- | --- | --- | --- |
| `web` | `web/` | Next.js | All incoming paths, including `/api/*` |
| `ml` | `ML/` | FastAPI, `main:app` | Internal only; no public rewrite targets it |

The `web` service binds to `ml` and receives the generated service URL as `ML_SERVICE_URL`. The ML service is not mounted at `/ml`, `/predict`, or another public path. Public requests are routed to Next.js; its server-side route handlers call FastAPI using the service binding.

Only `web` calls `ml`. The binding is declared on `web`; there is no reverse binding. Vercel bindings provide service discovery/reachability, not application authentication. NEXUS continues sending `X-ML-Service-Token`, and FastAPI continues validating it.

The repository-root config means the Vercel project root must be the **repository root**, not `web/`. The configured service roots are relative to the location of `vercel.json`.

## Code compatibility

NEXUS API handlers read `ML_SERVICE_URL` and use the shared `src/lib/services/ml-service-url.ts` helper. The helper resolves `predict` and `recommendations` relative to the injected URL so any binding path prefix is preserved. It also works with local URLs such as `http://127.0.0.1:8000`.

Do not manually set `ML_SERVICE_URL` in Vercel Preview or Production settings. A manually configured value with the same name can override the generated binding value. Keep a local `ML_SERVICE_URL` in `web/.env` for local development if needed.

## Vercel environment variables

Configure these per Vercel environment. Preview should use staging-only database and account data; Production should be configured separately.

### Used by the web service

- `DATABASE_URL` — database connection string for that environment.
- `NEXTAUTH_SECRET` — unique secret for that environment.
- `AUTH_RATE_LIMIT_SECRET` — independent random secret of at least 32 characters.
- `NEXTAUTH_URL` — canonical HTTPS URL for that environment.
- `ML_SERVICE_TOKEN` — random secret of at least 32 characters; this same value must be available to the ML service.
- `PREDICTION_PERSIST_TOKEN` — separate random secret used by the prediction persistence route.
- `DATABASE_POOL_MAX` — optional PostgreSQL pool limit; current production default is 2 per web function instance.
- `NEXUS_OIDC_ISSUER`, `NEXUS_OIDC_CLIENT_ID`, and `NEXUS_OIDC_CLIENT_SECRET` — configure together only when OAuth is enabled.

### Used by the ML service

- `ML_SERVICE_TOKEN` — must match the web service's value for the same deployment environment.

Do not set `ML_SERVICE_URL` manually. Do not set `NEXUS_DEMO_MODE=true` for staging or production. Keep all database, auth, and ML secrets server-side; none should use a `NEXT_PUBLIC_` prefix.

## ML deployment considerations

- `ML/main.py` exports `app` and loads the risk model during FastAPI lifespan startup.
- Model pickle files live under `ML/models/`; the combined current artifact files are small, but dependencies such as NumPy, SciPy, pandas, and scikit-learn determine the deployment bundle and cold-start cost.
- Vercel services and Python function support have platform limits. Confirm the current account has access to Vercel Services and verify the built FastAPI service includes model files and can initialize. Measure cold-start latency before enabling predictions for real users.
- The prediction feature can remain unavailable until the deployment has been validated and an approved model dataset/decision is ready. Deploying the service does not itself enable official predictions or train a model.

## Database and first-admin readiness

This Vercel config does not migrate or seed PostgreSQL. The project now includes guarded staging commands. They require `DATABASE_ENV=staging`, a non-loopback PostgreSQL URL, a SHA-256 fingerprint matching the exact `DATABASE_URL`, and they reject the known `nexus_dev`, `nexus_test`, and `nexus_demo` database names. Staging cannot use the destructive database reset command.

### Prepare the local staging operations file

Create `web/.env.staging.runtime` locally. This file is Git-ignored and is separate from `web/.env.staging`, which contains browser E2E credentials. Do not commit or share the runtime file.

```dotenv
DATABASE_URL="postgresql://USER:URL_ENCODED_PASSWORD@HOST:5432/STAGING_DATABASE?sslmode=require"
DATABASE_ENV=staging
DATABASE_URL_SHA256=FILL_WITH_FINGERPRINT
```

Use the connection URL for the separate staging database. URL-encode reserved characters in its password. Generate the fingerprint from the exact `DATABASE_URL` value without printing the URL:

```powershell
npx dotenv run -f .env.staging.runtime -- node -e "process.stdout.write(require('node:crypto').createHash('sha256').update(process.env.DATABASE_URL).digest('hex') + '\n')"
```

Put the output in `DATABASE_URL_SHA256`, then run the staging status check:

```powershell
npm run db:status:staging
```

If the URL and fingerprint are verified and the target is the intended staging database, apply committed migrations and platform reference seeds:

```powershell
npm run db:migrate:staging
npm run db:seed:staging
```

Then create the first staging administrator through the interactive CLI:

```powershell
npm run admin:bootstrap:staging
```

The CLI requires `DATABASE_ENV=staging`, matching URL fingerprint, a remote PostgreSQL host, the `--confirm-staging` flag (provided by the npm script), an exact staging confirmation phrase, and re-entry of the administrator email. It prompts for the password without echoing it and still refuses if any ADMIN role assignment already exists. It never accepts a Production URL relabeled as staging solely to bypass validation; the operator must verify the separate staging database URL before running it.

After deployment, make sure Preview `DATABASE_URL` points to this same staging database. Vercel provides `ML_SERVICE_URL` through the binding; do not override it manually. Set the Preview `ML_SERVICE_TOKEN` for the web and ML services to the same random secret. The prediction feature still depends on the existing approved model/data readiness decision and remains unavailable until explicitly enabled.

Never run `db:reset:*`, demo reset/setup, or Production admin bootstrap against staging. The staging database must remain separate from Production and the disposable demo database.

## Local development

Use `vercel dev` from the repository root to run the configured services together after installing the Vercel CLI and linking the project. The Python service still requires its Python dependencies and a valid `ML_SERVICE_TOKEN`. The ordinary local Next.js command continues to use the local `ML_SERVICE_URL` in `web/.env` and the separately started FastAPI process.

## Verification state

- Confirmed the existing FastAPI entrypoint, endpoint paths, token check, model paths, and all three Next.js-to-ML request call sites by source inspection.
- `vercel.json` and the shared ML URL helper are prepared for review.
- No Vercel deployment, database migration, ML service startup, browser journey, or test suite was run as part of preparing this configuration.
