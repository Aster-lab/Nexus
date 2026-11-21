# NEXUS WP11.1 — Final Verification Checklist and Carryover Audit

**Review date:** 2026-11-21  
**Status:** Runtime regression in progress; Python ML suite is now green.  
**Method:** Reviewed phase reports and ran guarded local checks, relevant web/Python regression suites, typecheck, and lint. Production build remains unrun per user instruction.

## Executive status

WP11 is now in progress. The repository contains implementation and tests across WP6–WP10, but existing reports do not provide a single clean, complete evidence set for a production-preparation gate. Several earlier reports explicitly say tests were not run, a few note only a subset passed, and WP10's newly authored cross-role journey has not been executed. The WP10 plan also remains incomplete: the current journey starts from a realistic funded/disbursed lifecycle fixture, while full application-to-offer integration, startup orchestration, browser validation, and environment evidence remain open.

This audit therefore does **not** accept the claim that WP6–WP10 are all fully verified. It records the actual verification evidence available in project documents and current test inventory. The full regression and financial/security verification stages remain to be performed.

## Evidence and open status by workstream

| Workstream | Existing evidence | WP11 carryover |
| --- | --- | --- |
| WP6 repayment | Status report records implementation and focused test attempts blocked before Vitest by `os.userInfo()` `ENOMEM`; changed-file typecheck still had generated Next route errors | Re-run focused repayment/allocation tests and validate calculation, repayment, allocation, receipt, idempotency, rollback, and schedule completion against persisted records |
| WP7 investor payout | PAY/REC contract describes service and test assertions; source includes atomic payout and reconciliation cases | Confirm which PAY/REC suites actually passed; verify clearing and wallet projections on the test database; no inference of pass status from authored tests |
| WP8 APIs | Final report says route/API work is implemented but runtime acceptance was not established; tests/build/type/lint were not run under prior instruction | Run API regression and confirm current route behavior, error envelopes, auth and ownership enforcement, ML controlled failure |
| WP9.1–9.4 borrower/auth | Stage reports document feature implementation and authored tests; consolidated status explicitly marks runtime verification open | Execute authentication and borrower API/UI checks; confirm the borrower journey across application, offer, loan, repayment, and receipt |
| WP9.5 investor | WP9.5-I report records 24 UI/client checks and 18 investor API tests passed at that time, plus typecheck, lint (0 errors, warnings), and build passed; it also says a later repayment fixture change was not retested | Treat only those named historical checks as evidence. Re-run relevant investor regressions after current changes; browser journey still open |
| WP9.6 administrator | Admin pages, APIs, tests, and stage reports are present; payout report says API integration tests were not executable in the sandbox (`EACCES 127.0.0.1:5432`) | Run focused admin API/security tests and verify reconciliation/payout permission boundaries in the isolated local test DB |
| WP9.7 financial UI | Report records TypeScript pass but tests, lint, and build were not run | Re-run financial formatting/API/UI tests and compare persisted ledger and wallet values |
| WP9.8 ML frontend | Report records TypeScript pass; no tests/lint/build or API-to-Python runtime check; borrower prediction remains unavailable by decision | Verify role denials, service failure/timeout paths, and honest unavailable behavior; do not expect a successful borrower score without approved model/data |
| WP9.9 and browser acceptance | Existing WP9 review says no browser E2E runner is configured; component tests rely on static render coverage | Browser-responsive, navigation, interactive form, and browser-console checks remain unverified unless a browser harness or manual run is selected |
| WP10 | Readiness map and one cross-role API journey test are authored; the journey starts after funding/disbursement via a fixture and has not been run | Run the correlated system-journey file; later extend the journey through the application/offer path and assess repeatable all-service startup |

## Test inventory to reuse (no duplicate test-count work)

The current tracked/untracked test tree contains 142 files under `web/tests` and `ML/tests` at this audit point. Reuse and group existing tests as follows:

