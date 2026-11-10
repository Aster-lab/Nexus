import pytest
from pathlib import Path
from pydantic import ValidationError

from feature_contract import (
    FEATURE_NAMES,
    FEATURE_SCHEMA_VERSION,
    PREDICTION_OUTPUT_SCHEMA_VERSION,
    PREDICTION_RESPONSE_SCHEMA_VERSION,
)
from main import (
    LoanApplicationSchema,
    PredictionBatchResponseSchema,
    PersistedPredictionOutputSchema,
    parse_prediction_item,
    predict_credit_risk,
)
from feature_snapshot_contract import FeatureSnapshotContract
from application_snapshot_contract import ApplicationSnapshotContract, BorrowerProfileAddressContract
from predict import FEATURE_NAMES as PREDICT_FEATURE_NAMES
from recommendation.prediction.ml_adapter import FEATURE_NAMES as ADAPTER_FEATURE_NAMES
from prediction_explanation_contract import PredictionRecordExplanationAdapter


VALID_FEATURES = {
    "annual_income": 75000.0,
    "dti": 16.5,
    "loan_amount": 12000.0,
    "acc_open_past_24mths": 2.0,
    "bc_util": 0.195,
    "lti": 0.16,
    "interest_burden": 0.0184,
    "sub_grade_num": 12.0,
    "int_rate": 0.115,
    "revol_util": 0.382,
    "term_months": 36.0,
}


def test_feature_order_is_shared_by_inference_and_adapter():
    assert FEATURE_SCHEMA_VERSION == "nexus_risk_features.v1"
    assert PREDICT_FEATURE_NAMES == FEATURE_NAMES
    assert ADAPTER_FEATURE_NAMES == FEATURE_NAMES
    validated = LoanApplicationSchema.model_validate(VALID_FEATURES)
    assert validated.to_feature_list() == [VALID_FEATURES[name] for name in FEATURE_NAMES]


def test_web_zod_contract_uses_the_same_order_and_versions():
    contract_path = Path(__file__).resolve().parents[3] / "web" / "src" / "lib" / "contracts" / "risk.ts"
    contract = contract_path.read_text(encoding="utf-8")
    names_block = contract.split("export const RISK_FEATURE_NAMES = [", 1)[1].split("] as const", 1)[0]
    names = tuple(line.strip().strip(',').strip('"') for line in names_block.splitlines() if line.strip())
    assert names == FEATURE_NAMES
    assert f'"{FEATURE_SCHEMA_VERSION}"' in contract
    assert f'"{PREDICTION_RESPONSE_SCHEMA_VERSION}"' in contract
    assert f'"{PREDICTION_OUTPUT_SCHEMA_VERSION}"' in contract


def test_versioned_request_and_legacy_v1_compatibility():
    envelope = {
        "schema_version": FEATURE_SCHEMA_VERSION,
        "features": VALID_FEATURES,
    }
    assert parse_prediction_item(envelope).to_feature_list() == [
        VALID_FEATURES[name] for name in FEATURE_NAMES
    ]
    assert parse_prediction_item(VALID_FEATURES).to_feature_list() == [
        VALID_FEATURES[name] for name in FEATURE_NAMES
    ]


def test_unknown_request_schema_version_is_rejected():
    from pydantic import ValidationError

    envelope = {"schema_version": "nexus_risk_features.v2", "features": VALID_FEATURES}
    with pytest.raises(ValidationError):
        parse_prediction_item(envelope)


def test_prediction_response_declares_schema_version(monkeypatch):
    class FakeEngine:
        def predict_risk(self, batches):
            return [{
                "default_probability": 0.2,
                "tier": {
                    "tier_code": "TIER_B", "tier_name": "Tier B", "risk_level": "MODERATE",
                    "action_code": "APPROVE", "rate_markup": 0.025, "ui_badge_color": "blue",
                },
                "spatial_metrics": {"macro_cluster": 2, "quantization_distance": 0.15},
            } for _ in batches]

    monkeypatch.setattr("main.engine", FakeEngine())
    result = predict_credit_risk(VALID_FEATURES)
    assert result["schema_version"] == PREDICTION_RESPONSE_SCHEMA_VERSION
    assert result["status"] == "success"


