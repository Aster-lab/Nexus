from copy import deepcopy
from unittest.mock import Mock
import pytest

from recommendation.prediction.ml_adapter import (
    FEATURE_NAMES,
    build_feature_rows,
    predict_and_attach,
)

@pytest.fixture
def loans():
    return [
        {
            "loan_id": 101,
            "amount": 10000,
            "status": "OPEN",
            "ml_features": {
                name: 1 for name in FEATURE_NAMES
            },
        },
        {
            "loan_id": 102,
            "amount": 20000,
            "status": "OPEN",
            "ml_features": {
                name: 2 for name in FEATURE_NAMES
            },
        },
    ]


@pytest.fixture
def predictions():
    return [
        {
            "default_probability": 0.05,
            "tier": {"tier_code": "A"},
            "spatial_metrics": {
                "macro_cluster": 1,
                "quantization_distance": 0.12,
            },
        },
        {
            "default_probability": 0.25,
            "tier": {"tier_code": "C"},
            "spatial_metrics": {
                "macro_cluster": 2,
                "quantization_distance": 0.35,
            },
        },
    ]

def test_build_feature_rows_uses_expected_feature_order():
    features = {
        name: index + 1
        for index, name in enumerate(reversed(FEATURE_NAMES))
    }
    loan = {"loan_id": 101, "ml_features": features}

    result = build_feature_rows([loan])

    assert result == [[features[name] for name in FEATURE_NAMES]]


def test_build_feature_rows_rejects_missing_features():
    loan = {
        "loan_id": 101,
        "ml_features": {"annual_income": 50000},
    }

    with pytest.raises(ValueError, match="missing ML features"):
        build_feature_rows([loan])


def test_build_feature_rows_rejects_missing_ml_features():
    loan = {"loan_id": 101, "amount": 10000}

    with pytest.raises(ValueError, match="missing 'ml_features'"):
        build_feature_rows([loan])


def test_build_feature_rows_supports_multiple_loans():
    first = {name: 1 for name in FEATURE_NAMES}
    second = {name: 2 for name in FEATURE_NAMES}

    loans = [
        {"loan_id": 101, "ml_features": first},
        {"loan_id": 102, "ml_features": second},
    ]

    result = build_feature_rows(loans)

    assert result == [
        [1] * len(FEATURE_NAMES),
        [2] * len(FEATURE_NAMES),
    ]

def test_predict_and_attach_calls_engine_with_feature_rows(
    loans, predictions
):
    engine = Mock()
    engine.predict_risk.return_value = predictions

    predict_and_attach(engine, loans)

    engine.predict_risk.assert_called_once_with([
        [1] * len(FEATURE_NAMES),
        [2] * len(FEATURE_NAMES),
    ])


def test_predict_and_attach_preserves_loan_ids_and_details(
    loans, predictions
):
    engine = Mock()
    engine.predict_risk.return_value = predictions

    result = predict_and_attach(engine, loans)

    assert result[0]["loan_id"] == 101
    assert result[0]["amount"] == 10000
    assert result[0]["prediction"]["tier"]["tier_code"] == "A"

    assert result[1]["loan_id"] == 102
    assert result[1]["amount"] == 20000
    assert result[1]["prediction"]["tier"]["tier_code"] == "C"


def test_predict_and_attach_does_not_modify_input_loans(
    loans, predictions
):
    original = deepcopy(loans)
    engine = Mock()
    engine.predict_risk.return_value = predictions

    predict_and_attach(engine, loans)

    assert loans == original


def test_predict_and_attach_rejects_prediction_count_mismatch(loans):
    engine = Mock()
    engine.predict_risk.return_value = [
        {
            "default_probability": 0.05,
            "tier": {"tier_code": "A"},
        }
    ]

    with pytest.raises(ValueError, match="Prediction count"):
        predict_and_attach(engine, loans)


def test_predict_and_attach_empty_loans_does_not_call_engine():
    engine = Mock()

    result = predict_and_attach(engine, [])

    assert result == []
    engine.predict_risk.assert_not_called()
