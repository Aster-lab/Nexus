# NEXUS MVP Prediction Readiness

**Date:** 2026-11-21  
**Scope:** Safe groundwork for NEXUS-native preliminary borrower risk prediction  
**Validation:** Source review only. No tests, application code, typecheck, lint, build, or model training were run.

## Product decision

Prediction is preliminary decision support. A prediction must not approve, reject, price, issue an offer, or otherwise replace an administrator's application decision. Missing or unverified inputs must produce an incomplete/manual-review state; the feature builder must not substitute guessed values.

Model money features use NEXUS THB values. Persisted money remains integer satang. The feature boundary converts satang to THB. The old LendingClub `sub_grade_num` must not be inferred from a NEXUS credit score; the NEXUS feature schema uses the bureau-native `credit_score` field instead.

## Implemented groundwork

- Added `borrower_credit.v2` in the TypeScript borrower-financial contract while continuing to accept `borrower_credit.v1` records. V2 contains account openings over 24 months and bankcard/revolving balances and limits needed to derive utilization.
- Added matching Pydantic v2 contract support in the Python financial-data contract, preserving v1 acceptance.
- Added a strict NEXUS feature schema version, `nexus_risk_features.v2`, separate from the existing LendingClub v1 contract. It replaces subgrade with bureau-native credit score and documents THB monetary units.
- Added `buildNexusRiskFeatures()`. It requires verified source metadata for every income/debt entry used and verified credit bureau provenance; annualizes recurring income/debt payments; excludes one-time income; derives DTI and utilization; converts satang to THB; and records units/source mapping with the exact generated snapshot.
- Added `POST /api/borrower/applications/{applicationId}/financial-information`. It authenticates a borrower, verifies ownership, locks the application, and appends validated financial information only while the application is a draft.
- Added focused TypeScript contract/API tests and a Python parity contract test. These were authored but not run.

## Current activation gate

The borrower evaluation route still consumes the legacy v1 feature snapshot and Python `/predict` contract. The Python artifacts under `ML/models` were trained for the existing LendingClub v1 feature order. They are not compatible with NEXUS v2 and must not be registered as a NEXUS THB model.

The repository paths reviewed do not contain labeled NEXUS THB training data. Therefore the NEXUS v2 model cannot yet be trained, evaluated, registered, or activated. Contract and feature generation alone do not enable numeric prediction. Until a compatible artifact is approved, the administrator remains the decision-maker and the borrower evaluation UI should present model unavailability/manual review without a probability or risk tier.

Required before numeric prediction can be enabled:

1. Provide the authorized labeled dataset and document its source, permitted use, time window, and default/outcome definition.
2. Verify that every training monetary feature uses the same THB/year and THB conventions as the feature builder; prevent borrower/loan leakage and use a time-aware holdout.
3. Train and evaluate a NEXUS-v2 model. Record calibration, discrimination, subgroup/fairness review, and thresholds used for preliminary tiers.
4. Export artifacts with a manifest that binds artifact checksums, feature order, schema version, units, training data version, and evaluation report.
5. Add the v2 Python inference contract/engine and require an approved, active `ModelVersion` with `nexus_risk_features.v2` before returning a score.
6. Wire the evaluation endpoint to generate/persist the v2 snapshot, call only that compatible model, persist a `PRELIMINARY` prediction, and expose no automated application decision.
7. Add a frontend state for missing/verification-pending data, model unavailable/manual review, and completed preliminary evaluation.

## Feature contract

| Feature | Source and derivation | Model unit |
|---|---|---|
| `annual_income` | Sum verified recurring income annualized by frequency; one-time excluded | THB/year |
| `dti` | Annual verified debt payments divided by annual verified income | Percent points |
| `loan_amount` | Requested principal satang divided by 100 | THB |
| `acc_open_past_24mths` | Verified bureau count | Count |
| `bc_util` | Bankcard balance divided by bankcard credit limit | Ratio |
| `lti` | THB loan amount divided by THB annual income | Ratio |
| `interest_burden` | `(loan amount * policy annual rate) / (annual income + 1)` | Ratio |
| `credit_score` | Verified bureau score; retain bureau-native scale | Bureau score |
| `int_rate` | Active THB loan-interest policy basis points divided by 10,000 | Proportion |
| `revol_util` | Revolving balance divided by revolving credit limit | Ratio |
| `term_months` | Requested application term | Months |

Utilization ratios may exceed 1 for over-limit accounts; they are not clamped. A missing or zero limit is invalid and cannot be imputed by this feature builder.

## Files changed

- `src/lib/contracts/borrower-financial.ts`
- `src/lib/contracts/risk.ts`
- `src/lib/services/risk-feature-builder.ts`
- `src/app/api/borrower/applications/[applicationId]/financial-information/route.ts`
- `tests/contracts/prediction-feature-contract.test.ts`
- `tests/api/borrower-api.integration.test.ts`
- `ML/borrower_financial_contracts.py`
- `ML/tests/prediction/test_financial_and_schedule_contracts.py`

## Validation status

The changes are unverified at runtime by instruction. Run only the correlated tests when explicitly authorized: `tests/contracts/prediction-feature-contract.test.ts`, the focused borrower financial-information API cases in `tests/api/borrower-api.integration.test.ts`, and the Python financial contract test. Do not enable or register a model until the NEXUS THB training and evaluation gates above are complete.
