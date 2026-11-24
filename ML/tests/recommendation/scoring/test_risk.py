import pytest
from recommendation.scoring.risk import calculate_risk_score
from recommendation.validation.load_config import load_config

def test_risk_score():
    mapping = {
        "TIER_A": 1.0,
        "TIER_B": 0.67,
        "TIER_C": 0.33,
        "TIER_D": 0.0 }

    investor_preferences = ["TIER_B","TIER_C"]

    assert calculate_risk_score(
        investor_preferences,
        "TIER_A",
        mapping
    ) == pytest.approx(1.0)

    assert calculate_risk_score(
        investor_preferences,
        "TIER_B",
        mapping
    ) == pytest.approx(1.0)

    assert calculate_risk_score(
        investor_preferences,
        "TIER_C",
        mapping
    ) == pytest.approx(1.0)

    assert calculate_risk_score(
        investor_preferences,
        "TIER_D",
        mapping
    ) == pytest.approx(0.67)

def test_risk_usecase_multiple(load_test_investor,load_test_loan):
    config = load_config()
    investor = load_test_investor
    loans = load_test_loan

    mapping = config["features"]["risk_tier"]["mapping"]
    investor_preferences = investor['preferences']['risk_tier']
    for loan in loans:
        score = calculate_risk_score(
            investor_preferences,
            loan['prediction']['tier']['tier_code'],
            mapping
        )
        assert score >= 0.0 and score <= 1.0

def test_all_loans_scored(load_test_investor,load_test_loan):
    config = load_config()
    investor = load_test_investor
    loans = load_test_loan

    mapping = config["features"]["risk_tier"]["mapping"]
    scores =[]
    for loan in loans:
        score = calculate_risk_score(
            investor['preferences']['risk_tier'],
            loan['prediction']['tier']['tier_code'],
            mapping
        )
        scores.append(score)

        print(
            f"Loan {loan['loan_id']} "
            f"({loan['prediction']['tier']['tier_code']}) -> risk score: {score}"
        )
    assert len(scores) == len(loans)
