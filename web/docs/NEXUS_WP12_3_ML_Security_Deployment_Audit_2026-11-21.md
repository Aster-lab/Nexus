# WP12.3 — ML, Security, and Deployment Audit

Date: 2026-11-21  
Status: Static audit complete; no ML model or financial behavior changed. Deployment/provider selection remains open.

## Python ML service

- The FastAPI lifespan constructs one `RiskEngine` per running process and releases it on shutdown. The seven serialized artifacts load during service startup, not once per request. This already meets the model-lifecycle optimization requirement.
- Both NEXUS prediction routes validate response contracts and use a 10-second timeout. The dynamic recommendation candidate query is capped at 200 rows.
- Python dependency requirements are pinned. No ML tests or performance scripts were run.
- Prediction remains unavailable for the MVP until an authorized NEXUS THB labeled dataset/model gate is completed. No retraining or algorithm change is included in WP12 optimization.
- Deployment must bundle the `ML/models` artifacts with the Python service image/runtime. Confirm artifact provenance and licensing before external deployment.

## Security/configuration findings and change

- The custom NEXUS session cookie is `HttpOnly`, `SameSite=Lax`, path-scoped, and `Secure` in production; database session tokens are hashed before persistence.
- Local login applies database-backed, HMAC-keyed rate limits. The `.env.demo.example` now includes separate placeholders for `NEXTAUTH_SECRET` and `AUTH_RATE_LIMIT_SECRET`; replace both with strong secrets before demo use.
- Local `.env` files remain ignored. A tracked-file name scan found only the committed environment template; no actual local or production secret file was opened or copied.
- Login rejects a mismatching `Origin` header. The app has no broad CORS middleware/configuration in the audited paths; browser APIs are same-origin. Rate-limit IP extraction uses forwarded-IP headers, so the deployment proxy must overwrite/sanitize them and direct untrusted access to the app must be blocked.
- `next.config.ts` now emits `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin` on all routes. Correlated config coverage was added but not run.
- A Content Security Policy and HSTS were not added: the app injects an inline pre-hydration theme script, and the deployment hostname/TLS boundary is not yet selected. A CSP needs a nonce/hash plan; HSTS must be tied to the public HTTPS origin.

## Deployment work still required

- Choose a hosting region/provider and confirm the web runtime, Python runtime, PostgreSQL offering, monthly cost, backups, and recovery features.
- Provision a production database separate from development, test, and demo. Configure a bounded PostgreSQL pool suitable for the chosen provider.
- Supply distinct production secrets for session signing, rate limits, ML service auth, prediction persistence, OAuth, and database access.
- Configure a trusted reverse proxy that sanitizes forwarded headers and terminates HTTPS; then enable HSTS for the confirmed public origin.
- Package the Python artifacts and pinned dependencies into deployment. Prediction remains feature-disabled until the model-data blocker is cleared.
- Prepare migration/rollback and backup restoration steps on a staging environment before production deployment.

## Verification boundary

This report is based on static source inspection only. Tests, lint, build, ML performance scripts, provider pricing checks, and staging runtime checks were not run.

