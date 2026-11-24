from copy import deepcopy
from decimal import Decimal
from datetime  import datetime
from unittest.mock import Mock

import pytest
from recommendation.validation.money import to_decimal
from recommendation.eligibility.check_eligibility import (
    check_eligibility,
)


def test_all_checks_pass(
    eligibility_investor,
    eligibility_target_loan,
    eligibility_investments,
    eligibility_loans,
    eligibility_current_time,
):
    result = check_eligibility(
        eligibility_investor,
        eligibility_target_loan,
        eligibility_investments,
        eligibility_loans,
        eligibility_current_time,
    )

    assert result["eligible"] is True
    assert result["failed_check"] is None

    assert list(result["checks"]) == [
        "investor_account",
        "loan_availability",
        "investment_compatibility",
        "investor_qualification",
        "exposure_limits",
    ]

    assert all(
        check["passed"] is True
        for check in result["checks"].values()
    )


@pytest.mark.parametrize(
    ("failure", "expected_checks"),
    [
        (
            "investor_account",
            ["investor_account"],
        ),
        (
            "loan_availability",
            ["investor_account", "loan_availability"],
        ),
        (
            "investment_compatibility",
            [
                "investor_account",
                "loan_availability",
                "investment_compatibility",
            ],
        ),
        (
            "investor_qualification",
            [
                "investor_account",
                "loan_availability",
                "investment_compatibility",
                "investor_qualification",
            ],
        ),
        (
            "exposure_limits",
            [
                "investor_account",
                "loan_availability",
                "investment_compatibility",
                "investor_qualification",
                "exposure_limits",
            ],
        ),
    ],
)
def test_stops_at_first_failure(
    failure,
    expected_checks,
    eligibility_investor,
    eligibility_target_loan,
    eligibility_investments,
    eligibility_loans,
    eligibility_current_time,
):
    investor = deepcopy(eligibility_investor)
    loan = deepcopy(eligibility_target_loan)

    if failure == "investor_account":
        investor["account"]["status"] = "INACTIVE"

    elif failure == "loan_availability":
        loan["status"] = "CLOSED"

    elif failure == "investment_compatibility":
        investor["financial"]["available_balance"] = Decimal("100")

    elif failure == "investor_qualification":
        loan["restrictions"]["allowed_countries"] = ["US"]

    elif failure == "exposure_limits":
        investor["exposure"]["limits"]["per_loan"] = Decimal("1500")

    result = check_eligibility(
        investor,
        loan,
        eligibility_investments,
        eligibility_loans,
        eligibility_current_time,
    )

    assert result["eligible"] is False
    assert result["failed_check"] == failure
    assert list(result["checks"]) == expected_checks
    assert result["checks"][failure]["passed"] is False

    for check_name, check_result in result["checks"].items():
        if check_name != failure:
            assert check_result["passed"] is True


def test_exposure_failure_preserves_category_details(
    eligibility_investor,
    eligibility_target_loan,
    eligibility_investments,
    eligibility_loans,
    eligibility_current_time,
):
    investor = deepcopy(eligibility_investor)
    investor["exposure"]["limits"]["per_loan"] = Decimal("1500")

    result = check_eligibility(
        investor,
        eligibility_target_loan,
        eligibility_investments,
        eligibility_loans,
        eligibility_current_time,
    )

    exposure_result = result["checks"]["exposure_limits"]

    assert result["eligible"] is False
    assert exposure_result["passed"] is False
    assert exposure_result["details"]["eligible"] is False
    assert exposure_result["details"]["checks"]["per_loan"]["passed"] is False


def test_inputs_are_not_mutated(
    eligibility_investor,
    eligibility_target_loan,
    eligibility_investments,
    eligibility_loans,
    eligibility_current_time,
):
    investor_before = deepcopy(eligibility_investor)
    loan_before = deepcopy(eligibility_target_loan)
    investments_before = deepcopy(eligibility_investments)
    loans_before = deepcopy(eligibility_loans)

    check_eligibility(
        eligibility_investor,
        eligibility_target_loan,
        eligibility_investments,
        eligibility_loans,
        eligibility_current_time,
    )

    assert eligibility_investor == investor_before
    assert eligibility_target_loan == loan_before
    assert eligibility_investments == investments_before
    assert eligibility_loans == loans_before

def _normalize_money(investor, loans, investments):
    """Normalize monetary values without mutating fixture data."""
    investor = deepcopy(investor)
    loans = deepcopy(loans)
    investments = deepcopy(investments)

    financial = investor["financial"]
    financial["available_balance"] = to_decimal(
        financial["available_balance"],
        "investor.financial.available_balance",
    )

    capacity = financial["investment_capacity"]
    for key in ("minimum", "maximum"):
        capacity[key] = to_decimal(
            capacity[key],
            f"investor.financial.investment_capacity.{key}",
        )

    exposure = investor["exposure"]
    exposure["proposed_amount"] = to_decimal(
        exposure["proposed_amount"],
        "investor.exposure.proposed_amount",
    )

    for key, value in exposure["limits"].items():
        exposure["limits"][key] = to_decimal(
            value, f"investor.exposure.limits.{key}"
        )

    for index, loan in enumerate(loans):
        amount = loan["amount"]
        for key in ("total", "funded"):
            amount[key] = to_decimal(
                amount[key], f"loans[{index}].amount.{key}"
            )

        investment_terms = amount["investment"]
        for key in ("min", "max"):
            investment_terms[key] = to_decimal(
                investment_terms[key],
                f"loans[{index}].amount.investment.{key}",
            )

    for index, investment in enumerate(investments):
        investment["amount"] = to_decimal(
            investment["amount"],
            f"investments[{index}].amount",
        )

    return investor, loans, investments


def test_check_eligibility_with_real_json_data(
    load_test_investor,
    load_test_loan,
    load_test_investment,
):
    investor, loans, investments = _normalize_money(
        load_test_investor,
        load_test_loan,
        load_test_investment,
    )

    target_loan = next(
        loan for loan in loans
        if loan["loan_id"] == 1
    )

    current_time = datetime.fromisoformat(
        target_loan["timing"]["opens_at"]
    )

    result = check_eligibility(
        investor=investor,
        loan=target_loan,
        investments=investments,
        loans=loans,
        current_time=current_time,
    )

    assert isinstance(result, dict)
    assert result["eligible"] is True
    assert result["failed_check"] is None

    checks = result["checks"]
    assert list(checks) == [
        "investor_account",
        "loan_availability",
        "investment_compatibility",
        "investor_qualification",
        "exposure_limits",
    ]

    for check_name in (
        "investor_account",
        "loan_availability",
        "investment_compatibility",
        "investor_qualification",
    ):
        assert checks[check_name]["passed"] is True

    exposure_result = checks["exposure_limits"]
    assert exposure_result["passed"] is True
    assert exposure_result["details"]["eligible"] is True

    details = exposure_result["details"]
    assert details["eligible"] is True
    assert details["checks"]["per_loan"]["passed"] is True

    assert details["checks"]["per_loan"]["current"] == Decimal("1000")
    assert details["checks"]["per_loan"]["proposed"] == Decimal("2000")
    assert details["checks"]["per_loan"]["projected"] == Decimal("3000")

    assert load_test_investor["exposure"]["proposed_amount"] == 2000