- **Authentication and authorization:** `web/tests/api/authentication.integration.test.ts`, role-specific borrower/investor/admin denial assertions, registration contract and auth client tests.
- **Borrower and repayment:** `web/tests/api/borrower-api.integration.test.ts`, `web/tests/services/repayment-submission.integration.test.ts`, `repayment-schedule.integration.test.ts`, `repayment-receipt.integration.test.ts`, `transaction-atomicity.integration.test.ts`, `repayment-auth-audit.integration.test.ts`, and allocation persistence tests.
- **Investor and payout:** `web/tests/api/investor-api.integration.test.ts`, `web/tests/services/investor-contribution.service.test.ts`, `investor-payout.integration.test.ts`, `investor-refund.service.test.ts`, and ledger/reconciliation coverage.
- **Administrator and financial read-only access:** `web/tests/api/admin-api.integration.test.ts`, admin route/client/component tests, and reconciliation services.
- **ML:** `web/tests/api/ml-api.integration.test.ts`, `ML/tests/prediction`, and `ML/tests/recommendation`. Verify Python project scripts and service setup before selecting the Python command; `ML/pytest.ini` configures `tests` as the pytest root.
- **WP10 system journey:** `web/tests/api/system-journey.integration.test.ts` is newly authored and unexecuted. Run only after confirming `.env.test` still passes the test database identity guard; never aim it at `nexus_dev` or a hosted database.

## Environment and data safety baseline

`web/docs/LOCAL_POSTGRES_SETUP.md` records PostgreSQL 18 on local port 5432 with separate `nexus_dev` and `nexus_test`, 34 committed migrations applied, and seeded platform accounts/policies. It says hosted databases were not contacted. The application scripts include a `pretest` guard that validates `DATABASE_ENV` and a SHA-256 fingerprint of `DATABASE_URL` before Vitest. These are documented states, not fresh runtime checks in this audit.

Before running DB-backed tests:

1. Verify the guard using the `test` environment without printing `DATABASE_URL` or secrets.
2. Verify local migration status for dev/test with the repository's guarded scripts.
3. Use `nexus_test` for all DB-backed regression tests. Do not reset or migrate a hosted database.
4. Confirm test fixtures only mutate the known shared account statuses and restore them, while unique immutable ledger history is expected to remain in test DB unless the test environment is rebuilt through the documented safe process.
5. Keep test groups isolated. Several suites temporarily activate shared platform accounts; do not launch overlapping financial test processes against the same test DB until suite concurrency behavior is understood.

## Critical verification gates

The release-preparation gate should stay open until these are evidenced:

1. No critical/high test failures across the focused regression matrix.
2. Repayment and payout ledger entries balance; wallet projections reconcile to posted ledger movements; allocations sum to persisted repayment components; account 2300 clears correctly.
3. Unauthorized and cross-owner requests fail without financial writes or misleading success audit events.
4. Failed posting and retry cases leave no partial records and preserve idempotency behavior.
5. Prisma migrations are current on local dev/test and constraints reject invalid state; no production migration is run.
6. `npx tsc --noEmit`, lint, production build, and the Python tests are executed and results recorded after confirming their scripts/configuration.
7. Frontend interaction, responsive layout, and browser console are checked with a real browser or explicitly marked unverified.
8. Dependency advisories are freshly assessed. The WP9.5-I report recorded a Next.js security upgrade notice at that time; confirm current dependency health before release and do not assume that historical warning was resolved.
9. Prediction remains unavailable/manual review until an approved NEXUS THB model and labeled dataset exist. Verify no UI path fabricates a prediction.

## Proposed execution order

1. **WP11.2 environment check:** run only guarded identity/migration checks and inspect current local service state. Do not expose credentials or connect to hosted resources.
2. **WP11.3 baseline regression:** run the existing test commands as configured, first targeted where prior failures exist, then the full web and Python suites; capture exact results before code changes.
3. **WP11.4 financial correctness:** run calculation, repayment, ledger, allocation, payout, and reconciliation suites, followed by the WP10 cross-role journey.
4. **WP11.5 security:** run auth/ownership/admin checks and inspect cookie, CORS, validation, and secret boundaries.
5. **WP11.6 reliability:** run atomicity, idempotency, retry, concurrency, and unavailable-service cases.
6. **WP11.7 stability:** run typecheck, lint, build, API latency/pagination checks, and browser inspection if available.
7. **WP11.8 stabilization:** fix confirmed defects and rerun only correlated tests followed by required regression checks.
8. **WP11.9 release report:** state pass/fail/unverified for each gate and list accepted limitations.

## Scope boundary

This WP11.1 checklist is an audit artifact. It records historical validation from reports but does not convert authored tests into passed tests. No application commands were run in this stage. The next work is environment verification and then baseline execution, with every DB operation restricted to the local `nexus_test` target.

## WP11.2–WP11.3 progress update

### Environment and database checks

