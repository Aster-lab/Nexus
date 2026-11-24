import pytest
from recommendation.scoring.investment_amount import calculate_investment_amount_score
from recommendation.validation.load_config import load_config

def test_investment_amount_score():
    preferred_min = 500
    preferred_max = 5000
    global_max = 50000
    minimum_score = 0.1

    test_cases = [
        (100, 0.1),
        (500, 1.0),
        (1000, 1.0),
        (2500, 1.0),
        (5000, 1.0),
        (10000, 0.8999999),
        (20000,0.7),
        (30000,0.5),
        (40000,0.3),
        (50000, 0.1),
    ]

    for value, expected in test_cases:
        score = calculate_investment_amount_score(
            value,
            preferred_min,
            preferred_max,
            global_max,
            minimum_score
        )
        assert score == pytest.approx(expected)

def test_investment_amount_usecase(load_test_investor,load_test_loan):
    investor = load_test_investor
    loans = load_test_loan
    config = load_config()

    preferred_min = investor['preferences']['investment_amount']['min']
    preferred_max = investor['preferences']['investment_amount']['max']
    global_max = config['features']['loan_amount']['max']

    for loan in loans:
        score = calculate_investment_amount_score(
            loan['amount']['remaining'],
            preferred_min,
            preferred_max,
            global_max
        )

        print(
            f"Loan {loan['loan_id']} "
            f"(${loan['amount']['remaining']}) "
            f"→ investment amount score: {score}"
        )
        assert score >= 0.0 and score <= 1.0
