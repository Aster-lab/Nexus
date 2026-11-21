# NEXUS WP10 — Integration Readiness and Test Map

**Review date:** 2026-11-21  
**Scope:** Static review of the WP10 staging/integration plan against the current repository, existing tests, local database setup notes, and ML service contract.  
**Validation performed:** Read-only source and documentation inspection. No tests, typecheck, lint, build, servers, migrations, seeds, or database commands were run. No files outside this report were changed.

## Executive status

WP10 is **started, not complete**. The repository has broad API and service integration coverage for authentication, borrower journeys, investor funding and payouts, administrator operations, ledger consistency, and ML contracts. Those tests cover important pieces of the planned SYS suite, but they do not constitute full user-journey staging verification.

The checked-in web package has Vitest and database safety scripts, but no Playwright, Cypress, or other browser E2E dependency/configuration was found in the inspected repository inventory. No Docker Compose, container orchestration, staging deployment manifest, or one-command full-stack launcher was found in the inspected top-level inventory. Consequently, browser-driven cross-role journey checks and reproducible staged startup remain gaps.

The project document `NEXUS_WP9_Implementation_Review_and_Completion_Status_2026-11-21.md` is stale relative to the current tree: it labels WP9.5 and WP9.6 unimplemented even though investor/admin pages, APIs, and tests are now present. Treat it as historical status, not a reliable current completion ledger. WP10 should use the live source and the later stage reports as evidence.

The local DB setup document records separate `nexus_dev` and `nexus_test` databases, local URLs, 34 migrations applied, and baseline seeds, with hosted databases untouched. This was not re-probed during this static review. Use only `nexus_test` for database-backed automated verification and `nexus_dev` for manual local journeys; never point WP10 staging checks at hosted DBs.

The borrower prediction feature remains unavailable by product decision until an approved, representative NEXUS THB model and dataset exist. The service has health and prediction endpoints, but an available HTTP process is not evidence that a valid NEXUS borrower prediction can be produced. Verification must confirm an honest unavailable/controlled-error experience and must not display legacy-model output as a NEXUS prediction.

## Readiness inventory

| Area | Evidence in repository | WP10 assessment |
| --- | --- | --- |
| Web application | `web/package.json` has Next `dev`, `build`, `start`, `lint`, and Vitest `test` scripts | Individual web service commands exist; no integrated startup orchestration found |
| Test database safety | `pretest` asserts `.env.test` database identity before Vitest; dedicated DB identity/reset guard tests exist | Safety foundation is documented; not executed in this review |
| Local databases | `web/docs/LOCAL_POSTGRES_SETUP.md` records local `nexus_dev`/`nexus_test`, migration and seed status | Suitable documented local split; live state not probed here |
| Web integration tests | API suites for authentication, borrower, investor, admin, and ML; service suites for repayment, contribution, payout, disbursement, ledger, and reconciliation | Strong service/API coverage; not a single browser-driven system journey |
| Frontend tests | Vitest component, client, and contract tests exist for all three roles and ML | Reports and test structure suggest largely unit/static-render coverage; no browser runner found |
| Python ML service | FastAPI app, `/health`, `/predict`, and recommendation endpoints; Python requirements and pytest config exist | Python service is independently testable; coupled web-to-Python runtime needs staging verification |
| Staging/deployment | No compose, Dockerfile, or staging manifest appeared in the inspected repository inventory | Reproducible staging environment/configuration is an open task |
| Operational evidence | WP9 reports explicitly distinguish code review from runtime verification | No current evidence of complete borrower, investor, admin journeys against a running integrated stack |

## SYS-01–SYS-80 coverage map

This is a map of existing coverage areas, not a claim that every SYS case already exists as an individually named test. “Component coverage” means related tests exist; it does not imply browser E2E coverage or that the tests passed in this review.