@pytest.mark.parametrize("field", FEATURE_NAMES)
@pytest.mark.parametrize("bad_value", [float("nan"), float("inf"), float("-inf")])
def test_non_finite_feature_values_are_rejected(field, bad_value):
    invalid = {**VALID_FEATURES, field: bad_value}
    with pytest.raises(Exception):
        LoanApplicationSchema.model_validate(invalid)


def test_partial_batch_response_contract():
    response = PredictionBatchResponseSchema.model_validate({
        "schema_version": PREDICTION_RESPONSE_SCHEMA_VERSION,
        "status": "partial_success",
        "processed_count": 1,
        "data": [{
            "index": 0,
            "prediction": {
                "default_probability": 0.2,
                "tier": {
                    "tier_code": "TIER_B", "tier_name": "Tier B", "risk_level": "MODERATE",
                    "action_code": "APPROVE", "rate_markup": 0.025, "ui_badge_color": "blue",
                },
                "spatial_metrics": {"macro_cluster": 2, "quantization_distance": 0.15},
            },
        }],
        "errors": [{
            "index": 1,
            "error_code": "VALIDATION_ERROR",
            "details": [{"field": "dti", "message": "invalid"}],
        }],
    })
    assert response.status == "partial_success"
    assert response.processed_count == 1


def test_prediction_response_rejects_unsupported_version():
    response = {
        "schema_version": "nexus_prediction_batch.v0",
        "status": "success",
        "processed_count": 0,
        "data": [],
        "errors": [],
    }
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        PredictionBatchResponseSchema.model_validate(response)


def test_persisted_prediction_output_contract():
    output = {
        "schema_version": PREDICTION_OUTPUT_SCHEMA_VERSION,
        "default_probability": 0.2,
        "tier": {
            "tier_code": "TIER_B", "tier_name": "Tier B", "risk_level": "MODERATE",
            "action_code": "APPROVE", "rate_markup": 0.025, "ui_badge_color": "blue",
        },
        "spatial_metrics": {"macro_cluster": 2, "quantization_distance": 0.15},
    }
    assert PersistedPredictionOutputSchema.model_validate(output).schema_version == PREDICTION_OUTPUT_SCHEMA_VERSION

    unsupported = {**output, "schema_version": "nexus_prediction_output.v0"}
    with pytest.raises(ValidationError):
        PersistedPredictionOutputSchema.model_validate(unsupported)

    extra = {**output, "model_version": "duplicated-relational-data"}
    with pytest.raises(ValidationError):
        PersistedPredictionOutputSchema.model_validate(extra)


def test_prediction_record_explanation_is_null_only_until_contract_is_defined():
    assert PredictionRecordExplanationAdapter.validate_python(None) is None
    with pytest.raises(ValidationError):
        PredictionRecordExplanationAdapter.validate_python({"reason": "unsupported"})


def test_feature_snapshot_contract_accepts_complete_versioned_document():
    meta = {name: "documented" for name in FEATURE_NAMES}
    snapshot = FeatureSnapshotContract.model_validate({
        "schema_version": FEATURE_SCHEMA_VERSION,
        "feature_generation_version": "feature-builder.v1",
        "source_application_version_id": "123e4567-e89b-12d3-a456-426614174000",
        "created_at": "2026-11-05T10:00:00+07:00",
        "feature_values": VALID_FEATURES,
        "feature_units": meta,
        "source_mapping": meta,
    })
    assert snapshot.feature_values.to_feature_list() == [
        VALID_FEATURES[name] for name in FEATURE_NAMES
    ]


def test_feature_snapshot_requires_complete_metadata_maps():
    meta = {name: "documented" for name in FEATURE_NAMES}
    del meta["dti"]
    with pytest.raises(Exception, match="exactly the 11 canonical"):
        FeatureSnapshotContract.model_validate({
            "schema_version": FEATURE_SCHEMA_VERSION,
            "feature_generation_version": "feature-builder.v1",
            "source_application_version_id": "123e4567-e89b-12d3-a456-426614174000",
            "created_at": "2026-11-05T10:00:00+07:00",
            "feature_values": VALID_FEATURES,
            "feature_units": meta,
            "source_mapping": {name: "documented" for name in FEATURE_NAMES},
        })


