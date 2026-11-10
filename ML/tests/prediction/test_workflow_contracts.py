from pathlib import Path

import pytest
from pydantic import ValidationError

from workflow_contracts import AccountRestrictionContract, InformationRequestDetailsContract


def test_restriction_types_match_their_scope_allowlists():
    base = {"schema_version": "account_restriction_scope.v1"}
    assert AccountRestrictionContract.model_validate({
        "restriction_type": "ACCOUNT_FREEZE", "scope": {**base, "scope_type": "ACCOUNT"},
    }).restriction_type == "ACCOUNT_FREEZE"
    assert AccountRestrictionContract.model_validate({
        "restriction_type": "WITHDRAWAL_BLOCK", "scope": {
            **base, "scope_type": "WALLET_IDS", "wallet_ids": ["123e4567-e89b-12d3-a456-426614174000"],
        },
    }).scope.scope_type == "WALLET_IDS"

    contract_path = Path(__file__).resolve().parents[3] / "web" / "src" / "lib" / "contracts" / "workflow.ts"
    zod_contract = contract_path.read_text(encoding="utf-8")
    for value in ("ACCOUNT_FREEZE", "WITHDRAWAL_BLOCK", "INVESTMENT_BLOCK", "APPLICATION_BLOCK",
                  "ALL_WALLETS", "WALLET_IDS", "ALL_LOANS", "LOAN_IDS", "ALL_APPLICATIONS", "APPLICATION_IDS"):
        assert value in zod_contract
    for value in ("information_request_details.v1", "field_code", "prompt", "required", "response_type",
                  "TEXT", "NUMBER", "DATE", "DOCUMENT", "YES_NO"):
        assert value in zod_contract


def test_restriction_rejects_mismatched_scope_duplicate_targets_and_extras():
    with pytest.raises(ValidationError, match="not allowed for restriction_type"):
        AccountRestrictionContract.model_validate({
            "restriction_type": "WITHDRAWAL_BLOCK",
            "scope": {"schema_version": "account_restriction_scope.v1", "scope_type": "ALL_LOANS"},
        })
    with pytest.raises(ValidationError, match="must be unique"):
        AccountRestrictionContract.model_validate({
            "restriction_type": "INVESTMENT_BLOCK",
            "scope": {"schema_version": "account_restriction_scope.v1", "scope_type": "LOAN_IDS",
                      "loan_ids": ["123e4567-e89b-12d3-a456-426614174000", "123e4567-e89b-12d3-a456-426614174000"]},
        })
    with pytest.raises(ValidationError):
        AccountRestrictionContract.model_validate({
            "restriction_type": "WITHDRAWAL_BLOCK",
            "scope": {"schema_version": "account_restriction_scope.v1", "scope_type": "ALL_WALLETS",
                      "wallet_ids": []},
        })


def test_information_request_items_are_versioned_strict_and_unique():
    value = InformationRequestDetailsContract.model_validate({
        "schema_version": "information_request_details.v1",
        "items": [
            {"field_code": "income_proof", "prompt": "Upload proof of income", "required": True,
             "response_type": "DOCUMENT"},
            {"field_code": "employer_name", "prompt": "Confirm your employer", "required": False,
             "response_type": "TEXT"},
        ],
    })
    assert len(value.items) == 2

    with pytest.raises(ValidationError, match="must be unique"):
        InformationRequestDetailsContract.model_validate({
            "schema_version": "information_request_details.v1",
            "items": [
                {"field_code": "income_proof", "prompt": "One", "required": True, "response_type": "DOCUMENT"},
                {"field_code": "income_proof", "prompt": "Two", "required": False, "response_type": "TEXT"},
            ],
        })
    with pytest.raises(ValidationError):
        InformationRequestDetailsContract.model_validate({
            "schema_version": "information_request_details.v2", "items": [],
        })
