
from recommendation.eligibility.check_eligibility import check_eligibility

from recommendation.scoring.risk import calculate_risk_score
from recommendation.scoring.interest_rate import calculate_interest_rate_score
from recommendation.scoring.duration import calculate_loan_duration_score
from recommendation.scoring.investment_amount import (
    calculate_investment_amount_score,
)
from recommendation.scoring.purpose import calculate_purpose_score
from recommendation.scoring.weighted_score import calculate_weighted_score
from recommendation.scoring.ranking import rank_loans



def recommend_loans(
    investor: dict,
    loans: list,
    investments: list,
    config: dict,
    current_time,
) -> dict:
    recommendations = []
    excluded_loans = []

    features = config["features"]

    # Only the five weighted features contribute to the score.
    scoring_features = {
        name: features[name]
        for name in (
            "risk_tier",
            "interest_rate",
            "loan_duration",
            "loan_amount",
            "loan_purpose",
        )
    }

    loan_ids = [loan["loan_id"] for loan in loans]

    if len(loan_ids) != len(set(loan_ids)):
        raise ValueError("Duplicate loan_id found in candidate loans")

    for loan in loans:
        eligibility = check_eligibility(
            investor=investor,
            loan=loan,
            investments=investments,
            loans=loans,
            current_time=current_time,
        )

        if not eligibility["eligible"]:
            excluded_loans.append({
                "loan_id": loan["loan_id"],
                "failed_check": eligibility["failed_check"],
            })
            continue

        print("DEBUG after eligibility:", loan)
        print("DEBUG keys after eligibility:", loan.keys())

        preference = investor["preferences"]
        terms = loan["terms"]

        feature_scores = {
            "risk_tier": calculate_risk_score(
                investor_tiers=preference["risk_tier"],
                loan_tiers=loan["prediction"]["tier"]["tier_code"],
                mapping=features["risk_tier"]["mapping"],
            ),
            "interest_rate": calculate_interest_rate_score(
                loan_rate=terms["interest_rate"],
                preferred_min=preference["interest_rate"]["min"],
                preferred_max=preference["interest_rate"]["max"],
                global_min=features["interest_rate"]["min"],
                global_max=features["interest_rate"]["max"],
            ),
            "loan_duration": calculate_loan_duration_score(
                loan_duration=terms["loan_duration"],
                preferred_min=preference["loan_duration"]["min"],
                preferred_max=preference["loan_duration"]["max"],
                global_min=features["loan_duration"]["min"],
                global_max=features["loan_duration"]["max"],
            ),
            "loan_amount": calculate_investment_amount_score(
                loan_amount=loan["amount"]["total"],
                preferred_min=preference["investment_amount"]["min"],
                preferred_max=preference["investment_amount"]["max"],
                global_max=features["loan_amount"]["max"],
            ),
            "loan_purpose": calculate_purpose_score(
                loan_purpose=terms["loan_purpose"],
                investor_purposes=preference["loan_purpose"],
            ),
        }

        score = calculate_weighted_score(
            scores=feature_scores,
            weights=scoring_features,
        )

        recommendations.append({
            "loan_id": loan["loan_id"],
            "score": score,
            "feature_scores": feature_scores,
            "terms": {
                "interest_rate" : loan['terms']['interest_rate'],
            },
            "loan_details": {
            "borrower_id": loan["borrower_id"],
            "amount": loan["amount"],
            "terms": loan["terms"],
            "risk_tier": loan["prediction"]["tier"]["tier_code"],
        },
        })
    return {
        "recommendations": rank_loans(recommendations),
        "excluded_loans": excluded_loans,
    }