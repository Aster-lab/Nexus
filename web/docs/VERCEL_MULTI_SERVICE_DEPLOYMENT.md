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

This Vercel config does not migrate or seed PostgreSQL. Apply committed migrations and required reference/platform seeds to the separate staging database before using application workflows. Do not run demo reset/setup against staging.

The current first-admin CLI does not accept `DATABASE_ENV=staging`; it only accepts development or production. Do not label staging as production to bypass this guard. Add and review explicit staging safeguards before provisioning the first staging administrator.

## Local development

Use `vercel dev` from the repository root to run the configured services together after installing the Vercel CLI and linking the project. The Python service still requires its Python dependencies and a valid `ML_SERVICE_TOKEN`. The ordinary local Next.js command continues to use the local `ML_SERVICE_URL` in `web/.env` and the separately started FastAPI process.

## Verification state

- Confirmed the existing FastAPI entrypoint, endpoint paths, token check, model paths, and all three Next.js-to-ML request call sites by source inspection.
- `vercel.json` and the shared ML URL helper are prepared for review.
- No Vercel deployment, database migration, ML service startup, browser journey, or test suite was run as part of preparing this configuration.
