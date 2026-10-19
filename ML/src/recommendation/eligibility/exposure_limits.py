import math
from decimal import Decimal, DecimalException

EXPOSURE_CATEGORIES =  (
    "total",
    "per_loan",
    "per_borrower",
    "per_purpose",
)

def _validate_amount(value, field_name, *, allow_zero):
    if not isinstance(value,Decimal) or not value.is_finite():
        raise ValueError(f"{field_name} must be a finite number.")

    if allow_zero and value < Decimal('0'):
        raise ValueError(f"{field_name} cannot be negative.")

    if not allow_zero and value <= Decimal("0"):
        raise ValueError(f"{field_name} must be greater than zero.")


def _check_exposure(current, proposed, limit):
    _validate_amount(current, "Current exposure", allow_zero=True)
    _validate_amount(proposed, "Proposed amount", allow_zero=False)
    _validate_amount(limit, "Exposure limit", allow_zero=False)

    try:
        projected = current + proposed
    except DecimalException as exc:
        raise ValueError("Could not calculate projected exposure") from exc

    return projected <= limit


def check_total_exposure(current, proposed, limit):
    return _check_exposure(current, proposed, limit)


def check_loan_exposure(current, proposed, limit):
    return _check_exposure(current, proposed, limit)


def check_borrower_exposure(current, proposed, limit):
    return _check_exposure(current, proposed, limit)


def check_purpose_exposure(current, proposed, limit):
    return _check_exposure(current, proposed, limit)


def _validate_exposure_data(exposure):
    if not isinstance(exposure, dict):
        raise ValueError("Exposure must be a dictionary.")

    for section in ("limits", "current"):
        if section not in exposure or not isinstance(exposure[section], dict):
            raise ValueError(
                f"Exposure must contain a '{section}' dictionary."
            )

        for category in EXPOSURE_CATEGORIES:
            if category not in exposure[section]:
                raise ValueError(
                    f"Missing '{category}' in exposure['{section}']."
                )

    if "proposed_amount" not in exposure:
        raise ValueError("Missing 'proposed_amount' in exposure.")

    proposed = exposure["proposed_amount"]
    _validate_amount(proposed, "Proposed amount", allow_zero=False)

    for category in EXPOSURE_CATEGORIES:
        _validate_amount(
            exposure["current"][category],
            f"Current {category} exposure",
            allow_zero=True,
        )
        _validate_amount(
            exposure["limits"][category],
            f"{category} exposure limit",
            allow_zero=False,
        )


def check_exposure_limits(exposure):

    _validate_exposure_data(exposure)

    proposed = exposure["proposed_amount"]
    limits = exposure["limits"]
    current = exposure["current"]

    check_functions = {
        "total": check_total_exposure,
        "per_loan": check_loan_exposure,
        "per_borrower": check_borrower_exposure,
        "per_purpose": check_purpose_exposure,
    }

    results = {}

    for category, check_function in check_functions.items():
        current_amount = current[category]
        limit = limits[category]
        projected = current_amount + proposed

        passed = check_function(
            current=current_amount,
            proposed=proposed,
            limit=limit,
        )

        results[category] = {
            "passed": passed,
            "current": current_amount,
            "proposed": proposed,
            "projected": projected,
            "limit": limit,
        }

    return {
        "eligible": all(
            result["passed"] for result in results.values()
        ),
        "checks": results,
    }