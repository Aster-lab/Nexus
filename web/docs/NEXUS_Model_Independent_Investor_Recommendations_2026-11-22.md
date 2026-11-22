# NEXUS — Model-Independent Investor Recommendations

**Date:** 2026-11-22  
**Scope:** Investor recommendations without borrower risk predictions  
**Status:** Implemented in working tree; tests intentionally not run

## Decision

Investor loan recommendations are now intended to work when no prediction model is trained, approved, or active. Recommendation ranking is a deterministic match between saved investor preferences and currently eligible loan terms. It does not estimate default probability, assign a risk tier, or imply expected return.

Borrower risk prediction remains a separate feature and can remain unavailable while no suitable labeled training dataset exists.

## Matching behavior

The matcher scores four preference dimensions equally:

- Annual interest rate: score is 1 inside the investor's saved range and decreases with distance outside it.
- Loan duration: same range-fit behavior, measured in months.
- Remaining funding amount: same range-fit behavior, converted from satang to THB for matching.
- Loan purpose: score is 1 for a selected purpose and 0 otherwise.

Each dimension has a 25% weight. Scores are bounded between 0 and 1. Equal scores are ordered by earliest funding deadline, then loan ID for deterministic results.

Candidates must still be open for funding, have an unexpired funding deadline, have remaining principal to fund, have an open escrow account, and contain a recognized purpose. Purpose comes from the application version referenced by the accepted offer, so it stays tied to the actual loan terms. The transaction rechecks candidate eligibility and current funding values before persisting the run.

## API and data changes

- The existing investor recommendation endpoint performs ranking in the NEXUS service and makes no Python service request.
- New runs use `modelVersionId: null` and `inputVersion: nexus_investor_preference_match.v1`.
- New preference data uses `nexus_investor_preference.v2`; it contains interest rate, loan duration, investment amount, and purpose, without risk tiers.
- Previously saved v1 preferences are normalized on read. Their risk-tier field is discarded; the remaining preference values are retained.
- Persisted recommendation explanations identify `weighted_preference_match.v1`, record the weights, and contain only the four preference match scores.
- Older recommendation explanations are normalized for display, mapping the former loan amount score to the current funding amount score and omitting risk tiers.

## User interface

The investor preference form no longer asks for risk tiers. Recommendation cards display loan terms and preference match details only. The page explicitly states that match scores are not default probabilities, confidence scores, or expected returns.

## Test coverage added or updated

- Service tests cover a full match, weaker range and purpose matches, and deterministic tie-breaking.
- API tests cover ranking without an active model or Python fetch, expired funding exclusion, null model metadata, and persistence of results.
- Preference API tests cover v2 saves and normalization of existing v1 records.
- Client and component tests cover the v2 preference shape and removal of model-dependent risk-tier controls.

The integration database may contain eligible marketplace loans from prior fixtures. API tests verify the returned set has bounded preference scores, that the expired scenario loan is omitted, and that the persisted result set matches the response. They do not assume the hand-built scenario loan is the only eligible loan in the database.

Tests were not executed per the current instruction. Before release, run only the correlated tests first: `tests/lib/services/investor-recommendation.service.test.ts`, `tests/api/ml-api.integration.test.ts`, `tests/api/investor-api.integration.test.ts`, `tests/lib/client/ml-features.test.ts`, and `tests/components/investor-recommendations.test.ts`.
