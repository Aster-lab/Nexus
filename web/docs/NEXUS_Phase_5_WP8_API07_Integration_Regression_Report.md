# NEXUS Phase 5 WP8 — API-07 Integration, Security, and Regression

**Date:** 21 November 2026  
**Scope:** Cross-cutting API authentication, validation, isolation, service integration, financial safety, ML behavior, and WP6/WP7 regression coverage  
**Verification:** Source and test-suite review only. No test, typecheck, lint, or build command was run.

## Summary

API-07 adds a focused cross-cutting API regression suite and reviews the API and financial integration suites against the WP8 API-07 criteria. The route-specific API suites already exercise core service calls, ownership, idempotency, failure translation, and ML behavior. The new suite targets gaps that were not explicit in those files: unauthenticated access across role surfaces, cross-role access across borrower/investor/admin/ML endpoints, malformed JSON, and strict rejection of unsupported request fields without database writes.

API-07 does not add a business endpoint or duplicate repayment, payout, disbursement, or ledger logic in routes.

## New tests

Added `tests/api/api-regression.integration.test.ts` with:

| Scenario | Assertion |
| --- | --- |
| API-07-01: Missing session | Borrower, investor, and administrator protected routes return `401 UNAUTHENTICATED`. |
| API-07-02: Wrong role | Borrower cannot access investor marketplace; investor cannot access borrower applications, administrator loans, or borrower evaluation; each returns `403 FORBIDDEN`. |
| API-07-03: Malformed JSON | Application creation returns `400 INVALID_JSON` and creates no application. |
| API-07-04: Unsupported fields | Application creation rejects an unrecognized client-supplied `userId` and creates no application. |

Test principals use persisted sessions and role assignments. Tests do not trust the helper's role metadata as authentication; the API identity comes from the session. Temporary sessions, profiles, role links, and users are cleaned up after each case.

## Existing coverage mapped to API-07

| WP8 criterion | Existing coverage reviewed |
| --- | --- |
| Authentication and authorization | `tests/api/authentication.integration.test.ts`; new API-07 role-boundary cases; API-03/04/05/06 denial cases. |
| Request validation | API-03 borrower application and repayment cases; API-04 investment cases; API-05 decision and administration cases; API-06 ML request and response cases; new malformed JSON and unknown-field cases. |
| Existing service integration | API-03 invokes borrower application, offer, schedule, repayment, and receipt flows; API-04 uses contribution and portfolio/payout flows; API-05 uses application review, disbursement, payout, and reconciliation; API-06 exercises the Python contracts and persisted output. |
| Financial API safety | `tests/services/repayment-submission.integration.test.ts` covers repayment submission, idempotency, concurrency, and overpayment races; `tests/services/investor-payout.integration.test.ts` covers payout lifecycle, idempotency, concurrency, persistence failures, and reconciliation; `tests/services/transaction-atomicity.integration.test.ts` covers rollback, compensation, and reconciliation. |
| Data isolation | API-03 borrower ownership and receipt access; API-04 investor portfolio, investment, payout, and allocation ownership; API-05 administrator gating; API-06 borrower evaluation and investor recommendation ownership. |
| ML integration | `tests/api/ml-api.integration.test.ts` covers Python success, invalid response, timeout, service unavailability, candidate filtering, and persisted result access. `ML/tests/recommendation/test_api06_dynamic_recommendations.py` covers Python request authentication and schema validation. |
| WP6/WP7 regression | The repayment, atomicity, payout, and reconciliation service suites are present and cover the WP6/WP7 guarantees at their service boundaries. Running them remains pending under the instruction not to run tests without an explicit request. |

## Review decisions and limits

- Kept API-07 in a separate cross-cutting suite rather than adding another feature route or changing business services.
- Reused existing route handlers and test request helpers so the cases exercise production authentication and validation paths.
- Asserted that malformed and unsupported input leaves the application count unchanged, checking both the response and absence of side effects.
- Financial idempotency, concurrency, and atomicity coverage remains in the correlated financial-service suites; the API-07 suite does not repeat costly lifecycle fixtures.
- WP8 mentions oversized requests “where relevant.” The current API contract has no agreed maximum request size policy, so this work does not invent one or assert an arbitrary limit. Define the request-size policy before adding that test.

## Files

- `tests/api/api-regression.integration.test.ts` — added cross-cutting regression cases.
- `docs/NEXUS_Phase_5_WP8_API07_Integration_Regression_Report.md` — this coverage and decision report.

## Verification status

No API-07 or other tests were run, as instructed. Typecheck, lint, build, database behavior, and integration-suite results remain unverified by execution. The suite is authored and reviewed against the plan; API-07 runtime acceptance remains pending until the correlated test suite and the required WP6/WP7 regression suites are explicitly run.