- The guarded database identity scripts verified `.env.test` as `test` and `.env` as `development`. Connection strings and credentials were not printed.
- At this point in the initial audit, read-only Prisma migration checks found 34 migrations applied to each local database. A later WP11 auth-rate-limit index migration is now applied to both; current status is 35 migrations and up to date.
- A read-only PostgreSQL catalog check on `nexus_test` found no unvalidated constraints (`[]`).
- No production or hosted database was contacted. No migrations, seeds, or database resets were run.

### Web regression and quality checks

- Initial full web regression: **72 files passed, 1 failed; 573 tests passed, 1 failed**. The single failure was the newly added WP10 system journey assuming the admin pending-allocation API returned investor ownership data it does not expose.
- Corrected the journey test to map allocation ownership from each authenticated investor's scoped allocation endpoint. Its isolated rerun passed.
- Full guarded web regression after the fix: **73 files passed; 574 tests passed** on the local `nexus_test` database.
- `npx tsc --noEmit`: passed after the stabilization changes.
- `npm run lint`: passes with **0 errors and 35 warnings**. The 3 blocking lint errors were fixed in the admin payout and borrower risk evaluation components. Remaining warnings are unused symbols and unnecessary hook dependencies.
- Production build was not run in this WP11 continuation, per the user's explicit instruction.

### Python ML test and dependency findings

- The active Python environment initially lacked `pytest`, `pandas`, `httpx2`, and `MiniSom`. Added pinned runtime `pandas` and `MiniSom` dependencies to `requirements.txt`, plus `requirements-dev.txt` for the pinned pytest/httpx2 test dependencies. The packages were installed into the local Python environment; no production data was used.
- Pytest `TestClient` initially appeared to hang because sandbox restrictions blocked Windows asyncio's local socket-pair operations. Running the suite in the authorized local environment resolved this; it was not an application deadlock.
- Fixed DataFrame prediction validation comparing a list of columns against a tuple of canonical feature names.
- Replaced references to ignored personal recommendation data with committed synthetic fixtures under `ML/tests/fixtures/recommendation/`. Updated fixture-based contract and data-loading tests to use those files. Corrected the dynamic recommendation API test's preferred investment maximum to fit configured global bounds.
- Focused affected tests: **60 passed**.
- Full Python ML suite: `python -m pytest -q --durations=10` → **689 passed, 1 upstream Starlette deprecation warning**, 11.11 seconds.

### Security and dependency review

