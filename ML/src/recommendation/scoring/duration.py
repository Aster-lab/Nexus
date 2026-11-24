from .helper import calculate_range_score
def calculate_loan_duration_score(
        loan_duration,
        preferred_min,
        preferred_max,
        global_min,
        global_max
):
    return calculate_range_score(loan_duration,preferred_min,preferred_max,global_min,global_max)
