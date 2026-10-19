from decimal import Decimal, DecimalException


COMMITTED_STATUSES = {"PENDING", "CONFIRMED"}
IGNORED_STATUSES = {"CANCELLED", "REJECTED"}

EXPOSURE_CATEGORIES = (
    "total",
    "per_loan",
    "per_borrower",
    "per_purpose",
)


def _require_dict(value, name):
    if not isinstance(value, dict):
        raise ValueError(f"{name} must be a dictionary.")


def _require_id(value, name):
    if value is None or isinstance(value, bool):
        raise ValueError(f"{name} must be provided.")

    if isinstance(value, str) and not value.strip():
        raise ValueError(f"{name} must not be empty.")

    return value


def _require_decimal(value, field_name):
    if not isinstance(value, Decimal):
        raise ValueError(
            f"{field_name} must be a Decimal."
        )

    if not value.is_finite():
        raise ValueError(
            f"{field_name} must be a finite number."
        )

    return value


def _get_loan_purpose(loan):
    _require_dict(loan, "Loan")

    terms = loan.get("terms")
    _require_dict(terms, "Loan terms")

    purpose = terms.get("loan_purpose")
    if not isinstance(purpose, str) or not purpose.strip():
        raise ValueError("Loan purpose must be a non-empty string.")

    return purpose


def _build_loan_lookup(loans):
    if not isinstance(loans, list):
        raise ValueError("Loans must be a list.")

    loan_lookup = {}

    for loan in loans:
        _require_dict(loan, "Loan")
        loan_id = _require_id(loan.get("loan_id"), "Loan ID")

        if loan_id in loan_lookup:
            raise ValueError(f"Duplicate loan ID: {loan_id!r}.")

        _require_id(loan.get("borrower_id"), "Borrower ID")
        _get_loan_purpose(loan)

        loan_lookup[loan_id] = loan

    return loan_lookup


def _validate_exposure_settings(investor):
    _require_dict(investor, "Investor")
    _require_id(investor.get("investor_id"), "Investor ID")

    exposure = investor.get("exposure")
    _require_dict(exposure, "Investor exposure")

    proposed = _require_decimal(
        exposure.get("proposed_amount"),
        "Proposed amount",
    )

    limits = exposure.get("limits")
    _require_dict(limits, "Exposure limits")

    validated_limits = {}

    for category in EXPOSURE_CATEGORIES:
        if category not in limits:
            raise ValueError(f"Missing exposure limit: {category}.")

        validated_limits[category] = _require_decimal(
            limits[category],
            f"{category} exposure limit",
        )

    return proposed, validated_limits


def _get_qualifying_investments(investor_id, investments, loan_lookup):
    if not isinstance(investments, list):
        raise ValueError("Investments must be a list.")

    qualifying = []

    for investment in investments:
        _require_dict(investment, "Investment")

        record_investor_id = _require_id(
            investment.get("investor_id"),
            "Investment investor ID",
        )

        status = investment.get("status")
        if not isinstance(status, str):
            raise ValueError("Investment status must be a string.")

        status = status.upper()

        if status not in COMMITTED_STATUSES | IGNORED_STATUSES:
            raise ValueError(f"Unsupported investment status: {status!r}.")

        # Investments belonging to other investors do not contribute.
        if record_investor_id != investor_id:
            continue

        # Cancelled and rejected investments do not contribute.
        if status in IGNORED_STATUSES:
            continue

        loan_id = _require_id(
            investment.get("loan_id"),
            "Investment loan ID",
        )

        if loan_id not in loan_lookup:
            raise ValueError(
                f"Investment references unknown loan ID: {loan_id!r}."
            )

        amount = _require_decimal(
            investment.get("amount"),
            "Investment amount",
        )
        if amount <= Decimal("0"):
            raise ValueError("Investment amount must be greater than zero.")
        qualifying.append(
            {
                "loan": loan_lookup[loan_id],
                "amount": amount,
            }
        )

    return qualifying


def _sum_amounts(amounts):
    try:
        return sum(amounts, Decimal("0"))
    except DecimalException as exc:
        raise ValueError("Could not calculate exposure totals.") from exc


def build_exposure_context(investor, target_loan, investments, loans):
    _require_dict(target_loan, "Target loan")
    target_loan_id = _require_id(
        target_loan.get("loan_id"),
        "Target loan ID",
    )
    target_borrower_id = _require_id(
        target_loan.get("borrower_id"),
        "Target borrower ID",
    )
    target_purpose = _get_loan_purpose(target_loan)

    proposed, limits = _validate_exposure_settings(investor)
    loan_lookup = _build_loan_lookup(loans)

    if target_loan_id not in loan_lookup:
        raise ValueError(
            f"Target loan ID {target_loan_id!r} is not in the loans list."
        )

    qualifying = _get_qualifying_investments(
        investor["investor_id"],
        investments,
        loan_lookup,
    )

    total_amounts = []
    loan_amounts = []
    borrower_amounts = []
    purpose_amounts = []

    for investment in qualifying:
        loan = investment["loan"]
        amount = investment["amount"]

        total_amounts.append(amount)

        if loan["loan_id"] == target_loan_id:
            loan_amounts.append(amount)

        if loan["borrower_id"] == target_borrower_id:
            borrower_amounts.append(amount)

        if _get_loan_purpose(loan) == target_purpose:
            purpose_amounts.append(amount)

    current = {
        "total": _sum_amounts(total_amounts),
        "per_loan": _sum_amounts(loan_amounts),
        "per_borrower": _sum_amounts(borrower_amounts),
        "per_purpose": _sum_amounts(purpose_amounts),
    }

    return {
        "proposed_amount": proposed,
        "limits": limits,
        "current": current,
    }