from decimal import Decimal
def calculate_investment_amount_score(
        loan_amount,
        preferred_min,
        preferred_max,
        global_max,
        minimum_score = 0.1
):
    loan_amount = Decimal(str(loan_amount))
    preferred_min = Decimal(str(preferred_min))
    preferred_max = Decimal(str(preferred_max))
    global_max = Decimal(str(global_max))
    minimum_score = Decimal(str(minimum_score))
    if preferred_min > preferred_max:
        raise ValueError(
            "Preferred min must be less than preferred max"
        )

    if loan_amount < preferred_min:
        return float(minimum_score)

    if loan_amount <= preferred_max:
        return 1.0

    if loan_amount >= global_max:
        return float(minimum_score)

    score =  minimum_score + (
        (Decimal(str(global_max)) - Decimal(str(loan_amount)))
        / (Decimal(str(global_max)) - Decimal(str(preferred_max)))
    ) * (Decimal("1") - minimum_score)
    return float(score)