| Planned scenarios | Existing coverage to reuse | Gap before marking SYS complete |
| --- | --- | --- |
| SYS-01–08 — environment, configuration, service startup/shutdown | `web/tests/scripts/assert-db-environment.test.ts`, `verify-db-identity.test.ts`, `reset-database.test.ts`; Python health/lifespan tests in `ML/tests/prediction/test_engine_health.py` | No automated full-stack readiness check or compose/startup orchestration found; need verify web, PostgreSQL, and Python can be started together and shut down cleanly |
| SYS-09–16 — authentication and sessions | `web/tests/api/authentication.integration.test.ts`; registration contract test; auth client tests | API behavior is covered, but a real browser registration → login → role redirect → logout/session expiration path is not shown by a browser E2E harness |
| SYS-17–26 — borrower journey | `web/tests/api/borrower-api.integration.test.ts`; repayment, schedule, receipt, allocation, auth/audit and atomicity service suites; borrower client/component tests | No demonstrated single journey through registration/application/decision/offer/funding/disbursement/schedule/repayment/receipt; use isolated fixtures and test DB only |
| SYS-27–36 — investor journey | `web/tests/api/investor-api.integration.test.ts`; investor contribution, payout, allocation persistence, wallet and reconciliation suites; investor client/component tests | No demonstrated browser workflow spanning wallet funding → marketplace contribution → portfolio → repayment allocation → payout → wallet refresh |
| SYS-37–44 — administrator journey | `web/tests/api/admin-api.integration.test.ts`; admin client/component tests; disbursement, payout, audit and reconciliation service suites | No demonstrated browser workflow from application review through loan operations, payouts, reconciliation, and audit inspection |
| SYS-45–56 — financial consistency | `transaction-atomicity.integration.test.ts`, `repayment-submission.integration.test.ts`, `investor-payout.integration.test.ts`, `ledger-posting.integration.test.ts`, contribution/disbursement and repayment suites | Rich transactional/domain coverage exists; still needs a clean-database end-to-end reconciliation across all persisted records after the integrated journeys |
| SYS-57–64 — Python ML integration | `web/tests/api/ml-api.integration.test.ts`; Python prediction and recommendation contract/API tests, including `ML/tests/recommendation/test_api06_dynamic_recommendations.py` | Environment readiness must be separated from model readiness. Borrower prediction is intentionally unavailable pending approved NEXUS THB data; validate only controlled unavailability unless the model is separately approved |
| SYS-65–72 — cross-role authorization and data isolation | auth, borrower, investor, admin, and ML API suites contain role/ownership denial cases | Need cross-role browser checks and a compact explicit ownership matrix across borrower, investor, and admin pages/routes |
| SYS-73–80 — failure/recovery | transaction atomicity, idempotency, timeout/error handling, failed payout/retry, audit and reconciliation service/API cases | Failure cases are tested at API/service boundaries; staging should validate observable UI recovery and ensure no duplicate posts after uncertain outcomes |

## Important rules to carry into WP10

- Financial APIs and persisted database records remain authoritative. Do not calculate or repair posted balances in the browser.
- Store and transmit THB values as integer satang where contracts require it. Confirm ledger entries balance and wallet projections agree with ledger-derived balances.
- A pending payout allocation is not an investor wallet credit. Clearing reconciliation uses completed payouts only.
- Failed multi-record financial writes must leave no partial transaction, repayment, installment, allocation, payout, or wallet projection changes.
- Posted ledger records remain immutable; corrections use a compensating transaction.
- No real-world money transfer exists in this MVP.
- Keep all automated database tests on the local `nexus_test`; manual development flows should use `nexus_dev`. Hosted database access is outside this WP10 pass.
- Avoid reusing one shared static fixture for concurrent financial workflows. Each scenario needs uniquely owned users, loans, wallets, and idempotency keys, with cleanup/rollback consistent with existing fixtures.
- Keep the prediction UI unavailable or show a controlled backend-unavailable result. Never synthesize a score or substitute output from an unrelated model.

## Recommended WP10 execution sequence

1. **Reconcile the test inventory:** classify each SYS case as existing API/service test, UI/client test, browser journey gap, or operational check. Confirm current tests from source rather than relying on the stale consolidated WP9 status document.
2. **Establish safe local readiness:** review environment identity without printing credentials; verify the local `nexus_test` and `nexus_dev` targets, migration status, seeded platform accounts, and Python/web configuration. Do not reset either DB as a readiness shortcut.
3. **Select a browser strategy:** either add a small browser E2E harness or document and run a controlled manual staging checklist. A backend API suite cannot verify responsive rendering, navigation, confirmation dialogs, or browser session behavior.
4. **Run focused automated suites only after the inventory is accepted:** start with test-database guard and one isolated domain journey, then borrower, investor, and admin journeys, then reconciliation and failure/recovery. Do not run a broad suite against `nexus_dev`.
5. **Exercise the integrated local stack:** start PostgreSQL, ML service if required for the chosen flow, then Next.js; record health checks and controlled ML-unavailable behavior. Avoid unsupported production/staging claims until a deployable staging configuration exists.
6. **Record evidence:** include commands, database identity (host/database only, never password), migration state, test outcomes, service health, and any unresolved scope. Generate the WP10 completion report only after journey and financial checks actually pass.

## Current blockers and scope decisions

1. **No browser E2E runner/configuration identified.** WP10 can continue with API/service checks, but UX journeys will need either an authorized browser harness or an explicitly documented manual check.
2. **No integrated stack launcher/deployment manifest identified.** Startup can be performed with individual service commands, but repeatable staging startup/shutdown and environment parity are not established.
3. **Borrower ML prediction is intentionally unavailable.** SYS-57–64 cannot be represented as successful prediction quality/inference checks until a suitable approved NEXUS THB model and labeled data exist. Service health and honest fallback can still be verified.
4. **WP9 consolidated status is out of date.** It must not be used alone to determine current implementation state; later source and stage reports supersede it.

## Review boundary

This document records static coverage and readiness observations only. No test result, runtime health result, database state, visual behavior, or staging deployment success is asserted. The next WP10 action is to confirm the local environment safely and choose the execution method for the missing full-journey checks.
