import pytest
from recommendation.scoring.purpose import calculate_purpose_score
from recommendation.validation.load_config import load_config

#loan purpose
def test_purpose_score():
    investor_purposes = ["home_improvement", "debt_consolidation"]

    test_cases = [
        ("home_improvement", 1.0),
        ("debt_consolidation", 1.0),
        ("small_business", 0.0),
        ("medical_expenses", 0.0),
    ]

    for loan_purpose, expected in test_cases:
        score = calculate_purpose_score(loan_purpose, investor_purposes)
        assert score == pytest.approx(expected)

#usecase
def test_purpose_usecase(load_test_investor,load_test_loan):
    investor = load_test_investor
    loans = load_test_loan

    investor_purposes = investor['preferences']['loan_purpose']

    for loan in loans:
        score = calculate_purpose_score(
            loan["terms"]["loan_purpose"],
            investor_purposes
        )

        print(
            f"Loan {loan['loan_id']} "
            f"({loan['terms']['loan_purpose']}) "
            f"→ purpose score: {score}"
        )
        assert score >= 0.0 and score <= 1.0