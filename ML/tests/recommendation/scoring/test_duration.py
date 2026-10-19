import pytest
from recommendation.scoring.duration import calculate_loan_duration_score
from recommendation.validation.load_config import load_config

#DURATION SCORE
#unit test
def test_duration_score():
    preferred_min = 6
    preferred_max = 24
    global_min = 1
    global_max = 60

    test_cases = [
        (1, 0.0),
        (3, 0.4),
        (6, 1.0),
        (12, 1.0),
        (24, 1.0),
        (30, pytest.approx(5 / 6)),
        (42, 0.5),
        (60, 0.0),
    ]

    for value, expeced in test_cases:
        score = calculate_loan_duration_score(
            value,
            preferred_min,
            preferred_max,
            global_min,
            global_max
        )
        assert score == pytest.approx(expeced)

def test_duration_usecase(load_test_investor,load_test_loan):
    config = load_config()
    investor = load_test_investor
    loans = load_test_loan

    global_min = config["features"]["loan_duration"]["min"]
    global_max = config["features"]["loan_duration"]["max"]

    preferred_min = investor['preferences']['loan_duration']['min']
    preferred_max = investor['preferences']['loan_duration']['max']

    for loan in loans:
        score = calculate_loan_duration_score(
            loan["terms"]["loan_duration"],
            preferred_min,
            preferred_max,
            global_min,
            global_max
        )

        print(
            f"Loan {loan['loan_id']} "
            f"({loan['terms']['loan_duration']} months) "
            f"→ duration score: {score}"
        )
        assert score >= 0.0 and score <= 1.0