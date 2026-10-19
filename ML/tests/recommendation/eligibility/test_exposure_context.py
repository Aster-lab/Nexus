from copy import deepcopy
from decimal import Decimal

import pytest

from recommendation.eligibility.exposure_context import (
    build_exposure_context,
)
from recommendation.eligibility.exposure_limits import check_exposure_limits

#UNIT TESTS
def test_calculates_all_exposure_categories(
    investor, loans, investments
):
    target_loan = loans[0]

    result = build_exposure_context(
        investor, target_loan, investments, loans
    )

    assert result["proposed_amount"] == Decimal("1000")
    assert result["limits"] == investor["exposure"]["limits"]
    assert result["current"] == {
        "total": Decimal("6000"),
        "per_loan": Decimal("1000"),
        "per_borrower": Decimal("3000"),
        "per_purpose": Decimal("4000"),
    }


def test_ignores_investor_current_values(
    investor, loans, investments
):
    result = build_exposure_context(
        investor, loans[0], investments, loans
    )

    assert result["current"]["total"] == Decimal("6000")
    assert result["current"]["total"] != investor["exposure"]["current"]["total"]


def test_no_qualifying_investments_returns_zero_exposure(
    investor, loans
):
    result = build_exposure_context(
        investor, loans[0], [], loans
    )

    assert result["current"] == {
        "total": Decimal("0"),
        "per_loan": Decimal("0"),
        "per_borrower": Decimal("0"),
        "per_purpose": Decimal("0"),
    }


def test_does_not_modify_inputs(investor, loans, investments):
    original_investor = deepcopy(investor)
    original_loans = deepcopy(loans)
    original_investments = deepcopy(investments)

    build_exposure_context(
        investor, loans[0], investments, loans
    )

    assert investor == original_investor
    assert loans == original_loans
    assert investments == original_investments


@pytest.mark.parametrize(
    "status",
    ["PENDING", "CONFIRMED"],
)
def test_includes_committed_statuses(investor, loans, status):
    investments = [
        {
            "investor_id": 1,
            "loan_id": 10,
            "amount": Decimal("100"),
            "status": status,
        }
    ]

    result = build_exposure_context(
        investor, loans[0], investments, loans
    )

    assert result["current"]["total"] == Decimal("100")


@pytest.mark.parametrize(
    "status",
    ["CANCELLED", "REJECTED"],
)
def test_excludes_non_committed_statuses(investor, loans, status):
    investments = [
        {
            "investor_id": 1,
            "loan_id": 10,
            "amount": Decimal("100"),
            "status": status,
        }
    ]

    result = build_exposure_context(
        investor, loans[0], investments, loans
    )

    assert result["current"]["total"] == Decimal("0")


@pytest.mark.parametrize(
    "bad_amount",
    [
        Decimal("0"),
        Decimal("-1"),
        Decimal("NaN"),
        Decimal("Infinity"),
        None,
        "100",
        100,
        100.0,
        True,
    ],
)
def test_invalid_qualifying_investment_amount_raises(
    investor, loans, bad_amount
):
    investments = [
        {
            "investor_id": 1,
            "loan_id": 10,
            "amount": bad_amount,
            "status": "CONFIRMED",
        }
    ]

    with pytest.raises(ValueError):
        build_exposure_context(
            investor, loans[0], investments, loans
        )


def test_missing_loan_reference_raises(investor, loans):
    investments = [
        {
            "investor_id": 1,
            "loan_id": 999,
            "amount": Decimal("100"),
            "status": "CONFIRMED",
        }
    ]

    with pytest.raises(ValueError):
        build_exposure_context(
            investor, loans[0], investments, loans
        )


def test_duplicate_loan_ids_raise(investor, loans):
    duplicate_loans = loans + [deepcopy(loans[0])]

    with pytest.raises(ValueError):
        build_exposure_context(
            investor, loans[0], [], duplicate_loans
        )


@pytest.mark.parametrize(
    "bad_investments",
    [None, {}, "invalid"],
)
def test_invalid_investment_collection_raises(
    investor, loans, bad_investments
):
    with pytest.raises(ValueError):
        build_exposure_context(
            investor, loans[0], bad_investments, loans
        )


def test_missing_target_loan_raises(investor, loans):
    target_loan = {
        "loan_id": 999,
        "borrower_id": 101,
        "terms": {"purpose": "business"},
    }

    with pytest.raises(ValueError):
        build_exposure_context(
            investor, target_loan, [], loans
        )


#USECASES
def test_context_and_limit_checker_work_together(
    investor, loans, investments
):
    context = build_exposure_context(
        investor, loans[0], investments, loans
    )

    result = check_exposure_limits(context)

    assert result["eligible"] is True
    assert result["checks"]["total"]["projected"] == Decimal("7000")
    assert result["checks"]["per_loan"]["projected"] == Decimal("2000")
    assert result["checks"]["per_borrower"]["projected"] == Decimal("4000")
    assert result["checks"]["per_purpose"]["projected"] == Decimal("5000")


def test_investment_is_ineligible_when_per_loan_limit_is_exceeded(
    investor, loans
):
    investor["exposure"]["proposed_amount"] = Decimal("4001")
    investments = [
        {
            "investor_id": 1,
            "loan_id": 10,
            "amount": Decimal("1000"),
            "status": "CONFIRMED",
        }
    ]

    context = build_exposure_context(
        investor, loans[0], investments, loans
    )
    result = check_exposure_limits(context)

    assert result["eligible"] is False
    assert result["checks"]["per_loan"]["passed"] is False


#USECASE WITH REAL DATA
def to_decimal(value):
    return Decimal(str(value))


def prepare_investor(investor):
    investor = deepcopy(investor)
    exposure = investor["exposure"]

    exposure["proposed_amount"] = to_decimal(
        exposure["proposed_amount"]
    )

    for section in ("limits", "current"):
        exposure[section] = {
            key: to_decimal(value)
            for key, value in exposure[section].items()
        }

    return investor


def test_builds_context_from_real_investor_and_loan_json(
    load_test_investor, load_test_loan
):
    investor = prepare_investor(load_test_investor)
    loans = deepcopy(load_test_loan)
    target_loan = loans[0]

    # Test records only; these do not come from the JSON files.
    investments = [
        {
            "investor_id": investor["investor_id"],
            "loan_id": target_loan["loan_id"],
            "amount": Decimal("500"),
            "status": "CONFIRMED",
        }
    ]

    context = build_exposure_context(
        investor, target_loan, investments, loans
    )

    assert context["proposed_amount"] == to_decimal(
        investor["exposure"]["proposed_amount"]
    )
    assert context["current"]["total"] == Decimal("500")
    assert context["current"]["per_loan"] == Decimal("500")

    result = check_exposure_limits(context)

    assert set(result["checks"]) == {
        "total",
        "per_loan",
        "per_borrower",
        "per_purpose",
    }