- The FastAPI ML service previously enabled CORS for every origin with credentials. Since the NEXUS web tier calls it server-to-server with a service token and no browser use was found, the wildcard credentialed CORS middleware was removed from `ML/main.py`.
- Existing source review found the local auth API uses HttpOnly, SameSite=Lax cookies and Secure in production; login and registration reject a mismatching Origin when supplied. ML service tokens are read only in server routes and are not declared as public environment variables.
- The initial sandboxed `npm audit` could not reach the npm advisory endpoint because network DNS resolution failed. A later authorized audit found three high `effect` advisories and Next.js advisories. Compatible fixes were applied: Next.js moved to 16.4.6, `effect` is overridden to patched 3.22.1, Prisma remains 7.10.1. The fixed Effect version is documented by [GHSA-7589-6fvf-x4pw](https://github.com/advisories/GHSA-7589-6fvf-x4pw); the Next.js advisory reports 16.4.5 as patched, and the project now uses 16.4.6 ([GHSA-mfr8-8qww-v76h](https://github.com/advisories/GHSA-mfr8-8qww-v76h)). A fresh production dependency audit reports zero vulnerabilities.
- CORS hardening was exercised by the full Python suite, but service deployment/network policy still needs review before staging to ensure the server is reachable only by the intended web service.

## Updated WP11 gate status

| Gate | Status | Evidence or blocker |
| --- | --- | --- |
| Local test/dev DB identity and migrations | Pass | Guard scripts identify local databases; 35 migrations applied to both; no unvalidated test DB constraints found in the earlier catalog check |
| Full web regression | Baseline pass; final rerun open | 73/73 files and 574/574 tests passed before the latest auth hardening/dependency updates; only the correlated new test file was run after those changes, per instruction |
| Financial correctness suites | Pass | 9 files, 167/167 tests on guarded `nexus_test` |
| Security/authorization suites | Pass, with targeted follow-up | 5 files, 110/110 tests before rate-limit changes; current limiter/API coverage is 6/6 in its dedicated file |
| TypeScript | Pass | `npx tsc --noEmit` after dependency and limiter changes |
| Lint | Pass for changed files | Focused ESLint on rate-limit service, login/register routes, and its test; prior repo-wide lint had 0 errors and 35 warnings |
| Python test collection | Pass | 689 collected after local dependency setup |
| Python ML suite | Pass | 689/689 passed; one Starlette deprecation warning |
| Python recommendation tests with fixtures | Pass | Synthetic fixtures committed; affected recommendation tests pass |
| npm dependency audit | Pass | `npm audit` and `npm audit --omit=dev`: 0 vulnerabilities; Next.js 16.4.6, Effect 3.22.1 override, Prisma 7.10.1 |
| CORS hardening | Source change and Python suite verified | Removed wildcard credentialed CORS; verify deployed service network policy before staging |
| Authentication rate limiting | Pass in local integration tests | DB-backed account and source limits, HMAC subject keys, atomic advisory locks, 429/Retry-After; proxy header trust and event retention need deployment policy |
| Production build | Not run | Explicitly excluded by user instruction |
| Browser/staging system journeys | Open | No configured E2E runner/staging manifest found; WP10 journey is API-level only |

WP11 remains **incomplete**. Financial correctness, Python ML, local database migration state, dependency audit, and focused authentication rate-limit checks are now evidenced. A final full web regression after the latest changes, browser/staging validation, deployment review of trusted proxy headers and security-event retention, and the explicitly deferred production build remain open. No final release verification claim is made here.

## WP11.4–WP11.8 progress update

### Financial and failure-recovery verification

- Ran the existing repayment calculation/schedule, allocation, ledger posting, repayment submission/receipt, payout, and transaction atomicity suites on guarded local `nexus_test`: **9 files passed, 167 tests passed**.
- The suites cover the persisted lifecycle, ledger/wallet consistency, allocation/payout reconciliation, rollback, idempotency, and concurrent requests. No new duplicate financial tests were added.

### Security and authorization

- Ran existing auth, borrower, investor, administrator, and repayment audit integration files: **5 files passed, 110 tests passed**.
- Source scan found no `NEXT_PUBLIC_*` secret/token/database/password variables. ML service credentials remain accessed only in server routes. API error mapping returns a generic internal error instead of raw exception text.
- Added a shared PostgreSQL-backed login and registration limiter. It limits each normalized account identifier and, when supplied by the request, its source address; HMAC references prevent raw email/IP values from being persisted. Advisory transaction locks serialize concurrent attempts. Login allows 8/account and 60/source per 15 minutes; registration allows 3/account and 12/source per hour. Excess attempts receive HTTP 429 and `Retry-After`. The direct NextAuth credentials provider uses the same account limit so it cannot bypass the custom login route's throttle.
- Focused limiter suite passed: **1 file, 6 tests** (including concurrent increment behavior, time-window reset, login/API 429, NextAuth credentials throttling, and duplicate-registration throttling). A non-destructive lookup index migration was applied to local `nexus_dev` and `nexus_test`; both now report 35 migrations applied and current.
- Login support incident: the first local `.env` did not define `AUTH_RATE_LIMIT_SECRET` or `NEXTAUTH_SECRET`, so the limiter failed closed and the API returned a generic 500 before password verification. Added independent 64-character random secrets to the ignored local `.env` and `.env.test`, and documented the requirement in `.env.example` and the local setup guide. Read-only local account inspection confirmed the pictured investor account is active and has a stored scrypt password hash; its password was not accessed. Authentication integration tests then passed **18/18**.
- Deployment must configure a trusted proxy to overwrite/sanitize `X-Real-IP` or `X-Forwarded-For`; the first `X-Forwarded-For` address is treated as the client address. Without a trusted source header, only the account-identifier limit applies. Security-event retention/cleanup should be defined before operating at scale because each attempt adds hashed security-event rows.

### Dependency security

- Initial production audit returned four advisories. Non-force compatible fixes upgraded Next.js to 16.4.6 and added an `effect@3.22.1` override, fixing the high-severity transitive issue without changing Prisma 7.10.1.
- Fresh `npm audit` and `npm audit --omit=dev` report **0 vulnerabilities**.
- The correlated rate-limit test file passed again after the dependency update and after covering the direct NextAuth credentials endpoint. TypeScript and focused ESLint checks passed. Per the test-file instruction, other suites were not rerun after these latest changes; the full-web result above is the prior baseline.

### Current limitations

- No Playwright/browser E2E runner is configured, and no staging app/services were selected for a browser pass. Responsive behavior, console errors, and full UI journeys remain unverified in a real browser.
- `npm run build` remains intentionally unrun per the user's instruction.
- No final full regression was run after auth hardening and dependency updates; only the directly correlated auth rate-limit integration file was rerun.
