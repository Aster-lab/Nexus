
import pytest

from recommendation.validation.config import validate_config


def make_config(features):
    return {"features": features}


def test_valid_config_passes():
    config = make_config({
        "risk": {
            "type": "numeric",
            "min": 0,
            "max": 1,
            "weight": 0.6,
        },
        "duration": {
            "type": "numeric",
            "min": 6,
            "max": 36,
            "weight": 0.4,
        },
    })

    assert validate_config(config) is True


def test_weights_within_tolerance_pass():
    config = make_config({
        "risk": {"type": "categorical", "weight": 0.50005},
        "duration": {"type": "categorical", "weight": 0.49995},
    })

    assert validate_config(config) is True


def test_weights_outside_tolerance_fail():
    config = make_config({
        "risk": {"type": "categorical", "weight": 0.6},
        "duration": {"type": "categorical", "weight": 0.3},
    })

    with pytest.raises(ValueError, match="Feature weights"):
        validate_config(config)


@pytest.mark.parametrize("weight", [-0.1, 1.1])
def test_invalid_individual_weight_fails(weight):
    config = make_config({
        "risk": {"type": "categorical", "weight": weight},
        "duration": {"type": "categorical", "weight": 1 - weight},
    })

    with pytest.raises(ValueError, match="Invalid weight"):
        validate_config(config)


def test_zero_weight_is_allowed():
    config = make_config({
        "risk": {"type": "categorical", "weight": 0},
        "duration": {"type": "categorical", "weight": 1},
    })

    assert validate_config(config) is True


def test_missing_weight_raises_value_error():
    config = make_config({
        "risk": {"type": "categorical"},
        "duration": {"type": "categorical", "weight": 1},
    })

    with pytest.raises(ValueError, match="missing its weight"):
        validate_config(config)


def test_valid_numeric_bounds_pass():
    config = make_config({
        "risk": {
            "type": "numeric",
            "min": 0,
            "max": 100,
            "weight": 1,
        },
    })

    assert validate_config(config) is True


@pytest.mark.parametrize(
    "minimum,maximum",
    [(10, 10), (20, 10)],
)
def test_invalid_numeric_bounds_fail(minimum, maximum):
    config = make_config({
        "risk": {
            "type": "numeric",
            "min": minimum,
            "max": maximum,
            "weight": 1,
        },
    })

    with pytest.raises(ValueError, match="Invalid bounds"):
        validate_config(config)


def test_non_numeric_feature_skips_bounds_validation():
    config = make_config({
        "purpose": {
            "type": "categorical",
            "weight": 1,
        },
    })

    assert validate_config(config) is True


def test_missing_weight_raises_value_error():
    config = make_config({
        "risk": {"type": "categorical"},
        "duration": {"type": "categorical", "weight": 1},
    })

    with pytest.raises(ValueError, match="missing its weight"):
        validate_config(config)


def test_empty_features_raises_value_error():
    with pytest.raises(ValueError, match="At least one feature"):
        validate_config({"features": {}})

@pytest.mark.parametrize(
    "weight",
    [True, False, float("nan"), float("inf"), float("-inf")],
)
def test_invalid_weight_types_raise_value_error(weight):
    config = make_config({
        "risk": {"type": "categorical", "weight": weight},
    })

    with pytest.raises(ValueError):
        validate_config(config)


