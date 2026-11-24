
import pytest

from recommendation.prediction.ml_adapter import predict_and_attach,FEATURE_NAMES

from predict import RiskEngine


@pytest.fixture(scope="module")
def real_engine():
    return RiskEngine(
        model_dir="models",
        anchor_threshold=0.48,
    )


def test_real_engine_predict_and_attach(real_engine):
    features = {
        "annual_income": 75000,
        "dti": 0.25,
        "loan_amount": 10000,
        "acc_open_past_24mths": 3,
        "bc_util": 0.45,
        "lti": 0.13,
        "interest_burden": 0.08,
        "sub_grade_num": 5,
        "int_rate": 0.105,
        "revol_util": 0.40,
        "term_months": 36,
    }

    loans = [
        {
            "loan_id": 1001,
            "amount": 10000,
            "ml_features": features,
        }
    ]

    result = predict_and_attach(real_engine, loans)

    assert len(result) == 1
    assert result[0]["loan_id"] == 1001
    assert result[0]["amount"] == 10000
    assert "prediction" in result[0]

    prediction = result[0]["prediction"]

    assert 0 <= prediction["default_probability"] <= 1
    assert "tier" in prediction
    assert "tier_code" in prediction["tier"]
    assert result[0]["ml_features"] == features
