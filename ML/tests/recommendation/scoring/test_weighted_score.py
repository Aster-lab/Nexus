import pytest
from recommendation.scoring.weighted_score import calculate_weighted_score
from recommendation.scoring.risk import calculate_risk_score
from recommendation.scoring.interest_rate import calculate_interest_rate_score
from recommendation.scoring.duration import calculate_loan_duration_score
from recommendation.scoring.investment_amount import calculate_investment_amount_score
from recommendation.scoring.purpose import calculate_purpose_score
from recommendation.validation.load_config import load_config

def test_weighted_score():
    scores = {
        "risk_tier": 1.0,
        "interest_rate": 0.8,
        "loan_duration": 0.6,
        "loan_amount": 0.5,
        "loan_purpose": 1.0,
    }

    weights = {
        "risk_tier": {"weight": 0.35},
        "interest_rate": {"weight": 0.25},
        "loan_duration": {"weight": 0.15},
        "loan_amount": {"weight": 0.10},
        "loan_purpose": {"weight": 0.15},
    }

    scores = calculate_weighted_score(scores, weights)
    expected = (
        1.0 * 0.35
        + 0.8 * 0.25
        + 0.6 * 0.15
        + 0.5 * 0.10
        + 1.0 * 0.15
    )

    assert scores == pytest.approx(expected)

def test_weighted_score_usecase(load_test_investor,load_test_loan):
    config = load_config()
    investor = load_test_investor
    loans = load_test_loan

    investor_preferences = investor['preferences']
    features = config["features"]
    scored_loans = []
    for loan in loans:
        scores = {
            "risk_tier": calculate_risk_score(
                investor_preferences["risk_tier"],
                loan["prediction"]["tier"]['tier_code'],
                features["risk_tier"]["mapping"]
            ),
            "interest_rate": calculate_interest_rate_score(
                loan["terms"]["interest_rate"],
                investor_preferences["interest_rate"]["min"],
                investor_preferences["interest_rate"]["max"],
                features["interest_rate"]["min"],
                features["interest_rate"]["max"]
            ),
            "loan_duration": calculate_loan_duration_score(
                loan["terms"]["loan_duration"],
                investor_preferences["loan_duration"]["min"],
                investor_preferences["loan_duration"]["max"],
                features["loan_duration"]["min"],
                features["loan_duration"]["max"]
            ),
            "loan_amount": calculate_investment_amount_score(
                loan["amount"]["remaining"],
                investor_preferences["investment_amount"]["min"],
                investor_preferences["investment_amount"]["max"],
                features["loan_amount"]["max"]
            ),
            "loan_purpose": calculate_purpose_score(
                loan["terms"]["loan_purpose"],
                investor_preferences["loan_purpose"]
            )
        }

        weighted_score = calculate_weighted_score(scores, features)
        scored_loans.append({"loan_id": loan["loan_id"], "score": weighted_score})

        print(
            f"\nLoan {loan['loan_id']}"
            f"\n  Risk:        {scores['risk_tier']:.4f}"
            f"\n  Interest:    {scores['interest_rate']:.4f}"
            f"\n  Duration:    {scores['loan_duration']:.4f}"
            f"\n  Amount:      {scores['loan_amount']:.4f}"
            f"\n  Purpose:     {scores['loan_purpose']:.4f}"
            f"\n  Final score: {weighted_score:.4f}"
        )
    for loan in scored_loans:
        print(f"Loan {loan['loan_id']} final score: {loan['score']:.4f}")
    assert len(scored_loans) == len(loans)
    for loan in scored_loans:
        assert 0.0 <= loan["score"] <= 1.0