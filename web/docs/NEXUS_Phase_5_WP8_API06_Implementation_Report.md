# NEXUS Phase 5 WP8 — API-06 Python ML Integration

**Date:** 21 November 2026  
**Scope:** Borrower evaluation and investor-specific recommendations through the Python ML service  
**Verification:** Source review only; tests and other executable checks were not run, following the standing instruction.

## Summary

API-06 adds the backend integration layer between authenticated NEXUS users, persisted NEXUS application and marketplace data, and the Python risk and recommendation service. The integration tests were authored before route and service implementation. The backend remains the authority for user identity, application ownership, feature snapshots, investor preferences, model selection, candidate eligibility, and persistence. Python receives a bounded, versioned input and returns validated scoring output.

## API surface

| Method | Endpoint | Behavior |
| --- | --- | --- |
| POST | `/api/ml/borrower-evaluation` | Evaluates the authenticated borrower's eligible application using its stored feature snapshot and active compatible model; persists a `PRELIMINARY` prediction record. |
| GET | `/api/ml/borrower-evaluation/[evaluationId]` | Retrieves a persisted evaluation only when its application belongs to the authenticated borrower. |
| POST | `/api/ml/investor-recommendations` | Builds an eligible candidate set from persisted marketplace and risk data, asks Python to rank it using the investor's saved preferences, then persists a recommendation run and results. |
| GET | `/api/ml/investor-recommendations` | Retrieves the investor's latest run or a specified owned run; hides recommendations for loans that are no longer eligible and marks the response stale. |

## Test-first coverage authored

`tests/api/ml-api.integration.test.ts` covers:

- Valid borrower evaluation and prediction persistence.
- Invalid evaluation input and rejection of client-supplied feature values.
- Borrower ownership enforcement for evaluation requests.
- Controlled service-unavailable and timeout responses.
- Invalid ML output rejection without writing a prediction.
- Investor-specific recommendation refresh.
- Filtering of recommendation IDs outside the backend-provided candidate set.
- Cross-investor recommendation-run denial.
- Persistence of recommendation run metadata and ranked results.
- Retrieval of a persisted borrower evaluation by its owner.

`ML/tests/recommendation/test_api06_dynamic_recommendations.py` covers the Python dynamic recommendation contract, service-token authentication, strict rejection of unexpected fields, candidate validation, and ranking only the supplied candidates.

## Implementation decisions

### Borrower evaluation

- Request accepts only `applicationId`; the body is strict and cannot supply feature values.
- The route authenticates the session, requires the borrower role and profile, and scopes the application lookup to that profile. Missing or foreign applications return the same not-found response.
- Evaluation is allowed only for `SUBMITTED`, `UNDER_REVIEW`, or `APPROVED` applications with a current version.
- The feature snapshot must already be persisted for the current application version and pass the versioned risk-feature contract. Feature generation is not part of API-06 because the current project does not have an approved application-to-feature generation service.
- The route selects an active, approved model that supports the snapshot schema, calls Python `/predict` with the configured service token and a 10-second timeout, and validates the complete response before persistence.
- Successful results are stored as `PRELIMINARY` `PredictionRecord`s. They do not create or replace an official `RiskAssessment`.
- Python availability, timeout, and malformed output map to controlled API errors; malformed output cannot leave a partial prediction record.

### Investor recommendations and Python contract

- Per the user's decision, the Python recommendation contract was extended rather than attempting to reuse the legacy static dataset endpoint.
- NEXUS reads the caller's saved, validated `InvestorPreference`, selects a compatible active model, and builds candidates from funding loans with a future deadline, open escrow, remaining funding capacity, a current risk assessment tied to the selected model, and a supported loan purpose.
- The candidate payload contains only loan identifiers, public investment terms, the remaining funding amounts, and the risk tier. Borrower identifiers and personal application data are not sent to Python.
- Persisted loan amounts use satang; preference money ranges and the existing Python scoring rules use whole THB. The contract documents this boundary, and the Python scoring adapter converts satang to THB before applying the existing scoring primitives.
- Python exposes authenticated `POST /recommendations` for this dynamic request. It ranks only the supplied candidates; NEXUS remains responsible for determining which loans may be shown and invested in.
- NEXUS validates the Python response and drops any recommendation that was not in its submitted candidate set. It rechecks live funding status, deadline, escrow status, and remaining principal before writing the run/results in a serializable transaction.
- Recommendation results are descriptive ranking output. Actual investment authorization and limits remain enforced by the existing investment endpoint.
- Unsupported or ambiguous purpose text is excluded from the candidate set rather than being silently treated as a preference-compatible `other` purpose.
- Recommendation test fixtures create the required open escrow account and platform wallet. This matches the route's marketplace eligibility rule; a loan without escrow is correctly excluded before requesting a Python score.
- The previous Python `GET /recommendations?current_time=...` static-data endpoint remains unchanged for compatibility. API-06 does not use it.

## Main files

- `tests/api/ml-api.integration.test.ts`
- `src/app/api/ml/borrower-evaluation/route.ts`
- `src/app/api/ml/borrower-evaluation/[evaluationId]/route.ts`
- `src/app/api/ml/investor-recommendations/route.ts`
- `src/lib/contracts/risk.ts`
- `ML/main.py`
- `ML/src/recommendation/recommend.py`
- `ML/tests/recommendation/test_api06_dynamic_recommendations.py`

## Review findings and limitations

- The current schema has no approved feature-generation implementation for borrower applications. Evaluation therefore requires an existing valid `FeatureSnapshot`; adding a feature-generation pipeline is separate work.
- The dynamic recommendation request is capped at 200 candidates. The route queries a bounded candidate set, so a larger marketplace may need pagination or a dedicated ranking batch strategy later.
- The legacy static Python GET recommendation route still exists and does not become the API-06 path. The NEXUS routes call the authenticated dynamic POST endpoint.
- Source review found that unknown purpose strings were initially mapped to `other`. This was changed so such loans are excluded instead of being scored under a potentially unintended investor preference.
- The recommendation fixture initially omitted its escrow account. That made API-06-07/08 and the persistence assertion receive no eligible candidates/results. The fixture now creates the shared escrow platform account, wallet, and per-loan escrow account. This addresses the test setup mismatch without weakening the production eligibility check.
- No tests, typecheck, lint, or build were run. Runtime behavior, generated Prisma types, database constraints, and the Python integration remain unverified by execution.

## Completion status

API-06 endpoints, contracts, test scenarios, and the dynamic Python recommendation adapter are implemented and reviewed against the WP8 plan and the current NEXUS data model. Execution verification remains pending by instruction.
