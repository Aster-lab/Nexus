# NEXUS Phase 2 JSONB Data Contracts

**Status:** Contract specification draft for review  
**Scope:** JSONB/JSON fields across the NEXUS Prisma schema, with emphasis on the ML input, feature snapshot, and prediction output shared by Next.js and FastAPI.  
**Basis:** NEXUS implementation roadmap Phase 2, technical specification ML Input Contract, current `web/prisma/schema.prisma`, and current `ML/` request/response models and fixtures.

## 1. Phase 2 outcome

Phase 2 defines the JSON documents stored in JSONB and passed between services. It is not the seed-data phase. The seed scripts and development/test data belong to Phase 4, after these contracts are agreed and validated.

The roadmap requires every JSON field to have an owner, version, shape, mutability classification, validation rules, and compatibility policy. It also requires TypeScript/Zod and Python/Pydantic validation to agree, with compatibility examples for valid, invalid, missing, extra, and older-version payloads.

## 2. Current repository findings

- `ML/predict.py` declares the required 11-feature order, and `ML/main.py` validates the corresponding fields with Pydantic.
- The FastAPI `/predict` route accepts a versioned `nexus_risk_features.v1` object or a temporary raw-v1-compatible object, and returns a `nexus_prediction_batch.v1` response envelope with `status`, `processed_count`, `data`, and `errors`.
- A successful prediction returns `default_probability`, `tier` (`tier_code`, `tier_name`, `risk_level`, `action_code`, `rate_markup`, `ui_badge_color`), and `spatial_metrics` (`macro_cluster`, `quantization_distance`). The response identifies its contract version; it does not currently identify the model version.
- The 11-feature list was duplicated between inference and recommendation adapters; the Phase 2 follow-up centralizes it in `ML/feature_contract.py`.
- The Phase 2 follow-up centralizes feature ordering in `ML/feature_contract.py`, imported by risk inference and the recommendation adapter.
- The FastAPI feature examples and validators now treat `bc_util` and `revol_util` as proportions constrained to 0..1. `interest_burden` is documented as the ratio calculated by preprocessing.
- FastAPI accepts a versioned `nexus_risk_features.v1` request envelope (with a temporary raw-v1 compatibility path) and declares `nexus_prediction_batch.v1` in its response. A matching TypeScript/Zod contract is in `web/src/lib/contracts/risk.ts`.
- `ML/data/recommendation/investor.json`, `loan.json`, and `investment.json`, plus `ML/config/recommendation_config.json`, are recommendation-service fixtures/configuration. They are not database seed data.
- The web repository has no JSON contract document, shared Zod schemas, or seed script today.
- Prisma currently calls the application JSON field `ApplicationVersion.submittedData` (`submitted_data`); the roadmap refers to an `application_snapshot`. The contract should be named `application_snapshot` in documentation, while retaining the current column/property until a separate migration decision is made.

## 3. JSON field inventory

The inventory below covers every Prisma `Json`/`Json?` field. “Owner” means the service or workflow that should validate writes; read-only consumers should not silently reshape persisted history.

| Prisma model.field | Contract purpose | Proposed owner | Mutability |
|---|---|---|---|
| `BorrowerProfile.address` | `borrower_profile_address.v1` structured address | Next.js borrower profile service | Editable current profile |
| `SecurityEvent.metadata` | Security-event context; exclude credentials and unnecessary personal data | Next.js security/auth service | Append-only event |
| `AccountRestriction.scope` | Scope/targets of a restriction | Next.js admin service | Immutable per restriction; lift via related lifecycle fields |
| `ApplicationVersion.submittedData` | Versioned application snapshot (`application_snapshot`) | Next.js application service | Immutable after submission |
| `BorrowerFinancialInformation.incomeData` | Income facts and their values | Next.js application service | Immutable per application version |
| `BorrowerFinancialInformation.expenseData` | Expense facts and their values | Next.js application service | Immutable per application version |
| `BorrowerFinancialInformation.debtData` | Debt facts and their values | Next.js application service | Immutable per application version |
| `BorrowerFinancialInformation.creditData` | Credit facts used by review/assessment | Next.js application service | Immutable per application version |
| `BorrowerFinancialInformation.sourceMetadata` | Provenance for financial inputs | Next.js application service | Immutable per application version |
| `InformationRequest.requestDetails` | Requested information and response requirements | Next.js review workflow | Editable only while request is open; preserve history |
| `ScheduleVersion.scheduleInputs` | Inputs used to calculate a schedule version | Next.js repayment service | Immutable per schedule version |
| `ScheduleVersion.scheduleSnapshot` | Calculated schedule terms/snapshot | Next.js repayment service | Immutable per schedule version |
| `FeatureSnapshot.featureValues` | Exact 11 ML feature values | Next.js ML integration boundary | Immutable snapshot |
| `FeatureSnapshot.featureUnits` | Units for each stored feature value | Next.js ML integration boundary | Immutable snapshot |
| `FeatureSnapshot.sourceMapping` | Source fields/formulas and provenance | Next.js ML integration boundary | Immutable snapshot |
| `PredictionRecord.predictionOutput` | Versioned prediction result matching the FastAPI item output | FastAPI produces; Next.js persists | Immutable prediction record |
| `PredictionRecord.explanation` | Optional explanation returned/supported for a prediction | FastAPI/approved explanation producer | Immutable prediction record |
| `AuditLog.oldValues` | Before-state for an administrative action | Next.js admin service | Append-only; redact secrets |
| `AuditLog.newValues` | After-state for an administrative action | Next.js admin service | Append-only; redact secrets |
| `PolicyVersion.policyValues` | Versioned policy configuration | Next.js admin/policy service | Immutable after approval/activation |
| `AlertHistory.oldValue` | Prior alert value/status | Next.js operations service | Append-only history |
| `AlertHistory.newValue` | New alert value/status | Next.js operations service | Append-only history |
| `SupportHistory.oldValue` | Prior support status/context | Next.js support service | Append-only history |
| `SupportHistory.newValue` | New support status/context | Next.js support service | Append-only history |
| `IdempotencyRecord.responseSnapshot` | Original result returned for a repeated same-payload command | Next.js command handler | Immutable after completion |
| `OutboxEvent.payload` | Durable event body for a background worker | Next.js transaction/outbox service | Immutable event payload; delivery state is relational |
| `SystemEvent.metadata` | Operational event context | Next.js/worker operations | Append-only event |
| `DocumentSecurityScan.details` | Scanner evidence/results | Document scanning service | Append-only scan record |
| `DataCorrectionRequest.requestedChange` | User-proposed data correction | Next.js privacy workflow | Immutable request; review outcome is separate |
| `InvestorPreference.preferenceData` | Investor preference filters/settings | Next.js marketplace service | Editable current preference |
| `InvestorBehavior.eventData` | Minimal permitted behavioral event details | Next.js marketplace service | Append-only event |
| `RecommendationRun.preferenceSnapshot` | Preference state used for one run | Next.js/ML recommendation boundary | Immutable run snapshot |
| `RecommendationRun.candidateSetSnapshot` | Candidate state supplied for one run | Next.js/ML recommendation boundary | Immutable run snapshot |
| `RecommendationResult.explanation` | Optional reason for a recommendation | Recommendation service | Immutable run result |

