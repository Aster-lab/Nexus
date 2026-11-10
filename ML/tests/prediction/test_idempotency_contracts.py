from pathlib import Path

import pytest
from pydantic import ValidationError

from idempotency_contracts import IdempotencyResponseSnapshotContract


UUID1 = "123e4567-e89b-12d3-a456-426614174000"
UUID2 = "123e4567-e89b-12d3-a456-426614174001"


@pytest.mark.parametrize(("operation_type", "response"), [
    ("CREATE_LEDGER_TRANSACTION", {"ledger_transaction_id": UUID1, "status": "POSTED"}),
    ("CREATE_INVESTMENT_CONTRIBUTION", {"contribution_id": UUID1, "investment_id": UUID2,
                                         "amount_satang": 250000}),
    ("CREATE_INVESTOR_PAYOUT", {"investor_payout_id": UUID1, "status": "PENDING",
                                 "principal_satang": 200000, "interest_satang": 10000}),
    ("CREATE_WITHDRAWAL_REQUEST", {"withdrawal_request_id": UUID1, "status": "REQUESTED",
                                    "amount_satang": 50000}),
])
def test_idempotency_operation_response_schemas(operation_type, response):
    snapshot = IdempotencyResponseSnapshotContract.model_validate({
        "operation_type": operation_type,
        "response_snapshot": {"schema_version": "idempotency_response.v1", **response},
    })
    assert snapshot.operation_type == operation_type


def test_idempotency_rejects_operation_mismatch_invalid_status_and_amount():
    with pytest.raises(ValidationError, match="does not match operation_type"):
        IdempotencyResponseSnapshotContract.model_validate({
            "operation_type": "CREATE_WITHDRAWAL_REQUEST",
            "response_snapshot": {"schema_version": "idempotency_response.v1",
                                  "ledger_transaction_id": UUID1, "status": "POSTED"},
        })
    with pytest.raises(ValidationError):
        IdempotencyResponseSnapshotContract.model_validate({
            "operation_type": "CREATE_WITHDRAWAL_REQUEST",
            "response_snapshot": {"schema_version": "idempotency_response.v1",
                                  "withdrawal_request_id": UUID1, "status": "UNKNOWN", "amount_satang": 500},
        })


def test_idempotency_contract_matches_zod_operation_allowlist():
    contract_path = Path(__file__).resolve().parents[3] / "web" / "src" / "lib" / "contracts" / "idempotency.ts"
    contract = contract_path.read_text(encoding="utf-8")
    for value in (
        "idempotency_response.v1", "CREATE_LEDGER_TRANSACTION", "CREATE_INVESTMENT_CONTRIBUTION",
        "CREATE_INVESTOR_PAYOUT", "CREATE_WITHDRAWAL_REQUEST", "ledger_transaction_id",
        "contribution_id", "investment_id", "amount_satang", "investor_payout_id",
        "principal_satang", "interest_satang", "withdrawal_request_id",
    ):
        assert value in contract


def test_idempotency_snapshot_preserves_nullable_in_progress_state():
    value = IdempotencyResponseSnapshotContract.model_validate({
        "operation_type": "CREATE_WITHDRAWAL_REQUEST", "response_snapshot": None,
    })
    assert value.response_snapshot is None
