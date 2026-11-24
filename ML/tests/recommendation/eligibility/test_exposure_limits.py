import copy
from copy import deepcopy
import math
from decimal import Decimal
import pytest

from recommendation.validation.money import to_decimal
from recommendation.eligibility.exposure_limits import(
    check_total_exposure,
    check_loan_exposure,
    check_borrower_exposure,
    check_purpose_exposure,
    check_exposure_limits
)

@pytest.mark.parametrize(
    "check,current,proposed,limit",
    [
        (check_total_exposure, 100, 50, 200),
        (check_loan_exposure, 100, 50, 200),
        (check_borrower_exposure, 100, 50, 200),
        (check_purpose_exposure, 100, 50, 200),
    ]
)
def test_exposure_pass_below_limit(check,current,proposed,limit):
    proposed = Decimal(proposed)
    current = Decimal(current)
    limit = Decimal(limit)
    assert check(current,proposed,limit ) is True

@pytest.mark.parametrize(
    "check",
    [
        check_total_exposure,
        check_borrower_exposure,
        check_loan_exposure,
        check_purpose_exposure,
    ]
)
def test_exposure_limit(check):
    assert check(Decimal("900"),Decimal("100"),Decimal("1000")) is True

@pytest.mark.parametrize(
    "check",
    [
        check_total_exposure,
        check_loan_exposure,
        check_borrower_exposure,
        check_purpose_exposure,
    ],
)
def test_exposure_above_limit(check):
    assert check(Decimal("900"), Decimal("101"), Decimal("1000")) is False

@pytest.mark.parametrize(
    "check",
    [
        check_total_exposure,
        check_loan_exposure,
        check_borrower_exposure,
        check_purpose_exposure,
    ],
)
def test_zero_current_exposure_is_valid(check):
    assert check(Decimal("0"), Decimal("100"), Decimal("100")) is True

@pytest.mark.parametrize(
    "current,proposed,limit",
    [
    (Decimal("0"), Decimal("0"), Decimal("100")),
    (Decimal("0"), Decimal("-1"), Decimal("100")),
    (Decimal("-1"), Decimal("10"), Decimal("100")),
    (Decimal("0"), Decimal("10"), Decimal("0")),
    (Decimal("0"), Decimal("10"), Decimal("-1")),
    (None, Decimal("10"), Decimal("100")),
    (Decimal("0"), None, Decimal("100")),
    (Decimal("0"), Decimal("10"), None),
    ("10", Decimal("10"), Decimal("100")),
    (Decimal("0"), "10", Decimal("100")),
    (Decimal("0"), Decimal("10"), "100"),
    (True, Decimal("10"), Decimal("100")),
    (Decimal("0"), False, Decimal("100")),
    (Decimal("0"), Decimal("10"), True),
    (Decimal("NaN"), Decimal("10"), Decimal("100")),
    (Decimal("0"), Decimal("NaN"), Decimal("100")),
    (Decimal("0"), Decimal("10"), Decimal("NaN")),
    (Decimal("Infinity"), Decimal("10"), Decimal("100")),
    (Decimal("0"), Decimal("Infinity"), Decimal("100")),
    (Decimal("0"), Decimal("10"), Decimal("Infinity")),
    (Decimal("-Infinity"), Decimal("10"), Decimal("100")),
]
)
@pytest.mark.parametrize(
    "check",
    [
        check_total_exposure,
        check_loan_exposure,
        check_borrower_exposure,
        check_purpose_exposure,
    ],
)
def test_invalid_values_raise_value_error(check, current, proposed, limit):
    with pytest.raises(ValueError):
        check(current, proposed, limit)

def test_extremely_large_finite_values_are_handled():
    assert check_total_exposure(Decimal("1e308"), Decimal("1e308"), Decimal("1e308")) is False

def test_all_exposure_checks_pass(exposure_data):
    result = check_exposure_limits(exposure_data)

    assert result["eligible"] is True
    assert all(
        check["passed"] is True
        for check in result["checks"].values()
    )

def test_combined_result_contains_all_categories(exposure_data):
    result = check_exposure_limits(exposure_data)

    assert set(result["checks"]) == {
        "total",
        "per_loan",
        "per_borrower",
        "per_purpose",
    }