JSONB must not become a substitute for relational facts. Wallet balances, ledger entries, ownership, loan/investment relationships, repayment allocations, and authoritative status relationships remain relational. Model binaries remain in controlled artifact storage, not JSONB.

## 4. Shared contract conventions

Use `snake_case` property names in serialized JSON, matching the ML feature names and current FastAPI API. Each independently versioned persisted document uses a required string `schema_version` such as `application_snapshot.v1` or `feature_snapshot.v1`. Keep the semantic contract version separate from `feature_generation_version`, which identifies the implementation/formula set that produced features.

For versioned documents:

- Reject unknown major schema versions. Do not silently reinterpret them.
- Permit additive optional fields only within a compatible version; document whether validators forbid extras or explicitly allow extensions.
- Preserve historical snapshots as written. A new contract must not rewrite old submitted applications, feature snapshots, or predictions in place.
- Use ISO 8601 timestamps with timezone offsets for timestamp strings.
- Require JSON numbers, not numeric strings or booleans, for numeric ML fields. Reject NaN and infinity.
- Keep model identity/version, source application/version, and provenance in relational columns when already available; JSON contains the payload only and avoids duplicating canonical relationship identifiers unless a snapshot explicitly needs them.

## 5. Application snapshot contract

Contract identifier: `application_snapshot.v1`  
Storage: `ApplicationVersion.submittedData` / PostgreSQL `submitted_data`  
Writer: Next.js application service  
Lifecycle: mutable only while a draft is being assembled; immutable once submitted. Material corrections create a new `ApplicationVersion`.

Required top-level properties:

| Property | Type | Required | Notes |
|---|---|---:|---|
| `schema_version` | string | yes | Exactly `application_snapshot.v1` |
| `borrower` | object | yes | Only borrower details required/supported by the approved application flow; avoid duplicating identity columns without need |
| `employment` | object | yes | Employment facts and source/period where relevant |
| `requested_loan` | object | yes | Requested amount with currency, requested term in months, and approved purpose/category |

The approved baseline has strict nested objects for `borrower`, `employment`, and `requested_loan`. Each documented property is required in the JSON shape; values that are optional or unknown are represented by `null`, not omitted. Income, expenses, debts, credit facts, and their provenance remain exclusively in `BorrowerFinancialInformation`. The requested amount is integer satang and term is whole months, matching relational columns. This application contract uses NEXUS currency semantics and is separate from model-native feature units.

### Repository/document review result

The product design and technical specification define the wizard stages as basic personal information; employment and income; financial overview, expenses, and existing debts; credit information; and loan request. The owner approved a baseline field catalog and decided that financial and credit values belong only in `BorrowerFinancialInformation`, preventing duplication in `submitted_data`. The snapshot therefore contains borrower identity/contact/address, employment details, and the requested loan. The current web source still has no form or submission service; these contracts specify the approved boundary before that integration exists.