def test_application_snapshot_contract_accepts_baseline_and_matches_zod_keys():
    snapshot = {
        "schema_version": "application_snapshot.v1",
        "borrower": {
            "legal_name": "Example Borrower",
            "phone": None,
            "address": {
                "line1": "12 Example Road", "line2": None, "subdistrict": None,
                "district": "Example District", "province": "Bangkok",
                "postal_code": "10000", "country_code": "TH",
            },
        },
        "employment": {
            "employment_status": "EMPLOYED", "employer_name": None,
            "occupation": "Analyst", "months_in_role": 12,
        },
        "requested_loan": {"purpose": "personal", "amount_satang": 10000000, "term_months": 12},
    }
    assert ApplicationSnapshotContract.model_validate(snapshot).schema_version == "application_snapshot.v1"

    contract_path = Path(__file__).resolve().parents[3] / "web" / "src" / "lib" / "contracts" / "application.ts"
    zod_contract = contract_path.read_text(encoding="utf-8")
    for key in (
        "schema_version", "borrower", "employment", "requested_loan", "legal_name",
        "phone", "address", "line1", "line2", "subdistrict", "district", "province",
        "postal_code", "country_code", "employment_status", "employer_name", "occupation",
        "months_in_role", "purpose", "amount_satang", "term_months",
    ):
        assert key in zod_contract


def test_application_snapshot_rejects_unknown_version_extra_fields_and_invalid_money():
    valid = {
        "schema_version": "application_snapshot.v1",
        "borrower": {"legal_name": "Example", "phone": None, "address": {
            "line1": "12 Road", "line2": None, "subdistrict": None, "district": None,
            "province": None, "postal_code": None, "country_code": None,
        }},
        "employment": {"employment_status": "EMPLOYED", "employer_name": None,
            "occupation": None, "months_in_role": None},
        "requested_loan": {"purpose": "personal", "amount_satang": 100,
            "term_months": 12},
    }
    with pytest.raises(ValidationError):
        ApplicationSnapshotContract.model_validate({**valid, "schema_version": "application_snapshot.v2"})
    with pytest.raises(ValidationError):
        ApplicationSnapshotContract.model_validate({**valid, "unexpected": True})
    with pytest.raises(ValidationError):
        ApplicationSnapshotContract.model_validate({**valid, "requested_loan": {**valid["requested_loan"], "amount_satang": 0}})
    with pytest.raises(ValidationError):
        ApplicationSnapshotContract.model_validate({**valid, "requested_loan": {
            **valid["requested_loan"], "amount_satang": 9_007_199_254_740_992,
        }})


def test_borrower_profile_address_contract_reuses_approved_address_shape():
    address = BorrowerProfileAddressContract.model_validate({
        "schema_version": "borrower_profile_address.v1", "line1": "12 Example Road",
        "line2": None, "subdistrict": None, "district": "Example District", "province": "Bangkok",
        "postal_code": "10000", "country_code": "TH",
    })
    assert address.country_code == "TH"
    contract_path = Path(__file__).resolve().parents[3] / "web" / "src" / "lib" / "contracts" / "application.ts"
    assert '"borrower_profile_address.v1"' in contract_path.read_text(encoding="utf-8")


@pytest.mark.parametrize("field", ["bc_util", "revol_util"])
def test_utilization_requires_proportion(field):
    invalid = {**VALID_FEATURES, field: 19.5}
    with pytest.raises(ValidationError):
        LoanApplicationSchema.model_validate(invalid)


@pytest.mark.parametrize("field", FEATURE_NAMES)
def test_numeric_strings_are_rejected(field):
    invalid = {**VALID_FEATURES, field: str(VALID_FEATURES[field])}
    with pytest.raises(ValidationError):
        LoanApplicationSchema.model_validate(invalid)


def test_missing_feature_is_rejected():
    invalid = dict(VALID_FEATURES)
    del invalid["lti"]
    with pytest.raises(ValidationError):
        LoanApplicationSchema.model_validate(invalid)


def test_extra_feature_is_rejected():
    invalid = {**VALID_FEATURES, "unexpected": 1}
    with pytest.raises(ValidationError):
        LoanApplicationSchema.model_validate(invalid)


@pytest.mark.parametrize("field", FEATURE_NAMES)
def test_boolean_feature_is_rejected(field):
    invalid = {**VALID_FEATURES, field: True}
    with pytest.raises(ValidationError):
        LoanApplicationSchema.model_validate(invalid)
