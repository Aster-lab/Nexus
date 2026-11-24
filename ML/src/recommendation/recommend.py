
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
from recommendation.scoring.helper import calculate_range_score



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


def score_dynamic_candidates(preferences: dict, candidates: list, config: dict) -> dict:
    """Score NEXUS-provided, prefiltered marketplace candidates.

    Eligibility and investor ownership remain authoritative in NEXUS. This
    function only ranks the candidate set sent by the authenticated backend.
    Monetary feature values and preference ranges use whole THB.
    """
    features = config["features"]
    feature_names = ("risk_tier", "interest_rate", "loan_duration", "loan_amount", "loan_purpose")
    weights = {name: features[name] for name in feature_names}
    mapping = features["risk_tier"]["mapping"]
    scored = []
    seen = set()

    for candidate in candidates:
        loan_id = candidate["loan_id"]
        if loan_id in seen:
            raise ValueError("Duplicate loan_id in recommendation candidates.")
        seen.add(loan_id)
        remaining_thb = max(candidate["principal_satang"] - candidate["funded_satang"], 0) / 100
        interest_rate_percent = candidate["annual_interest_rate"] * 100
        preference = preferences
        scores = {
            "risk_tier": calculate_risk_score(
                investor_tiers=preference["risk_tier"],
                loan_tiers=candidate["risk_tier"],
                mapping=mapping,
            ),
            "interest_rate": calculate_range_score(
                interest_rate_percent,
                preference["interest_rate"]["min"],
                preference["interest_rate"]["max"],
                features["interest_rate"]["min"],
                features["interest_rate"]["max"],
            ),
            "loan_duration": calculate_range_score(
                candidate["term_months"],
                preference["loan_duration"]["min"],
                preference["loan_duration"]["max"],
                features["loan_duration"]["min"],
                features["loan_duration"]["max"],
            ),
            "loan_amount": calculate_range_score(
                remaining_thb,
                preference["investment_amount"]["min"],
                preference["investment_amount"]["max"],
                features["investment_amount"]["min"],
                features["investment_amount"]["max"],
            ),
            "loan_purpose": calculate_purpose_score(
                candidate["loan_purpose"], preference["loan_purpose"]
            ),
        }
        score = calculate_weighted_score(scores=scores, weights=weights)
        scored.append({
            "loan_id": loan_id,
            "score": score,
            "feature_scores": scores,
            "interest_rate": interest_rate_percent,
        })

    scored.sort(key=lambda item: (-item["score"], -item["interest_rate"], item["loan_id"]))
    return {
        "schema_version": "nexus_investor_recommendation_response.v1",
        "recommendations": [
            {key: value for key, value in item.items() if key != "interest_rate"}
            for item in scored
        ],
    }