`ML/application_snapshot_contract.py` and `web/src/lib/contracts/application.ts` now enforce the same strict `application_snapshot.v1` shape. `borrower` includes `legal_name`, nullable `phone`, and an `address` object with `line1` plus nullable `line2`, `subdistrict`, `district`, `province`, `postal_code`, and `country_code`. `employment` includes `employment_status`, nullable `employer_name` and `occupation`, and nullable nonnegative integer `months_in_role`. `requested_loan` includes nonempty `purpose`, positive safe integer `amount_satang` (bounded by JavaScript's safe-integer range), and positive integer `term_months`. Every property is required; optional values use explicit `null`. Employment status and purpose remain nonempty strings because the repository does not define authoritative allowlists for either. The editable `BorrowerProfile.address` column reuses the same strict address properties under its own `borrower_profile_address.v1` version wrapper.

## 6. Exact ML feature contract

Feature contract identifier: `feature_snapshot.v1`. Preserve this array order whenever building the model vector; JSON object key order is not a reliable ordering mechanism. `FeatureSnapshot.featureValues` remains a name-to-number object, and the adapter must build a list using this canonical ordered array.

Canonical feature order and currently known rules:

| Order | Feature | Type/rule from current code or approved spec | Unit / issue to settle |
|---:|---|---|---|
| 1 | `annual_income` | finite JSON number, greater than zero | Raw `annual_inc` passes through; repository does not document its currency. Dataset fields suggest a U.S. source, but that does not prove a currency contract |
| 2 | `dti` | finite JSON number, at least zero | Percentage points in current API example (`16.5`); do not send `0.165` unless contract/model is deliberately changed |
| 3 | `loan_amount` | finite JSON number, greater than zero | Raw `loan_amnt` passes through; repository does not document its currency. Do not label it THB or satang |
| 4 | `acc_open_past_24mths` | finite JSON number, at least zero | Count in prior 24 months; determine whether fractions are meaningful or should be rejected |
| 5 | `bc_util` | finite JSON number from 0 to 1 | Proportion, matching preprocessing normalization |
| 6 | `lti` | finite JSON number, at least zero | Ratio, not percentage points, per current example (`0.16`) |
| 7 | `interest_burden` | finite JSON number, at least zero | Dimensionless ratio `(loan_amount × int_rate) / (annual_income + 1)` |
| 8 | `sub_grade_num` | whole number from 1 through 35 | Numeric grade encoding; document exact mapping to source grade categories |
| 9 | `int_rate` | finite JSON number from 0 through 1; proportion | Explicit spec: 10.5% is `0.105`. Recommendation fixtures currently use percentage-like values (e.g. `10`); define an explicit boundary conversion or update those fixtures/validators |
| 10 | `revol_util` | finite JSON number from 0 to 1 | Proportion, matching preprocessing normalization |
| 11 | `term_months` | positive whole number | Months; current API rejects fractions |

Roadmap/spec requirements: no missing values, numeric strings, booleans, NaN, or infinity. The current Pydantic model also forbids extra fields and uses strict validation. Training preprocessing confirms the utility proportion conversion and interest-burden formula. The raw `loan.csv` contains U.S.-oriented fields such as `addr_state` and `zip_code`; `data_cleaned.py` renames `annual_inc`/`loan_amnt` and passes their numeric values through without currency conversion. The repository has no dataset source/currency declaration, so USD is a plausible inference, not a confirmed contract fact. Do not substitute NEXUS THB/satang amounts without verifying source currency and documenting a conversion strategy or retraining the model.

Feature snapshot metadata should include `schema_version`, `feature_generation_version`, source application version, `created_at`, and provenance/source mapping. The source application version is already available relationally via `FeatureSnapshot.applicationVersionId`; avoid duplicating a different identifier in JSON. Keep values, units, and source mapping aligned by the same 11 feature names.

The  persistedfeature-snapshot contract is now concretely represented in `ML/feature_snapshot_contract.py` and `web/src/lib/contracts/risk.ts` with `schema_version`, `feature_generation_version`, `source_application_version_id`, timezone-aware `created_at`, `feature_values`, and exact 11-key `feature_units` and `source_mapping` maps. The JSON source-version UUID should equal the relational `FeatureSnapshot.applicationVersionId` when the caller serializes the snapshot.

## 7. Prediction request and response mapping

The current `/predict` accepts the versioned `nexus_risk_features.v1` envelope and temporarily accepts raw feature objects as v1 for compatibility. Responses declare `nexus_prediction_batch.v1`. No Next.js caller exists yet; a future caller should use the versioned envelope.

Current response mapping for `PredictionRecord.predictionOutput`:

| Current FastAPI response property | Persisted location / note |
|---|---|
| `status` | Batch response envelope; do not store as an individual model prediction unless explicitly mapped |
| `processed_count` | Batch response envelope metadata |
| `data[].index` | Batch position only; correlate to the application/version in the caller, not as a permanent identity |
| `data[].prediction.default_probability` | Prediction probability; range 0 to 1 |
| `data[].prediction.tier` | `tier_code`, `tier_name`, `risk_level`, `action_code`, `rate_markup`, `ui_badge_color` |
| `data[].prediction.spatial_metrics` | `macro_cluster`, `quantization_distance` |
| `errors[]` | Per-item validation failures for partial batches; not a successful prediction |

Current `PredictionRecord` relational columns identify model version, feature snapshot, prediction type, output, and creation time. Therefore do not invent new probability/grade fields or store model binaries in `prediction_output`. The persisted JSON contract is the returned prediction object plus `schema_version: "nexus_prediction_output.v1"`; model identity remains relational. Store the batch envelope separately only if a documented operational need exists.

`PredictionRecord.explanation` remains nullable. Per the owner’s decision, its current write contract accepts only JSON `null` until an explanation producer and field catalog are approved. Do not conflate it with recommendation-result explanations. The Python and Zod validators reject every non-null value for now.

The schema distinguishes prediction type and links official risk assessment records. Document and enforce these meanings:

- `OFFICIAL`: the approved application assessment used to create/update the current `RiskAssessment` reference.
- `PRELIMINARY`: a non-final estimate; must not replace the official assessment.
- `DIAGNOSTIC`: test/monitoring output; must not be treated as an applicant decision.

ML remains decision support. A tier/action response is not itself a database approval or rejection decision.

## 8. Recommendation contracts

Existing files to use as starting examples: `ML/data/recommendation/investor.json`, `loan.json`, and `investment.json`; config: `ML/config/recommendation_config.json`.

The repository now validates the following versioned JSON contracts in `ML/src/recommendation/contracts.py` and matching schemas in `web/src/lib/contracts/risk.ts`:

- `investor_preference.v1`: editable preference values from `InvestorPreference.preferenceData`. Include allowed risk tiers, rate/term ranges, investment amount range, and purpose categories only as supported by recommendation validation/config.
- `investor_behavior_event.v1`: append-only minimal event data; define permitted event types and prohibit using a click as evidence of financial suitability.
- `recommendation_run_preferences.v1` and `recommendation_run_candidates.v1`: immutable snapshots of the exact values used for one run; include a schema version and keep canonical profile/model identity relational.
- `recommendation_result_explanation.v1`: optional structured explanation; do not promise fields the recommendation service does not produce.

The current recommendation configuration and investor fixtures use rates such as `10` and ranges such as `8..12`; the preference contract therefore treats recommendation interest rates as percentage points. This is separate from the risk model's proportion (`0.10` for 10%). Recommendation amount ranges remain in the engine's input units; the fixtures/config do not establish an authoritative currency or conversion to NEXUS THB/satang, so do not connect them to financial records until that mapping is approved.

The preference and candidate-set snapshot envelopes are now specified and validated. The candidate contract follows the fields consumed by the current eligibility/scoring pipeline. The loan fixture had placeholder arrays for spatial metrics that contradicted the FastAPI output; those examples now use scalar cluster IDs and distances.

Snapshots and explanations still need wiring to persistence call sites when those workflows exist. The repository currently has no writer for these JSONB records.

### Approved investor behavior event contract

The project owner approved this allowlist. The ERD permits only behavioral signals and explicitly warns that a click is not proof of financial suitability. Matching Pydantic and Zod validators now enforce it; no event enum or writer exists yet.

Common `eventData` properties: `schema_version` exactly `nexus_investor_behavior.v1`; `surface` one of `marketplace`, `recommendations`, or `saved_loans`; optional `recommendation_run_id` UUID; and `recommendation_position` positive integer only when `surface` is `recommendations`. Investor identity, loan identity, and event time stay in relational `investor_profile_id`, `loan_id`, and `created_at` columns.

| Allowed `event_type` | Additional required `eventData` properties | Signal interpretation |
|---|---|---|
| `LOAN_VIEWED` | No additional property | Weak interaction signal only; must not affect financial suitability or eligibility by itself |
| `LOAN_COMPARED` | `comparison_id` UUID and `comparison_set_size` integer from 2 to 3 | Indicates an explicit comparison action only; not evidence of willingness or ability to invest |

Do not record dwell time, click coordinates, inferred sensitive traits, account balances, investment transactions, or free-form arbitrary payloads in this event JSON. Save/unsave events remain represented by `SavedLoan` and `SavedLoanHistory`; preference changes remain in `InvestorPreference`, avoiding duplicate behavior logs. These events are not currently consumed by the recommendation model. If later used for learned preference, that use needs separate validation and an explicit no-suitability rule.

## 9. Remaining JSON field contract register

### Decisions recorded; implementation details still pending

- The owner approved the baseline application field catalog and the address subfields described in Section 5.
- Financial and credit facts remain in the dedicated `BorrowerFinancialInformation` documents and are not duplicated in `submitted_data`.
- The owner approved typed financial-entry arrays, the listed category/source/status allowlists, and per-entry provenance. Credit inquiry and delinquency counts use a 12-month lookback.
- The owner approved preserving generated installment terms in `scheduleSnapshot`; payment progress stays in relational `Installment` rows. `scheduleInputs` stores principal, term, and first due date, while calculation settings remain relational.
- ML currency conversion remains unresolved until the training dataset source and currency are verified; do not encode a USD assumption.
- Restriction scope uses approved allowlists that depend on `restrictionType`; the matching validators are now implemented. Target ownership still requires a database/service check.

These fields also need a concrete schema, version, validation, and compatibility policy before Phase 2 can be considered complete:

- Profile/security/admin: none remain beyond the service-specific audit-value catalog.
- Application/review/repayment: none remain beyond the service-specific history-value catalog.
- Policy/operations: none remain beyond integration-level operation mappings.
- Documents/privacy: none remain in the normalized scan-details contract; privacy target-field allowlists remain a service requirement.
- Prediction: `PredictionRecord.explanation` has an approved null-only write contract; its non-null shape still needs a producer and approved field catalog.
- Marketplace: no JSON field remains without a contract.

For audit/status-history JSON, document allowlisted fields and sensitive-data redaction. For outbox payloads, include an event schema version and event type, and keep delivery status/attempt count relational. For policy configuration, define allowed keys and types per policy code; do not accept arbitrary unvalidated configuration.

### Approved account restriction and information request contracts

**`AccountRestriction.scope`**

Every scope document carries `schema_version: "account_restriction_scope.v1"`. Restriction types and exact scope keys:

| `restrictionType` | Scope shape |
|---|---|
| `ACCOUNT_FREEZE` | `{ scope_type: "ACCOUNT" }` — blocks all account actions while active |
| `WITHDRAWAL_BLOCK` | `{ scope_type: "ALL_WALLETS" }` or `{ scope_type: "WALLET_IDS", wallet_ids: [UUID, ...] }` |
| `INVESTMENT_BLOCK` | `{ scope_type: "ALL_LOANS" }` or `{ scope_type: "LOAN_IDS", loan_ids: [UUID, ...] }` |
| `APPLICATION_BLOCK` | `{ scope_type: "ALL_APPLICATIONS" }` or `{ scope_type: "APPLICATION_IDS", application_ids: [UUID, ...] }` |

For target-list forms, require at least one unique UUID. The service must verify each referenced wallet, loan, or application belongs to the restricted user; this cross-table rule cannot be established by JSON validation alone. Do not allow target-list properties on the `ALL_*` forms.

**`InformationRequest.requestDetails`**

The contract uses `schema_version: "information_request_details.v1"` with a nonempty `items` array. Each strict item has a unique `field_code` (lower snake case), nonempty borrower-facing `prompt`, `required` boolean, and `response_type` from `TEXT`, `NUMBER`, `DATE`, `DOCUMENT`, or `YES_NO`. Due date, status, extension count, requester, and application remain in relational columns. The JSON describes requested items only; submitted answers and document IDs remain in their existing application/document records.

The two approved shapes are implemented with matching Pydantic and Zod validators in `ML/workflow_contracts.py` and `web/src/lib/contracts/workflow.ts`. The restriction validator checks the `restriction_type` to `scope_type` mapping, requires unique nonempty UUID target lists for target-specific scopes, and forbids extra properties. The request-details validator checks the schema version, field-code syntax, nonempty list, and unique codes. Target UUID ownership must be checked against relational rows by the service.

### Approved security and system event contracts

No event writers or prior event taxonomy exist in the repository. The owner approved the initial allowlists below. Matching strict validators are now implemented.

**`SecurityEvent.metadata`** — every payload includes `schema_version: "security_event_metadata.v1"`; the relational `eventType`, `severity`, `outcome`, `userId`, and `sourceReference` remain outside the JSON.

| `eventType` | Proposed additional metadata |
|---|---|
| `AUTHENTICATION_SUCCEEDED` | `auth_method`: `PASSWORD`, `OAUTH`, or `UNKNOWN` |
| `AUTHENTICATION_FAILED` | `auth_method`; `reason_code`: `INVALID_CREDENTIALS`, `PROVIDER_ERROR`, or `ACCOUNT_LOCKED` |
| `MFA_FAILED` | `factor_type`: `TOTP`, `EMAIL`, `SMS`, or `RECOVERY`; `reason_code`: `INVALID_CODE`, `EXPIRED_CODE`, or `REPLAYED` |
| `PASSWORD_RESET_REQUESTED` | `delivery_channel`: `EMAIL` or `SMS` |
| `PASSWORD_CHANGED` | `change_method`: `USER`, `RESET`, or `ADMIN` |
| `SESSION_REVOKED` | `reason_code`: `USER_REQUEST`, `ADMIN_ACTION`, or `SECURITY_POLICY` |
| `ACCESS_DENIED` | `resource_type`: `ACCOUNT`, `WALLET`, `LOAN`, `APPLICATION`, or `ADMIN_RESOURCE`; `permission_code` in lower snake case |

Do not store passwords, tokens, one-time codes, raw IP addresses, email addresses, full request bodies, or document content in metadata. Use the existing relational `sourceReference` for a linked incident/reference if needed.

**`SystemEvent.metadata`** — every payload includes `schema_version: "system_event_metadata.v1"`; relational `eventType`, `source`, `status`, and `createdAt` remain outside the JSON.

| `eventType` | Proposed additional metadata |
|---|---|
| `WORKER_STARTED` / `WORKER_STOPPED` | `worker_name`; `release_id` optional |
| `JOB_FAILED` | `job_name`, `error_code`, positive `attempt_number` |
| `SERVICE_HEALTH_CHANGED` | `component`, `previous_status` nullable |
| `MODEL_LOAD_FAILED` | `model_name`, `model_version`, `error_code` |
| `DATABASE_MIGRATION_APPLIED` | `migration_name` |

Do not store raw stack traces, secrets, credentials, financial/customer data, or storage credentials. Keep error details bounded to an allowlisted error code; keep attempt/status facts relational where a dedicated column exists.

The event contracts are implemented in `ML/event_contracts.py` and `web/src/lib/contracts/events.ts`. Both validators match the relational event type to its exact metadata shape and reject unknown properties.

### Approved audit and correction value contracts

The repository has no audit or correction writers and does not define target-specific field catalogs. The owner approved the following envelopes; target-type field allowlists and sensitive-value policy remain service integration requirements.

- `AuditLog.oldValues` and `AuditLog.newValues`: nullable `audit_values.v1` documents shaped as `{ schema_version, fields: [{ field_code, value }] }`. Require unique lower-snake-case field codes; old and new documents for one audit event must use the same code set. Keep actor, target, action, reason, outcome, and correlation ID relational. Require service-side field allowlists by `targetType`; redact credentials, tokens, secrets, and unnecessary personal/financial values.
- `DataCorrectionRequest.requestedChange`: `data_correction_request.v1` shaped as `{ schema_version, changes: [{ field_code, proposed_value }] }`. Require a nonempty changes array and unique lower-snake-case field codes. `targetType`, `targetId`, user, reason, status, and reviewer remain relational. Allowlist field codes and validate each `proposed_value` by target type; do not include a copied current value or evidence document ID in this payload.

Matching Pydantic and Zod validators are implemented in `ML/audit_correction_contracts.py` and `web/src/lib/contracts/audit-correction.ts`. Both reject unknown envelope properties, duplicate field codes, and non-JSON values; the audit pair validator requires matching field-code sets when both old/new documents are present. Services must still enforce allowed codes and value policies for each `targetType`.

The owner also approved reuse of `audit_values.v1` for `AlertHistory.oldValue/newValue` and `SupportHistory.oldValue/newValue`. `HistoryValuesPairContract` and `HistoryValuesPairSchema` validate the nullable pairs and matching field-code sets when both sides exist. Support status and actor remain relational; existing legacy JSON values must be read as-is until a deliberate historical-data migration is approved.

### Approved `OutboxEvent.payload` catalog

The repository has no outbox event writers. The owner approved this initial business-event set, derived from the project sequence diagrams and relational models. Common payload envelope: `{ schema_version: "nexus_outbox_payload.v1", event_data: {...} }`; `eventType`, `aggregateType`, and `aggregateId` remain relational. Event-specific `event_data` shapes:

| `eventType` | Proposed `event_data` fields | Source flow |
|---|---|---|
| `APPLICATION_SUBMITTED` | `application_version_id` UUID | Application submission flow |
| `INVESTMENT_COMMITTED` | `investment_id` UUID, positive `principal_satang` | Fractional investment flow |
| `LOAN_FUNDED` | `repayment_schedule_id` UUID | Funding completion and repayment schedule creation |
| `REPAYMENT_POSTED` | `repayment_id` UUID, positive `total_satang` | Repayment and proportional payout flow |
| `WITHDRAWAL_REQUESTED` | `withdrawal_request_id` UUID, positive `amount_satang` | Simulated withdrawal request |
| `DOCUMENT_SCAN_REQUESTED` | `document_id` UUID | Document security scan workflow |

Payload values are minimal event context, not a copy of the full related row. UUID references and satang integers are validated, and each event type is coupled to its exact `event_data` shape. Matching Pydantic/Zod validators are implemented in `ML/outbox_contracts.py` and `web/src/lib/contracts/outbox.ts`.

### Approved `IdempotencyRecord.responseSnapshot` operation catalog

No command handlers or prior `operationType` registry exist in the repository. The owner approved this initial catalog based on the idempotency keys on ledger transactions, investment contributions, investor payouts, and withdrawal requests. `response_snapshot` remains nullable for in-progress or legacy rows; each non-null snapshot uses `idempotency_response.v1`:

| `operationType` | Response fields |
|---|---|
| `CREATE_LEDGER_TRANSACTION` | `ledger_transaction_id` UUID, `status` from `DRAFT`, `POSTED`, `REVERSED` |
| `CREATE_INVESTMENT_CONTRIBUTION` | `contribution_id` UUID, `investment_id` UUID, positive `amount_satang` |
| `CREATE_INVESTOR_PAYOUT` | `investor_payout_id` UUID, `status` from `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `principal_satang`, `interest_satang` (nonnegative) |
| `CREATE_WITHDRAWAL_REQUEST` | `withdrawal_request_id` UUID, `status` from `REQUESTED`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`, positive `amount_satang` |

The relational `operationType` selects the response schema; the JSON snapshot carries `schema_version: "idempotency_response.v1"` and the operation result fields. Request hash, key, owner, and idempotency lifecycle status remain relational. Matching Pydantic/Zod validators are implemented in `ML/idempotency_contracts.py` and `web/src/lib/contracts/idempotency.ts`; they reject operation/payload mismatches and unknown fields.

### Approved initial `PlatformPolicy.policyValues` catalog

The schema has no prior policy-code registry or platform-policy writer. The owner approved the following small initial catalog. `RetentionPolicy` remains a separate versioned model, and ML recommendation configuration remains service configuration rather than a database policy.

| Proposed `policyCode` | Proposed versioned values | Rationale / open decision |
|---|---|---|
| `ESSENTIAL_NOTIFICATION_POLICY` | `schema_version: "essential_notification_policy.v1"`; nonempty `categories` list of `{ category_code, required_channels }`; channel values `IN_APP` or `EMAIL`; unique category codes and at least one required channel per category | Implements the recorded requirement that essential security/financial notifications cannot be disabled. Actual category codes and required channels are configured in an approved policy version; the validator does not invent defaults. |
| `LOAN_OFFER_POLICY` | `schema_version: "loan_offer_policy.v1"`; positive `min_principal_satang`, `max_principal_satang` with min ≤ max; unique positive `allowed_term_months`; positive `offer_validity_days` | Central rules for `LoanOffer` fields. The schema defines value shape only and sets no actual thresholds or term values. |

Interest-rate bounds and recommendation/ML values are omitted because the repository does not establish their units or source-of-truth policy. Matching Pydantic and Zod validators are implemented in `ML/platform_policy_contracts.py` and `web/src/lib/contracts/platform-policy.ts`. They couple relational `policyCode` to the correct JSON schema version, reject unknown fields, and check bounds, unique terms/categories/channels, and required notification channels.

### Approved document scan details

The owner approved provider-neutral `document_scan_details.v1` details with `findings: [{ code, severity }]`, where severity is `INFO`, `LOW`, `HIGH`, or `CRITICAL`. `scannerVersion` and scan `result` remain relational. Raw scanner payloads and file contents are excluded. Matching Pydantic/Zod validators are in `ML/document_scan_contract.py` and `web/src/lib/contracts/document-scan.ts`; the nullable Prisma field remains nullable for existing rows, while populated details must follow the versioned shape.

The five `BorrowerFinancialInformation` JSON documents now have matching Pydantic/Zod contracts in `ML/borrower_financial_contracts.py` and `web/src/lib/contracts/borrower-financial.ts`:

| JSON column | Schema version | Allowed categories / fields |
|---|---|---|
| `incomeData` | `borrower_income.v1` | `SALARY`, `BUSINESS`, `FREELANCE`, `RENTAL`, `INVESTMENT`, `OTHER` |
| `expenseData` | `borrower_expenses.v1` | `HOUSING`, `UTILITIES`, `FOOD`, `TRANSPORT`, `HEALTHCARE`, `EDUCATION`, `INSURANCE`, `FAMILY_SUPPORT`, `OTHER` |
| `debtData` | `borrower_debts.v1` | `CREDIT_CARD`, `PERSONAL_LOAN`, `AUTO_LOAN`, `MORTGAGE`, `STUDENT_LOAN`, `OTHER` |
| `creditData` | `borrower_credit.v1` | One report with bureau name/date, nullable score, and nonnegative 12-month inquiry/delinquency counts |
| `sourceMetadata` | `borrower_financial_sources.v1` | Per-entry `source_type`, `captured_at`, and `verification_status` |

Income, expense, and debt records use typed `items` arrays with integer satang amounts and explicit frequency (`WEEKLY`, `BIWEEKLY`, `MONTHLY`, `QUARTERLY`, `YEARLY`, `ONE_TIME`). Source types are `SELF_DECLARED`, `DOCUMENT`, `BANK_STATEMENT`, `CREDIT_BUREAU`, `OTHER`; statuses are `SELF_REPORTED`, `PENDING`, `VERIFIED`, `REJECTED`. Document IDs remain relational. The aggregate validator requires one matching provenance record for every item and rejects duplicate entry IDs. Credit score ranges and bureau-name enumeration remain unspecified, so scores are nonnegative integers and bureau names are nonempty strings.

`ScheduleVersion.scheduleInputs` and `scheduleSnapshot` now have matching versioned contracts in `ML/schedule_contracts.py` and `web/src/lib/contracts/schedule.ts`. Inputs contain positive principal in satang, positive term in months, and the first due date; calculation method, rate, payment frequency, day-count convention, and rounding remain in relational columns. The snapshot contains the generated installment number, due date, opening principal, principal due, and interest due. Payment progress remains relational. The combined validator checks installment count against term, first due date agreement, consecutive numbering, ordered dates, safe integer satang values, and nonnegative amounts.

## 10. Phase 2 scope and remaining work

1. Training dataset currency is out of scope for this phase, as directed. Model features continue to be supplied in the model's current native units; do not describe them as NEXUS THB or satang.
2. `PredictionRecord.explanation` stays nullable and null-only until an approved producer and field catalog exist. The Python/Zod contract inventory test covers the field and its validators.
3. Historical database compatibility is out of scope for this phase, as directed. New writes remain versioned and immutable.
4. Implemented: the Next.js prediction persistence route validates the request and feature snapshot, checks the current application version and active approved model version, calls the ML API with a private service token, validates its single-item response, and writes feature/prediction records transactionally. `OFFICIAL` writes supersede the current risk assessment and create a new one in the same transaction; `PRELIMINARY` and `DIAGNOSTIC` create immutable prediction records without changing risk assessments.
5. Implemented: the FastAPI `/predict` route requires `X-ML-Service-Token` and fails closed when its secret is missing or shorter than 32 characters. The Next.js persistence endpoint uses a separate `PREDICTION_PERSIST_TOKEN`, bounds request-body size, enforces a timeout, and returns generic errors without forwarding provider or database details.
6. Configure independent random values of at least 32 characters for `ML_SERVICE_TOKEN` and `PREDICTION_PERSIST_TOKEN` in deployment secrets. `ML_SERVICE_URL` must point to the private ML service. Keep these values server-side and out of source control.
7. After scoped Phase 2 verification, proceed to Phase 4 seed scripts; do not treat ML fixture JSON as database seed records.

## 11. Completion gate

Under the current scope, Phase 2 is complete when every in-scope JSON field has an owner, versioned shape, types/units, validation behavior, and matching Python/Zod contracts; the prediction service integration validates and persists the approved records with the correct prediction-type lifecycle; focused contract and type checks pass; and no preliminary or diagnostic run can alter official risk assessments. Dataset currency and compatibility with historical database rows are explicitly excluded.

## 12. Implemented in the Phase 2 follow-up

- Added `ML/feature_contract.py` as the single ordered feature-name list used by `predict.py` and `src/recommendation/prediction/ml_adapter.py`; added matching Zod feature/request/response/feature-snapshot schemas in `web/src/lib/contracts/risk.ts` and a test to detect list/version drift.
- Added matching Pydantic validation for the persisted `FeatureSnapshot` JSON shape, including timezone and exact metadata-key checks.
- Added matching Pydantic/Zod contracts for versioned investor preferences and recommendation explanations. Recommendation rates are percentage points; recommendation monetary units remain unresolved against NEXUS currency.
- Added matching Pydantic/Zod contracts for preference and candidate recommendation-run snapshots. The candidate contract is validated against repository loan fixtures.
- Implemented approved `LOAN_VIEWED` and `LOAN_COMPARED` event contracts with strict versioned payloads, forbidden extra fields, and comparison groups limited to 2–3 loans.
- Added recommendation, prediction, application, financial, schedule, workflow, event, audit, correction, history, platform-policy, document-scan, borrower-address, outbox, idempotency, and JSON-inventory tests; the focused contract/adapter suite passes 131 tests and the web TypeScript check passes.
- Added the `nexus_risk_features.v1` request envelope with temporary raw-v1 compatibility and the `nexus_prediction_batch.v1` response contract in Python and Zod. Both enforce finite prediction values, processed-count consistency, unique/disjoint batch indices, and status/error consistency.
- Added matching Python/Zod `nexus_prediction_output.v1` contracts for the immutable `PredictionRecord.predictionOutput` document, based on the existing prediction fields and excluding model identity already stored relationally. Added null-only Python/Zod validation for `PredictionRecord.explanation` pending an approved producer and non-null field catalog.
- Added matching Python/Zod `application_snapshot.v1` contracts using the approved borrower/employment/requested-loan field catalog. Financial and credit values remain in `BorrowerFinancialInformation`; optional fields use explicit `null` and unknown keys are rejected.
- Added a standalone `borrower_profile_address.v1` version wrapper using the same strict address properties as the approved application snapshot.
- Added matching versioned contracts for all five `BorrowerFinancialInformation` JSON columns, including approved typed category/frequency allowlists, entry-level provenance, 12-month credit summary counts, and cross-document provenance consistency checks.
- Added matching versioned schedule input and generated installment snapshot contracts; checked term/count and first-due-date consistency while keeping payment progress in relational installment columns.
- Added approved `account_restriction_scope.v1` and `information_request_details.v1` contracts in Python and Zod, including relation-specific scope allowlists and unique requested field codes.
- Added the approved security/system event allowlists as `security_event_metadata.v1` and `system_event_metadata.v1`, with exact event-to-payload matching and secret/raw-request exclusions.
- Added approved `audit_values.v1` and `data_correction_request.v1` envelopes, including paired before/after field-set matching, recursive JSON-value validation, and unique field-code checks.
- Applied `audit_values.v1` to nullable alert/support history pairs, with matching field-code checks; support status and actor remain relational.
- Added the approved `ESSENTIAL_NOTIFICATION_POLICY` and `LOAN_OFFER_POLICY` validators, keeping configurable policy values versioned and all unspecified thresholds unset.
- Added approved `document_scan_details.v1` normalized finding contracts; scanner version/result stay relational and raw provider payloads/file contents are rejected.
- Added approved `nexus_outbox_payload.v1` event-specific payload validators for all six outbox event types, with event-type matching and positive satang validation.
- Added the approved operation-specific `idempotency_response.v1` schemas for ledger transactions, investment contributions, investor payouts, and withdrawal requests; nullable response snapshots remain supported.
- Added a strict `nexus_prediction_persist_request.v1` request schema and a server-side Next.js route at `web/src/app/api/applications/[applicationId]/predictions/route.ts`. It requires a private persistence bearer token, limits requests to 32 KiB, verifies that the requested application version is current, verifies that the model version is active, approved, and schema-compatible, and calls ML with a separate service token and 10-second timeout.
- The persistence route validates the versioned feature snapshot and prediction response before writing. It persists FeatureSnapshot and PredictionRecord rows in a serializable transaction. Only `OFFICIAL` predictions create RiskAssessment rows and supersede the previous current assessment; preliminary and diagnostic records never alter risk assessments. Database uniqueness conflicts return 409.
- Protected FastAPI `/predict` with constant-time `X-ML-Service-Token` validation. Missing secrets fail closed with 503; bad or absent tokens receive 401. Updated API test clients and added direct auth-dependency checks.
- Added empty `.env.example` entries for the distinct persistence and ML service secrets; placeholders are intentionally blank so copied examples fail closed until configured.
- Updated FastAPI feature descriptions/examples and utilization bounds; corrected the interest-burden example to match the preprocessing formula.
- Updated prediction API, integration, performance, and engine-health fixtures with normalized utilization values, percentage-point DTI, and the derived interest-burden ratio. Added rejection checks for percentage-point utilization, missing features, numeric strings, booleans, and unexpected fields.
- Latest verification: the previous focused contract/adapter suite passed (131 tests); current ML auth dependency tests passed (3 tests); `py_compile` passed for the modified Python service and tests; `npx tsc --noEmit` passed. The FastAPI TestClient route suite did not complete in this Windows environment, so route-level behavior is not reported as passing. A live Next.js-to-ML-to-database transaction was not run because this environment has no configured service secrets/database integration session.

With dataset currency and historical database compatibility explicitly excluded, the Phase 2 route and persistence implementation is now in place. Before enabling it in a deployed environment, configure the two independent secrets and run one controlled end-to-end write against the configured database and private ML service. This deployment smoke check is still outstanding; do not expose the persistence endpoint to browser clients.
