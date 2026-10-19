import pytest
from recommendation.scoring.interest_rate import calculate_interest_rate_score
from recommendation.validation.load_config import load_config

#INTEREST RATE SCORE
#unit test
def test_interest_rate_score():
    #global - 0.30
    #preferred = 8 - 12

    assert calculate_interest_rate_score(
        0,8,12,0,30) == pytest.approx(0.0)

    assert calculate_interest_rate_score(
        4,8,12,0,30) == pytest.approx(0.5)

    assert calculate_interest_rate_score(
        8,8,12,0,30) == pytest.approx(1.0)

    assert calculate_interest_rate_score(
        10,8,12,0,30) == pytest.approx(1.0)

    assert calculate_interest_rate_score(
        12,8,12,0,30) == pytest.approx(1.0)

    assert calculate_interest_rate_score(
        15,8,12,0,30) == pytest.approx(5/6)

    assert calculate_interest_rate_score(
        21,8,12,0,30) == pytest.approx(0.5)

    assert calculate_interest_rate_score(
        30,8,12,0,30) == pytest.approx(0.0)
    
#usecase - test the score
def test_interest_rate_usecase(load_test_investor,load_test_loan):

    config = load_config()
    investor = load_test_investor
    loans = load_test_loan

    global_min = config["features"]["interest_rate"]["min"]
    global_max = config["features"]["interest_rate"]["max"]

    preferred_min = investor['preferences']['interest_rate']['min']
    preferred_max = investor['preferences']['interest_rate']['max']

    for loan in loans:
        score = calculate_interest_rate_score(
            loan['terms']['interest_rate'],
            preferred_min,
            preferred_max,
            global_min,
            global_max
        )

        print(
            f"Loan {loan['loan_id']} "
            f"({loan['terms']['interest_rate']}%) "
            f"→ interest rate score: {score}"
        )
        assert score >= 0.0 and score <= 1.0