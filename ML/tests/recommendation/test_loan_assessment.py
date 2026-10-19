from unittest.mock import Mock
import pytest

from recommendation.prediction.loan_assessment import assess_loan
from recommendation.prediction.ml_adapter import FEATURE_NAMES


@pytest.fixture
def loan():
    return {
        "loan_id": 101,
        "borrower_id": 1,
        "amount": 10000,
        "status": "OPEN",
        "terms": {"interest_rate": 0.12},
        "ml_features": {
            name: 1 for name in FEATURE_NAMES
        },
    }


@pytest.fixture
def prediction():
    return {
        "default_probability": 0.05,
        "tier": {"tier_code": "A"},
        "spatial_metrics": {
            "macro_cluster": 1,
            "quantization_distance": 0.12,
        },
    }


def test_assess_loan_returns_loan_with_prediction(loan, prediction):
    engine = Mock()
    engine.predict_risk.return_value = [prediction]

    result = assess_loan(engine, loan)

    assert result["loan_id"] == 101
    assert result["borrower_id"] == 1
    assert result["amount"] == 10000
    assert result["prediction"] == prediction


def test_assess_loan_preserves_original_loan(loan, prediction):
    original = loan.copy()
    original["terms"] = loan["terms"].copy()
    original["ml_features"] = loan["ml_features"].copy()

    engine = Mock()
    engine.predict_risk.return_value = [prediction]

    assess_loan(engine, loan)

    assert loan == original


def test_assess_loan_calls_engine_once(loan, prediction):
    engine = Mock()
    engine.predict_risk.return_value = [prediction]

    assess_loan(engine, loan)

    engine.predict_risk.assert_called_once()


def test_assess_loan_rejects_missing_features(loan):
    del loan["ml_features"]["annual_income"]
    engine = Mock()

    with pytest.raises(ValueError, match="missing ML features"):
        assess_loan(engine, loan)

    engine.predict_risk.assert_not_called()