
import numpy as np
import pytest

from predict import RiskEngine


@pytest.fixture(scope="module")
def predictor():
    return RiskEngine(model_dir="models")


def test_real_model_loads(predictor):
    assert predictor.scaler is not None
    assert predictor.imputer is not None
    assert predictor.quantile_scaler is not None
    assert predictor.som is not None
    assert predictor.kmeans is not None
    assert predictor.node_risk_map is not None
    assert predictor.clf is not None


def test_real_model_predicts(predictor):
    sample = [
        60000,
        25.0,
        10000,
        3,
        40.0,
        0.17,
        0.03,
        15,
        0.105,
        45.0,
        36,
    ]

    result = predictor.predict_risk(sample)

    assert len(result) == 1

    probability = result[0]["default_probability"]

    assert 0 <= probability <= 1

    assert "tier" in result[0]
    assert "spatial_metrics" in result[0]


def test_real_model_prediction_is_deterministic(predictor):
    sample = [
        60000,
        25.0,
        10000,
        3,
        40.0,
        0.17,
        0.03,
        15,
        0.105,
        45.0,
        36,
    ]

    first = predictor.predict_risk(sample)
    second = predictor.predict_risk(sample)

    assert first == second
