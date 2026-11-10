from pathlib import Path

import pytest
from pydantic import ValidationError

from event_contracts import SecurityEventContract, SystemEventContract


def test_security_event_specific_metadata_and_types():
    valid = SecurityEventContract.model_validate({
        "event_type": "AUTHENTICATION_FAILED",
        "metadata": {"schema_version": "security_event_metadata.v1", "auth_method": "PASSWORD",
                     "reason_code": "INVALID_CREDENTIALS"},
    })
    assert valid.event_type == "AUTHENTICATION_FAILED"

    with pytest.raises(ValidationError, match="does not match event_type"):
        SecurityEventContract.model_validate({
            "event_type": "PASSWORD_CHANGED",
            "metadata": {"schema_version": "security_event_metadata.v1", "auth_method": "PASSWORD"},
        })
    with pytest.raises(ValidationError):
        SecurityEventContract.model_validate({
            "event_type": "AUTHENTICATION_SUCCEEDED",
            "metadata": {"schema_version": "security_event_metadata.v1", "auth_method": "PASSWORD",
                         "password": "must-not-be-accepted"},
        })


def test_system_events_validate_type_payload_and_required_fields():
    valid = SystemEventContract.model_validate({
        "event_type": "JOB_FAILED",
        "metadata": {"schema_version": "system_event_metadata.v1", "job_name": "nightly_import",
                     "error_code": "SOURCE_UNAVAILABLE", "attempt_number": 2},
    })
    assert valid.event_type == "JOB_FAILED"

    with pytest.raises(ValidationError, match="does not match event_type"):
        SystemEventContract.model_validate({
            "event_type": "DATABASE_MIGRATION_APPLIED",
            "metadata": {"schema_version": "system_event_metadata.v1", "job_name": "migrate",
                         "error_code": "FAILED", "attempt_number": 1},
        })
    with pytest.raises(ValidationError):
        SystemEventContract.model_validate({
            "event_type": "JOB_FAILED",
            "metadata": {"schema_version": "system_event_metadata.v1", "job_name": "job",
                         "error_code": "ERROR", "attempt_number": 0},
        })


def test_event_type_and_metadata_allowlists_match_zod():
    contract_path = Path(__file__).resolve().parents[3] / "web" / "src" / "lib" / "contracts" / "events.ts"
    contract = contract_path.read_text(encoding="utf-8")
    for event_type in (
        "AUTHENTICATION_SUCCEEDED", "AUTHENTICATION_FAILED", "MFA_FAILED", "PASSWORD_RESET_REQUESTED",
        "PASSWORD_CHANGED", "SESSION_REVOKED", "ACCESS_DENIED", "WORKER_STARTED", "WORKER_STOPPED",
        "JOB_FAILED", "SERVICE_HEALTH_CHANGED", "MODEL_LOAD_FAILED", "DATABASE_MIGRATION_APPLIED",
    ):
        assert event_type in contract
    for version in ("security_event_metadata.v1", "system_event_metadata.v1"):
        assert version in contract
