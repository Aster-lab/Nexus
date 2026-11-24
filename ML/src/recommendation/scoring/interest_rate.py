from .helper import calculate_range_score
def calculate_interest_rate_score(
        loan_rate,
        preferred_min,
        preferred_max,
        global_min,
        global_max
):
    return calculate_range_score(loan_rate,preferred_min,preferred_max,global_min,global_max)
