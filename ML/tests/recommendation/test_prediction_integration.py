import copy
import pytest

from recommendation.prediction.integration import attach_predictions

@pytest.fixture
def loans():
    return [
        {
            "loan_id": 101,
            "borrower_id": 1,
            "amount": 10000,
            "status": "OPEN",
        },
        {
            "loan_id": 102,
            "borrower_id": 2,
            "amount": 20000,
            "status": "OPEN",
        },
    ]


@pytest.fixture
def predictions():
    return [
        {
            "loan_id": 101,
            "default_probability": 0.05,
            "tier": {"tier_code": "A"},
        },
        {
            "loan_id": 102,
            "default_probability": 0.25,
            "tier": {"tier_code": "C"},
        },
    ]


def test_predictions_are_attached_to_matching_loans(loans, predictions):
    result = attach_predictions(loans, predictions)

    assert result[0]["prediction"]["tier"]["tier_code"] == "A"
    assert result[1]["prediction"]["tier"]["tier_code"] == "C"


def test_original_loan_fields_are_preserved(loans, predictions):
    result = attach_predictions(loans, predictions)

    for original, enriched in zip(loans, result):
        for key, value in original.items():
            assert enriched[key] == value


def test_input_loans_are_not_modified(loans, predictions):
    original = copy.deepcopy(loans)

    attach_predictions(loans, predictions)

    assert loans == original


def test_missing_prediction_raises_value_error(loans, predictions):
    predictions = predictions[:1]

    with pytest.raises(ValueError, match="102"):
        attach_predictions(loans, predictions)


def test_prediction_for_unknown_loan_raises_value_error(loans, predictions):
    predictions[1]["loan_id"] = 999

    with pytest.raises(ValueError, match="999"):
        attach_predictions(loans, predictions)


def test_duplicate_prediction_ids_raise_value_error(loans, predictions):
    predictions[1]["loan_id"] = 101

    with pytest.raises(ValueError, match="Duplicate"):
        attach_predictions(loans, predictions)


def test_duplicate_loan_ids_raise_value_error(loans, predictions):
    loans[1]["loan_id"] = 101

    with pytest.raises(ValueError, match="Duplicate"):
        attach_predictions(loans, predictions)


def test_empty_inputs_return_empty_list():
    assert attach_predictions([], []) == []