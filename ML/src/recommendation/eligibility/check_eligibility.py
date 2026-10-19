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

    # 1. Check the investor's account.
    passed = check_investor_account(investor)
    result["checks"]["investor_account"] = {
        "passed": passed,
    }

    if not passed:
        result["failed_check"] = "investor_account"
        return result

    # 2. Check whether the loan is open, fundable, and within its time window.
    passed = check_loan_availability(loan, current_time)
    result["checks"]["loan_availability"] = {
        "passed": passed,
    }

    if not passed:
        result["failed_check"] = "loan_availability"
        return result

    # 3. Check investment capacity and available balance.
    passed = check_investment_compatibility(investor, loan)
    result["checks"]["investment_compatibility"] = {
        "passed": passed,
    }

    if not passed:
        result["failed_check"] = "investment_compatibility"
        return result

    # 4. Check age, country, investor type, and qualification restrictions.
    passed = check_investor_qualification(investor, loan)
    result["checks"]["investor_qualification"] = {
        "passed": passed,
    }

    if not passed:
        result["failed_check"] = "investor_qualification"
        return result

    # 5. Calculate exposure from investment records, then check all limits.
    exposure_context = build_exposure_context(
        investor=investor,
        target_loan=loan,
        investments=investments,
        loans=loans,
    )

    exposure_result = check_exposure_limits(exposure_context)

    # Preserve the detailed result from the exposure checker.
    result["checks"]["exposure_limits"] = {
        "passed": exposure_result["eligible"],
        "details": exposure_result,
    }

    if not exposure_result["eligible"]:
        result["failed_check"] = "exposure_limits"
        return result

    # Every check passed.
    result["eligible"] = True
    return result