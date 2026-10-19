#ranking
def rank_loans(scored_loans):
    return sorted(
        scored_loans,
        key=lambda loan: (
            loan['score'],
            loan['terms']['interest_rate'],
            -loan['loan_id'],
        ),
        reverse=True
    )