from pathlib import Path

import pytest
from pydantic import ValidationError

from audit_correction_contracts import (
    AuditLogValuesPairContract,
    AuditValuesContract,
    DataCorrectionRequestContract,
    HistoryValuesPairContract,
)


def test_audit_values_pair_accepts_same_fields_and_nullable_sides():
    before = {"schema_version": "audit_values.v1", "fields": [
        {"field_code": "status", "value": "PENDING"},
        {"field_code": "attempt_count", "value": 2},
    ]}
    after = {"schema_version": "audit_values.v1", "fields": [
        {"field_code": "status", "value": "COMPLETED"},
        {"field_code": "attempt_count", "value": 2},
    ]}
    pair = AuditLogValuesPairContract.model_validate({"old_values": before, "new_values": after})
    assert len(pair.old_values.fields) == 2
    AuditLogValuesPairContract.model_validate({"old_values": None, "new_values": after})


def test_audit_and_correction_contracts_reject_mismatches_duplicates_and_non_json_values():
    before = {"schema_version": "audit_values.v1", "fields": [{"field_code": "status", "value": "OLD"}]}
    after = {"schema_version": "audit_values.v1", "fields": [{"field_code": "state", "value": "NEW"}]}
    with pytest.raises(ValidationError, match="same field_code set"):
        AuditLogValuesPairContract.model_validate({"old_values": before, "new_values": after})

    with pytest.raises(ValidationError, match="must not contain NaN or infinity"):
        AuditValuesContract.model_validate({"schema_version": "audit_values.v1", "fields": [
            {"field_code": "ratio", "value": float("nan")},
        ]})

    request = DataCorrectionRequestContract.model_validate({
        "schema_version": "data_correction_request.v1",
        "changes": [{"field_code": "phone", "proposed_value": "+66123456789"}],
    })
    assert request.changes[0].field_code == "phone"
    with pytest.raises(ValidationError, match="must be unique"):
        DataCorrectionRequestContract.model_validate({
            "schema_version": "data_correction_request.v1",
            "changes": [
                {"field_code": "phone", "proposed_value": "one"},
                {"field_code": "phone", "proposed_value": "two"},
            ],
        })


def test_audit_and_correction_shapes_match_zod_contract():
    contract_path = Path(__file__).resolve().parents[3] / "web" / "src" / "lib" / "contracts" / "audit-correction.ts"
    contract = contract_path.read_text(encoding="utf-8")
    for value in (
        "audit_values.v1", "data_correction_request.v1", "old_values", "new_values",
        "old_value", "new_value", "field_code", "proposed_value", "same field_code set",
        "field_code values must be unique",
    ):
        assert value in contract


def test_alert_and_support_history_reuse_audit_value_contract():
    before = {"schema_version": "audit_values.v1", "fields": [{"field_code": "priority", "value": "LOW"}]}
    after = {"schema_version": "audit_values.v1", "fields": [{"field_code": "priority", "value": "HIGH"}]}
    pair = HistoryValuesPairContract.model_validate({"old_value": before, "new_value": after})
    assert pair.new_value.fields[0].value == "HIGH"
    with pytest.raises(ValidationError, match="same field_code set"):
        HistoryValuesPairContract.model_validate({
            "old_value": before,
            "new_value": {"schema_version": "audit_values.v1", "fields": [{"field_code": "status", "value": "OPEN"}]},
        })
