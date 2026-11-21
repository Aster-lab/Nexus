# NEXUS WP9.8 — ML Feature Presentation and Frontend Integration

**Date:** 2026-11-21  
**Scope:** Frontend integration for existing WP8 borrower evaluation and investor recommendation APIs, including the authorized investor preference API prerequisite.

## Outcome

Implemented borrower preliminary risk preview and investor recommendation flows using the existing WP8 Python service, model selection, response validation, and persistence. No model was retrained and no prediction/scoring algorithm was changed.

The TypeScript check (`npx tsc --noEmit`) passes. Tests and lint were not run in this workstream, following the user's instruction not to run them. No production build was run.

## 9.8.1 — ML API integration audit

Recorded API paths, schemas, authorization rules, response limitations, model-readiness dependencies, and history gaps in [NEXUS_WP9_8_1_ML_API_Integration_Audit_2026-11-21.md](NEXUS_WP9_8_1_ML_API_Integration_Audit_2026-11-21.md).

Key findings:

- Borrower evaluation accepts an owned `applicationId`; the backend reads the validated persisted feature snapshot. Frontend callers cannot submit model feature values.
- Borrower evaluation returns a persisted `PRELIMINARY` result. Retrieval requires its ID; no list-of-evaluations endpoint exists.
- Investor recommendations require a persisted valid preference and active compatible approved model. The API returns the latest or one specific owned run; there is no run-list endpoint.
- No confidence value is provided by either prediction schema.
- Python service credentials remain server-side. The service-to-service persistence callback is not a browser endpoint.

## 9.8.2 — ML feature entry points

- Added the preliminary risk preview to owned borrower application details when a saved application version exists.
- Added a personalized recommendations link to the investor dashboard and created `/investor/recommendations`.
- Kept ML surfaces inside existing role-protected borrower and investor areas. No administrator or Python callback interface was added.

## 9.8.3 — Prediction request interface

- Borrower sees the saved application amount and term summary and confirms before requesting an evaluation. The request sends only the application ID.
- Double clicks are blocked while the request is in progress. After a timeout or network uncertainty, the page does not automatically retry a potentially non-idempotent prediction request.
- Investor can save preferences using the exact WP8 contract, then request recommendations without client-supplied candidates or scoring inputs.

## 9.8.4 — Prediction results

- Borrower view labels default probability as an estimate, shows the returned tier and risk level, and states that the response contains no confidence score. It identifies the response as preliminary and not an approval decision.
- Internal action code, rate markup, macro-cluster, quantization distance, and model identifiers are not presented as borrower-facing guidance.
- Investor view presents ranking and feature scores as match scores, not probabilities, confidence, expected returns, or eligibility decisions.
- Recommendations link to the existing loan details page and show only returned public loan terms.

## 9.8.5 — Prediction history

- A borrower can reload a specific persisted evaluation from its returned evaluation ID, preserved in the application page query string.
- The investor page loads the latest recommendation run and can load a specific run ID from its query string.
- The interfaces explicitly avoid claiming a full history because WP8 has no list endpoint for borrower evaluations or recommendation runs.

## 9.8.6 — Service status and errors

- The borrower flow handles missing/ineligible feature snapshots, inactive compatible models, unavailable Python service, timeout, invalid response, and failed retrieval without displaying fabricated values.
- Investor preferences and saved recommendation results have independent loading/error states. Recommendation results can be safely reloaded with GET; a new ranking request is explicit.
- Empty recommendation runs are shown as no current matches; stale loans filtered by the backend are disclosed.
- For ML service errors known to occur before database persistence, the interface now offers a deliberate retry. A browser/network failure remains an uncertain outcome: the UI does not automatically retry or issue another POST, and directs the user to reload persisted results where the API supports it.

## 9.8.7 — Integration and regression

- Added API integration tests for investor preference reads/writes, schema validation, and role denial. Existing WP8 ML API tests continue to cover recommendation and borrower evaluation contracts.
- Added client and UI tests for ML paths, preliminary-risk disclosures, and recommendation preference/result states.
- No tests or lint were executed by instruction. The TypeScript check passed. Database-backed API-to-Python integration and visual behavior therefore remain unverified in this workstream.

## 9.8.8 — ML service error handling

- Borrower evaluation and investor recommendations distinguish confirmed pre-persistence errors (`ML_SERVICE_TIMEOUT`, `ML_SERVICE_UNAVAILABLE`, and `INVALID_ML_RESPONSE`) from a browser `NETWORK_ERROR` with an unknown server outcome.
- Confirmed service failures expose a manual retry. Borrower retries return through the existing confirmation dialog; investor retries require an explicit click. No automatic retry loop is used.
- Network failures block another POST for the current page session. Investor users can reload the latest saved run; borrower users are told that the API cannot list evaluations and to confirm the outcome with an administrator before making another request.
- Confirmed responses are still the only source of displayed prediction or ranking data. Error responses never produce placeholder results.

## 9.8.9 — Responsive presentation

- Source review confirms the ML pages use a mobile-first single-column layout, responsive preference/result grids, wrapping recommendation headers, breakable identifiers, and full-width mobile primary actions that become fit-content actions at the `sm` breakpoint.
- The borrower confirmation dialog uses a bounded width, viewport padding, breakable application reference, and stacked mobile buttons that become inline at `sm`.
- TypeScript validation passed after the changes. Tests and lint were not run per instruction.
- Browser access is unavailable in this chat, so actual desktop/mobile viewport rendering could not be visually inspected. This is a source-level responsive review, not a viewport screenshot verification.

## Supporting WP8 API addition

The existing recommendation POST required saved preferences, but no route existed to create or retrieve them. The user authorized the smallest supporting WP8 addition:

- `GET /api/investor/preferences`: returns the active investor's validated preferences or `null`.
- `PUT /api/investor/preferences`: validates the existing `InvestorPreferenceContractSchema` and creates/replaces only the authenticated active investor's preference record.

The addition uses existing schema and storage, does not expose service tokens, and does not change recommendation scoring. The endpoint is documented in `docs/api/investor-api.md` and `docs/api/api-overview.md`.

## Known limitations

- The borrower evaluation API requires an approved compatible model and persisted feature snapshot. If either is unavailable, the page displays the backend error and no substitute output. The earlier MVP decision to keep prediction unavailable until suitable model data is ready remains respected.
- The API has no full prediction/run history list, confidence score, or idempotency key for borrower evaluation. The UI does not invent these capabilities.
- Actual browser viewport rendering, Python service availability, and active model configuration were not checked in this turn.
