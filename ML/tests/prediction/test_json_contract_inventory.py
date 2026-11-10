import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


CONTRACTS = {
    "BorrowerProfile.address": ("application_snapshot_contract.py", "BorrowerProfileAddressContract", "application.ts", "BorrowerProfileAddressSchema"),
    "SecurityEvent.metadata": ("event_contracts.py", "SecurityEventContract", "events.ts", "SecurityEventContractSchema"),
    "AccountRestriction.scope": ("workflow_contracts.py", "AccountRestrictionContract", "workflow.ts", "AccountRestrictionContractSchema"),
    "ApplicationVersion.submittedData": ("application_snapshot_contract.py", "ApplicationSnapshotContract", "application.ts", "ApplicationSnapshotSchema"),
    "BorrowerFinancialInformation.incomeData": ("borrower_financial_contracts.py", "IncomeDataContract", "borrower-financial.ts", "IncomeDataSchema"),
    "BorrowerFinancialInformation.expenseData": ("borrower_financial_contracts.py", "ExpenseDataContract", "borrower-financial.ts", "ExpenseDataSchema"),
    "BorrowerFinancialInformation.debtData": ("borrower_financial_contracts.py", "DebtDataContract", "borrower-financial.ts", "DebtDataSchema"),
    "BorrowerFinancialInformation.creditData": ("borrower_financial_contracts.py", "CreditDataContract", "borrower-financial.ts", "CreditDataSchema"),
    "BorrowerFinancialInformation.sourceMetadata": ("borrower_financial_contracts.py", "SourceMetadataContract", "borrower-financial.ts", "SourceMetadataSchema"),
    "InformationRequest.requestDetails": ("workflow_contracts.py", "InformationRequestDetailsContract", "workflow.ts", "InformationRequestDetailsSchema"),
    "ScheduleVersion.scheduleInputs": ("schedule_contracts.py", "ScheduleInputsContract", "schedule.ts", "ScheduleInputsSchema"),
    "ScheduleVersion.scheduleSnapshot": ("schedule_contracts.py", "ScheduleSnapshotContract", "schedule.ts", "ScheduleSnapshotSchema"),
    "FeatureSnapshot.featureValues": ("feature_snapshot_contract.py", "FeatureSnapshotContract", "risk.ts", "FeatureSnapshotContractSchema"),
    "FeatureSnapshot.featureUnits": ("feature_snapshot_contract.py", "FeatureSnapshotContract", "risk.ts", "FeatureSnapshotContractSchema"),
    "FeatureSnapshot.sourceMapping": ("feature_snapshot_contract.py", "FeatureSnapshotContract", "risk.ts", "FeatureSnapshotContractSchema"),
    "PredictionRecord.predictionOutput": ("main.py", "PersistedPredictionOutputSchema", "risk.ts", "PersistedPredictionOutputSchema"),
    "PredictionRecord.explanation": ("prediction_explanation_contract.py", "PredictionRecordExplanationAdapter", "risk.ts", "PredictionRecordExplanationSchema"),
    "AuditLog.oldValues": ("audit_correction_contracts.py", "AuditValuesContract", "audit-correction.ts", "AuditValuesSchema"),
    "AuditLog.newValues": ("audit_correction_contracts.py", "AuditValuesContract", "audit-correction.ts", "AuditValuesSchema"),
    "PolicyVersion.policyValues": ("platform_policy_contracts.py", "PlatformPolicyContract", "platform-policy.ts", "PlatformPolicyContractSchema"),
    "AlertHistory.oldValue": ("audit_correction_contracts.py", "HistoryValuesPairContract", "audit-correction.ts", "HistoryValuesPairSchema"),
    "AlertHistory.newValue": ("audit_correction_contracts.py", "HistoryValuesPairContract", "audit-correction.ts", "HistoryValuesPairSchema"),
    "SupportHistory.oldValue": ("audit_correction_contracts.py", "HistoryValuesPairContract", "audit-correction.ts", "HistoryValuesPairSchema"),
    "SupportHistory.newValue": ("audit_correction_contracts.py", "HistoryValuesPairContract", "audit-correction.ts", "HistoryValuesPairSchema"),
    "IdempotencyRecord.responseSnapshot": ("idempotency_contracts.py", "IdempotencyResponseSnapshotContract", "idempotency.ts", "IdempotencyResponseSnapshotSchema"),
    "OutboxEvent.payload": ("outbox_contracts.py", "OutboxEventContract", "outbox.ts", "OutboxEventContractSchema"),
    "SystemEvent.metadata": ("event_contracts.py", "SystemEventContract", "events.ts", "SystemEventContractSchema"),
    "DocumentSecurityScan.details": ("document_scan_contract.py", "DocumentScanDetailsContract", "document-scan.ts", "DocumentScanDetailsSchema"),
    "DataCorrectionRequest.requestedChange": ("audit_correction_contracts.py", "DataCorrectionRequestContract", "audit-correction.ts", "DataCorrectionRequestSchema"),
    "InvestorPreference.preferenceData": ("src/recommendation/contracts.py", "InvestorPreferenceContract", "risk.ts", "InvestorPreferenceContractSchema"),
    "InvestorBehavior.eventData": ("src/recommendation/contracts.py", "InvestorBehaviorEventContract", "risk.ts", "InvestorBehaviorEventContractSchema"),
    "RecommendationRun.preferenceSnapshot": ("src/recommendation/contracts.py", "RecommendationRunPreferenceSnapshot", "risk.ts", "RecommendationRunPreferenceSnapshotSchema"),
    "RecommendationRun.candidateSetSnapshot": ("src/recommendation/contracts.py", "RecommendationRunCandidateSnapshot", "risk.ts", "RecommendationRunCandidateSnapshotSchema"),
    "RecommendationResult.explanation": ("src/recommendation/contracts.py", "RecommendationResultExplanationContract", "risk.ts", "RecommendationResultExplanationSchema"),
}

def prisma_json_fields():
    schema = (ROOT / "web" / "prisma" / "schema.prisma").read_text(encoding="utf-8")
    fields = set()
    for model_match in re.finditer(r"(?ms)^model\s+(\w+)\s*\{(.*?)^\}", schema):
        model_name, body = model_match.groups()
        for field_match in re.finditer(r"(?m)^\s*(\w+)\s+Json\??\s", body):
            fields.add(f"{model_name}.{field_match.group(1)}")
    return fields


def test_every_prisma_json_field_is_documented_and_has_python_and_zod_contracts():
    actual_fields = prisma_json_fields()
    contract_fields = set(CONTRACTS)
    assert actual_fields == contract_fields

    docs = (ROOT / "web" / "docs" / "PHASE_2_JSONB_DATA_CONTRACTS.md").read_text(encoding="utf-8")
    for field_name in actual_fields:
        assert f"`{field_name}`" in docs, f"{field_name} missing from the JSON field inventory"

    for field_name, (python_file, python_symbol, ts_file, ts_symbol) in CONTRACTS.items():
        python_source = (ROOT / "ML" / python_file).read_text(encoding="utf-8")
        typescript_source = (ROOT / "web" / "src" / "lib" / "contracts" / ts_file).read_text(encoding="utf-8")
        assert python_symbol in python_source, f"{field_name} lacks its Python contract"
        assert ts_symbol in typescript_source, f"{field_name} lacks its Zod contract"

