# NEXUS WP9.8.1 — ML API Integration Audit

**Date:** 2026-11-21  
**Scope:** Existing WP8 ML routes, request/response contracts, role checks, and frontend integration gaps.

## Existing session APIs

| Operation | Route | Permission and behavior |
| --- | --- | --- |
| Borrower evaluation | `POST /api/ml/borrower-evaluation` | Borrower session and profile; application ownership is checked. Body is only `{ applicationId }`. Backend reads the application's current validated FeatureSnapshot and active compatible approved model, calls Python, validates the response, and stores a `PRELIMINARY` PredictionRecord. |
| Borrower evaluation retrieval | `GET /api/ml/borrower-evaluation/{evaluationId}` | Borrower session and profile; query is scoped through the evaluation's application owner. A foreign or missing ID is `404`. No list/history endpoint exists. |
| Investor recommendation run | `POST /api/ml/investor-recommendations` | Active investor session/profile; requires a saved valid preference and an active compatible approved risk model. No request body. Server selects and rechecks eligible funding loans, calls Python, validates/filter results, and persists a RecommendationRun. |
| Investor recommendation retrieval | `GET /api/ml/investor-recommendations` | Active investor session/profile; returns latest run or accepts its owned `runId`. Results for no-longer-eligible loans are filtered and indicated through `isStale`. |
| Python prediction persistence callback | `POST /api/applications/{applicationId}/predictions` | Server-to-server bearer token only. It is not a browser endpoint and must never receive the prediction persistence token from frontend code. |

## Response contracts and presentation limits

- Borrower persisted prediction schema: `nexus_prediction_output.v1` with `default_probability`, `tier` (`tier_code`, `tier_name`, `risk_level`, `action_code`, `rate_markup`, `ui_badge_color`), and `spatial_metrics`.
- There is no confidence score in the borrower response. `spatial_metrics` are internal model-space metrics and do not represent confidence.
- The borrower response is `PRELIMINARY`; it is not an official risk assessment or application decision. The UI should not expose `action_code`, `rate_markup`, quantization distance, or cluster internals as borrower guidance.
- Investor recommendations return ordered loans with a 0–1 match `score`, `rankingPosition`, a five-factor explanation, and public funding terms. The score is not default probability, confidence, expected return, or an eligibility decision.
- The Python service URL and token remain server-side. Route timeout is 10 seconds. Relevant failures include service unavailable/timeout, invalid ML response, missing/invalid feature snapshot, no active model, missing preferences, and ineligible application state.

## Frontend gaps found

- No borrower-facing ML component or client existed.
- No investor recommendations page or client existed.
- Investor recommendations require persisted preferences, but WP8 had no investor preference read/write API or UI.
- Borrower evaluation can be retrieved only by a known record ID; there is no endpoint to list prior evaluations.
- Investor recommendation history is limited to the latest run or one explicitly known run ID; there is no run-list endpoint.
- The API requires an active compatible approved model. The user's earlier MVP decision was to keep prediction unavailable until a suitable approved model/data is ready; the UI must handle `ML_MODEL_UNAVAILABLE` and must not fabricate a result.

## Decision and authorized supporting change

The user approved extending WP8 with an investor preferences API. WP9.8 adds the narrow session-scoped `GET`/`PUT /api/investor/preferences` contract using the existing `InvestorPreferenceContractSchema`; it does not alter Python, model training, candidate selection, scoring, or inference logic.

## Test-first plan

API integration tests were added for preference ownership, validation, and read/write behavior. Frontend client and component tests cover role-specific paths, preliminary result disclosures, preference/ranking explanations, and loading/error states. Per user instruction, no tests or lint were run in this workstream.
