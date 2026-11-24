from datetime import datetime

from .investor_account import check_investor_account
from .loan_availability import check_loan_availability
from .investment_compatibility import check_investment_compatibility
from .investor_qualification import check_investor_qualification
from .exposure_context import build_exposure_context
from .exposure_limits import check_exposure_limits

def check_eligibility(
    investor: dict,
    loan: dict,
    investments: list,
    loans: list,
    current_time: datetime,
) -> dict:
    result = {
        "eligible": False,
        "checks": {},
        "failed_check": None,
    }

    passed = check_investor_account(investor)
    result["checks"]["investor_account"] = {
        "passed": passed,
    }

    if not passed:
        result["failed_check"] = "investor_account"
        return result

    passed = check_loan_availability(loan, current_time)
    result["checks"]["loan_availability"] = {
        "passed": passed,
    }

    if not passed:
        result["failed_check"] = "loan_availability"
        return result

    passed = check_investment_compatibility(investor, loan)
    result["checks"]["investment_compatibility"] = {
        "passed": passed,
    }

    if not passed:
        result["failed_check"] = "investment_compatibility"
        return result

    passed = check_investor_qualification(investor, loan)
    result["checks"]["investor_qualification"] = {
        "passed": passed,
    }

    if not passed:
        result["failed_check"] = "investor_qualification"
        return result

    exposure_context = build_exposure_context(
        investor=investor,
        target_loan=loan,
        investments=investments,
        loans=loans,
    )

    exposure_result = check_exposure_limits(exposure_context)

    result["checks"]["exposure_limits"] = {
        "passed": exposure_result["eligible"],
        "details": exposure_result,
    }

    if not exposure_result["eligible"]:
        result["failed_check"] = "exposure_limits"
        return result

    result["eligible"] = True
    return result