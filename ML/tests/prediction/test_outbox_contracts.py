from pathlib import Path

import pytest
from pydantic import ValidationError

from outbox_contracts import OutboxEventContract


UUID_VALUE = "123e4567-e89b-12d3-a456-426614174000"


@pytest.mark.parametrize(("event_type", "event_data"), [
    ("APPLICATION_SUBMITTED", {"application_version_id": UUID_VALUE}),
    ("INVESTMENT_COMMITTED", {"investment_id": UUID_VALUE, "principal_satang": 250000}),
    ("LOAN_FUNDED", {"repayment_schedule_id": UUID_VALUE}),
    ("REPAYMENT_POSTED", {"repayment_id": UUID_VALUE, "total_satang": 150000}),
    ("WITHDRAWAL_REQUESTED", {"withdrawal_request_id": UUID_VALUE, "amount_satang": 50000}),
    ("DOCUMENT_SCAN_REQUESTED", {"document_id": UUID_VALUE}),
])
def test_approved_outbox_event_payloads(event_type, event_data):
    value = OutboxEventContract.model_validate({
        "event_type": event_type,
        "payload": {"schema_version": "nexus_outbox_payload.v1", "event_data": event_data},
    })
    assert value.event_type == event_type


def test_outbox_rejects_event_shape_mismatch_and_invalid_amounts():
    with pytest.raises(ValidationError, match="does not match event_type"):
        OutboxEventContract.model_validate({
            "event_type": "APPLICATION_SUBMITTED",
            "payload": {"schema_version": "nexus_outbox_payload.v1",
                        "event_data": {"document_id": UUID_VALUE}},
        })
    with pytest.raises(ValidationError):
        OutboxEventContract.model_validate({
            "event_type": "INVESTMENT_COMMITTED",
            "payload": {"schema_version": "nexus_outbox_payload.v1",
                        "event_data": {"investment_id": UUID_VALUE, "principal_satang": 0}},
        })


def test_outbox_allowlist_matches_zod_contract():
    contract_path = Path(__file__).resolve().parents[3] / "web" / "src" / "lib" / "contracts" / "outbox.ts"
    contract = contract_path.read_text(encoding="utf-8")
    for value in (
        "nexus_outbox_payload.v1", "APPLICATION_SUBMITTED", "INVESTMENT_COMMITTED", "LOAN_FUNDED",
        "REPAYMENT_POSTED", "WITHDRAWAL_REQUESTED", "DOCUMENT_SCAN_REQUESTED",
        "application_version_id", "investment_id", "principal_satang", "repayment_schedule_id",
        "repayment_id", "total_satang", "withdrawal_request_id", "amount_satang", "document_id",
    ):
        assert value in contract
