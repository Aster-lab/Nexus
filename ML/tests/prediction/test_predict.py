
import numpy as np
import pandas as pd
import pytest

from unittest.mock import MagicMock

from predict import RiskEngine
from predict import FEATURE_NAMES


@pytest.fixture
def predictor():
    """Create a predictor without loading real model artifacts."""

    obj = RiskEngine.__new__(RiskEngine)

    obj.anchor_threshold = 0.20

    obj.scaler = MagicMock()
    obj.imputer = MagicMock()
    obj.quantile_scaler = MagicMock()

    obj.som = MagicMock()
    obj.weights = np.zeros((2, 2, 11))
    obj.cols = 2

    obj.som.winner.return_value = (0, 0)

    obj.node_clusters = np.array([0, 1, 2, 3])

    obj.clf = MagicMock()
    obj.clf.classes_ = np.array([0, 1])
    obj.default_class_index = 1

    obj.scaler.transform.side_effect = lambda x: x
    obj.imputer.transform.side_effect = lambda x: x
    obj.quantile_scaler.transform.side_effect = lambda x: x

    obj.clf.predict_proba.return_value = np.array([
        [0.80, 0.20]
    ])

    return obj


@pytest.fixture
def valid_sample():
    return [
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


# --------------------------------------------------
# Valid input tests
# --------------------------------------------------

def test_single_prediction_returns_one_result(
    predictor, valid_sample
):
    result = predictor.predict_risk(valid_sample)

    assert isinstance(result, list)
    assert len(result) == 1

    assert "default_probability" in result[0]
    assert "tier" in result[0]
    assert "spatial_metrics" in result[0]


def test_prediction_probability_is_between_zero_and_one(
    predictor, valid_sample
):
    result = predictor.predict_risk(valid_sample)

    probability = result[0]["default_probability"]

    assert 0 <= probability <= 1


def test_batch_prediction_returns_correct_number_of_results(
    predictor, valid_sample
):
    batch = np.array([
        valid_sample,
        valid_sample,
        valid_sample,
    ])

    predictor.clf.predict_proba.return_value = np.array([
        [0.90, 0.10],
        [0.80, 0.20],
        [0.70, 0.30],
    ])

    result = predictor.predict_risk(batch)

    assert len(result) == 3


# --------------------------------------------------
# Input validation tests
# --------------------------------------------------

def test_wrong_feature_count_raises_error(predictor):
    with pytest.raises(ValueError):
        predictor.predict_risk([1, 2, 3])


def test_empty_batch_raises_error(predictor):
    with pytest.raises(ValueError):
        predictor.predict_risk(np.empty((0, 11)))


@pytest.mark.parametrize(
    "invalid_value",
    [
        None,
        "invalid",
        True,
        np.nan,
        np.inf,
        -np.inf,
    ],
)
def test_invalid_values_raise_error(
    predictor, valid_sample, invalid_value
):
    sample = valid_sample.copy()
    sample[0] = invalid_value

    with pytest.raises(ValueError):
        predictor.predict_risk(sample)


def test_three_dimensional_input_raises_error(predictor):
    with pytest.raises(ValueError):
        predictor.predict_risk(np.zeros((1, 1, 11)))


# --------------------------------------------------
# DataFrame validation
# --------------------------------------------------

def test_dataframe_with_correct_columns_is_accepted(
    predictor, valid_sample
):
    df = pd.DataFrame(
        [valid_sample],
        columns=FEATURE_NAMES,
    )

    result = predictor.predict_risk(df)

    assert len(result) == 1


def test_dataframe_with_wrong_column_order_is_rejected(
    predictor, valid_sample
):
    columns = FEATURE_NAMES[::-1]

    df = pd.DataFrame(
        [valid_sample],
        columns=columns,
    )

    with pytest.raises(ValueError):
        predictor.predict_risk(df)


# --------------------------------------------------
# Preprocessing consistency
# --------------------------------------------------

def test_preprocessing_steps_are_called_in_order(
    predictor, valid_sample
):
    calls = []

    predictor.scaler.transform.side_effect = (
        lambda x: calls.append("minmax") or x
    )

    predictor.imputer.transform.side_effect = (
        lambda x: calls.append("imputer") or x
    )

    predictor.quantile_scaler.transform.side_effect = (
        lambda x: calls.append("quantile") or x
    )

    predictor.predict_risk(valid_sample)

    assert calls == [
        "minmax",
        "imputer",
        "quantile",
    ]


def test_classifier_receives_thirteen_features(
    predictor, valid_sample
):
    predictor.predict_risk(valid_sample)

    classifier_input = (
        predictor.clf.predict_proba.call_args[0][0]
    )

    assert classifier_input.shape == (1, 13)


# --------------------------------------------------
# Probability and risk classification
# --------------------------------------------------

def test_default_probability_uses_class_one(
    predictor, valid_sample
):
    predictor.clf.classes_ = np.array([1, 0])
    predictor.default_class_index = 0

    predictor.clf.predict_proba.return_value = np.array([
        [0.15, 0.85]
    ])

    result = predictor.predict_risk(valid_sample)

    assert result[0]["default_probability"] == 0.15


def test_prediction_probability_is_rounded_to_four_decimals(
    predictor, valid_sample
):
    predictor.clf.predict_proba.return_value = np.array([
        [0.876543, 0.1234567]
    ])

    result = predictor.predict_risk(valid_sample)

    assert result[0]["default_probability"] == 0.1235


# --------------------------------------------------
# Spatial metrics
# --------------------------------------------------

def test_spatial_metrics_are_returned(
    predictor, valid_sample
):
    result = predictor.predict_risk(valid_sample)

    metrics = result[0]["spatial_metrics"]

    assert "macro_cluster" in metrics
    assert "quantization_distance" in metrics

    assert isinstance(metrics["macro_cluster"], int)
    assert isinstance(metrics["quantization_distance"], float)


def test_classifier_input_excludes_risk_map_score(
    predictor, valid_sample
):
    predictor.node_risk_map = np.ones((2, 2))

    predictor.predict_risk(valid_sample)

    classifier_input = (
        predictor.clf.predict_proba.call_args[0][0]
    )

    assert classifier_input.shape[1] == 13
