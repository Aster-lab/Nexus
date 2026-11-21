# Machine Learning Integration APIs

This guide covers session-authenticated NEXUS APIs and the service-to-service prediction persistence callback. The Python service token is server-side and must never be sent to a browser.

## Borrower evaluation

### `POST /api/ml/borrower-evaluation`

Requires borrower session, role, profile, and ownership of the application. Strict request body:

```json
{ "applicationId": "<application-uuid>" }
```

The route uses the persisted validated feature snapshot for the application's current version; clients cannot submit features. A compatible approved active model and eligible application state are required. The Python response is validated before a `PRELIMINARY` `PredictionRecord` is written; this endpoint does not create an official risk assessment.

Success (`201`) includes `predictionRecordId`, `featureSnapshotId`, `modelVersionId`, `predictionType`, `evaluatedAt`, and the versioned prediction fields (`default_probability`, `tier`, `spatial_metrics`).

### `GET /api/ml/borrower-evaluation/{evaluationId}`

Returns the persisted evaluation only to the borrower who owns the associated application. A missing or non-owned result returns `404`.

## Investor recommendations

### `POST /api/ml/investor-recommendations`

Requires an active investor session/profile and a valid saved investor preference. No body is required. NEXUS chooses eligible funding loans, filters them against current risk assessment and escrow/funding state, and sends only public terms and risk tier to the authenticated Python scoring endpoint. It persists a recommendation run and results, after validating and filtering Python output and rechecking live eligibility.

The response (`201`) includes `recommendationRunId`, `modelVersionId`, request contract version, timestamp, latency, and ordered recommendations with score, feature score explanation, and public loan terms. Recommendations are informational rankings; investment eligibility is enforced again by the investment service.

### `GET /api/ml/investor-recommendations`

Returns the investor's latest run. Optional query: `runId=<uuid>` to retrieve a specific run owned by the investor. Foreign or unknown run IDs return `404`. Results for loans no longer eligible are hidden and `isStale` indicates that some persisted recommendations were omitted.

## Service-to-service prediction persistence

### `POST /api/applications/{applicationId}/predictions`

This is a protected Python-to-NEXUS callback, not a user-facing session endpoint. It requires `Authorization: Bearer <PREDICTION_PERSIST_TOKEN>` and a configured `ML_SERVICE_TOKEN`. The request is limited to 32 KiB and uses the strict `PredictionPersistenceRequestSchema` contract from `src/lib/contracts/risk.ts`. The caller supplies the application version, model version, prediction type, feature generation version, feature values, units, and source mapping. Official predictions require an eligible application and active compatible approved model; the route validates ML output and persists the feature snapshot and prediction transactionally, updating the official risk assessment for `OFFICIAL` output.

This callback currently uses a legacy error envelope (`{ "error": "CODE" }`) rather than the general API success/error envelope. Its codes include `UNAUTHORIZED`, `REQUEST_TOO_LARGE`, `INVALID_JSON`, `INVALID_PREDICTION_REQUEST`, `APPLICATION_VERSION_NOT_FOUND`, `MODEL_VERSION_NOT_ACTIVE_OR_COMPATIBLE`, `APPLICATION_NOT_ELIGIBLE_FOR_OFFICIAL_ASSESSMENT`, `FEATURE_SNAPSHOT_INVALID`, `PREDICTION_SERVICE_UNAVAILABLE`, `PREDICTION_SERVICE_FAILED`, `INVALID_PREDICTION_RESPONSE`, `INVALID_PREDICTION_OUTPUT`, `PREDICTION_WRITE_CONFLICT`, and `PREDICTION_PERSISTENCE_FAILED`.

## Python service configuration

NEXUS route handlers use server-side `ML_SERVICE_URL` and `ML_SERVICE_TOKEN` settings. The token must be at least 32 characters and is sent in `X-ML-Service-Token` between services. Requests time out after 10 seconds. Borrower evaluation maps service timeout to `504 ML_SERVICE_TIMEOUT`, unavailable service to `503 ML_SERVICE_UNAVAILABLE`, and invalid output to `502 INVALID_ML_RESPONSE`. Recommendation failures use controlled service errors and are not persisted as successful runs.

The dynamic Python recommendation contract accepts NEXUS-selected candidates and investor preferences. Monetary candidate amounts are satang; preference money ranges and scoring are in THB, converted by the Python adapter. The legacy Python `GET /recommendations?current_time=...` endpoint remains for compatibility and is not used by the NEXUS investor recommendations route.
