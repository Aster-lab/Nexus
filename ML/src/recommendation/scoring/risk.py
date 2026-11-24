def calculate_risk_score(investor_tiers,loan_tiers,mapping):
    if not investor_tiers:
        raise ValueError("Investor has no risk tiers")

    if not loan_tiers:
        raise ValueError("Loan has no risk tier")

    for tier in investor_tiers:
        if tier not in mapping:
            raise ValueError(
                f"Investor has invalid risk tier: {tier}"
            )
    loan_value = mapping[loan_tiers]
    selected_values = [mapping[tier] for tier in investor_tiers]
    highest_value = max(selected_values)

    if loan_value > highest_value:
        return 1.0

    if loan_value in selected_values:
        return 1.0

    lowest_value = min(selected_values)
    return max(0.0, 1.0 - (lowest_value - loan_value))