def test_combined_result_contains_exposure_details(exposure_data):
    result = check_exposure_limits(exposure_data)

    for check in result["checks"].values():
        assert set(check) == {
            "passed",
            "current",
            "proposed",
            "projected",
            "limit",
        }

def test_one_failed_category_makes_investor_ineligible(exposure_data):
    exposure_data["current"]["per_loan"] = Decimal("4500")

    result = check_exposure_limits(exposure_data)

    assert result["eligible"] is False
    assert result["checks"]["per_loan"]["passed"] is False
    assert result["checks"]["total"]["passed"] is True
    assert result["checks"]["per_borrower"]["passed"] is True
    assert result["checks"]["per_purpose"]["passed"] is True

def test_multiple_failed_categories_are_all_reported(exposure_data):
    exposure_data["current"]["per_loan"] = Decimal("4500")
    exposure_data["current"]["per_borrower"] = Decimal("9500")

    result = check_exposure_limits(exposure_data)

    assert result["eligible"] is False
    assert result["checks"]["per_loan"]["passed"] is False
    assert result["checks"]["per_borrower"]["passed"] is False
    assert result["checks"]["total"]["passed"] is True
    assert result["checks"]["per_purpose"]["passed"] is True

def test_combined_checker_allows_exact_limit(exposure_data):
    exposure_data["current"]["total"] = Decimal("49000")

    result = check_exposure_limits(exposure_data)

    assert result["checks"]["total"]["projected"] == Decimal("50000")
    assert result["checks"]["total"]["passed"] is True

@pytest.mark.parametrize("bad_amount", [Decimal("0"), Decimal("-1"), None, "100", True, Decimal("NaN"), Decimal("Infinity")])
def test_combined_checker_rejects_invalid_proposed_amount(
    exposure_data, bad_amount
):
    exposure_data["proposed_amount"] = bad_amount

    with pytest.raises(ValueError):
        check_exposure_limits(exposure_data)


@pytest.mark.parametrize(
    "section,key",
    [
        ("limits", "total"),
        ("limits", "per_loan"),
        ("limits", "per_borrower"),
        ("limits", "per_purpose"),
        ("current", "total"),
        ("current", "per_loan"),
        ("current", "per_borrower"),
        ("current", "per_purpose"),
    ],
)
def test_missing_required_category_raises_value_error(
    exposure_data, section, key
):
    del exposure_data[section][key]

    with pytest.raises(ValueError):
        check_exposure_limits(exposure_data)


def test_missing_proposed_amount_raises_value_error(exposure_data):
    del exposure_data["proposed_amount"]

    with pytest.raises(ValueError):
        check_exposure_limits(exposure_data)


def test_missing_limits_section_raises_value_error(exposure_data):
    del exposure_data["limits"]

    with pytest.raises(ValueError):
        check_exposure_limits(exposure_data)


def test_missing_current_section_raises_value_error(exposure_data):
    del exposure_data["current"]

    with pytest.raises(ValueError):
        check_exposure_limits(exposure_data)


def test_checker_does_not_modify_input(exposure_data):
    original = copy.deepcopy(exposure_data)

    check_exposure_limits(exposure_data)

    assert exposure_data == original

def test_exposure_limits_usecase(load_test_investor,load_test_loan):
    investor = load_test_investor
    loans = load_test_loan
    exposure = investor['exposure']
    exposure["proposed_amount"] = to_decimal(
        exposure["proposed_amount"],
        "Proposed amount",
    )

    for key, value in exposure["limits"].items():
        exposure["limits"][key] = to_decimal(
            value, f"Exposure limit: {key}"
        )

    for key, value in exposure["current"].items():
        exposure["current"][key] = to_decimal(
            value, f"Exposure current: {key}"
       )

    for loan in loans:
        result = check_exposure_limits(exposure)
        assert "eligible" in result
        assert set(result['checks']) == {
            "total",
            "per_loan",
            "per_borrower",
            "per_purpose",
        }

        for check in result['checks'].values():
            assert check['projected'] == (check['current'] + check['proposed'])
            assert check['passed'] == (check['projected']<=check['limit'])

        assert result['eligible'] == all(
            check ['passed']
            for check in result['checks'].values()
        )
