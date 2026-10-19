from copy import deepcopy
from decimal import Decimal
from unittest.mock import patch

import pytest
from recommendation.recommend import recommend_loans

@pytest.fixture
def investor():
    return {
        "investor_id" : 1,
        "account": {
            "status": "ACTIVE",
            "verified": True,
            "onboarding_completed": True,
        },
        "eligibility": {
            "age": 30,
            "country": "TH",
            "investor_type": "INDIVIDUAL",
            "qualified_investor": True,
        },
        "financial": {
            "available_balance": Decimal("10000"),
            "investment_capacity": {
                "minimum": Decimal("500"),
                "maximum": Decimal("5000"),
            },
        },
        "exposure": {
            "proposed_amount": Decimal("1000"),
            "limits": {
                "total": Decimal("50000"),
                "per_loan": Decimal("5000"),
                "per_borrower": Decimal("10000"),
                "per_purpose": Decimal("20000"),
            },
        },
        "preferences" : {
            "risk_tier" : ["TIER_B","TIER_C"],
            "interest_rate" : {"min":8,"max" : 12},
            "loan_duration" : {"min":6,"max" : 36},
            "investment_amount" : {"min":500,"max" : 5000},
            "loan_purpose" : ["business","education"],
        },
    }

@pytest.fixture
def loans():
    return [
         {
            "loan_id": 101,
            "borrower_id": 201,
            "status" : "OPEN",
            "amount" : {
                "total" : Decimal(4000),
                "funded" : Decimal(0),
                "remaining" : Decimal(4000),
                "investment" : {
                    "min" : Decimal(500),
                    "max" : Decimal(4000)
                }
            },
            "terms": {
                "interest_rate": 10,
                "loan_duration": 12,
                "loan_purpose": "business",
            },
            "prediction": {
                "tier": {"tier_code": "TIER_B"},
            },
            
            "timing" : {
                "opens_at" : "2026-10-01T00:00:00+07:00",
                "closes_at" : "2026-10-31T00:00:00+07:00"
            },
            "restrictions" : {
            "allowed_investor_types" : ["INDIVIDUAL"],
            "allowed_countries" : ["TH"],
            "minimum_age" : 23,
            "qualified_investor_required" : False
        },
        },
        {
            "loan_id": 102,
            "borrower_id": 202,
            "status" : "OPEN",
            "amount" : {
                "total" :Decimal(7000),
                "funded" : Decimal(0),
                "remaining" : Decimal(7000),
                "investment" : {
                    "min" : Decimal(500),
                    "max" : Decimal(5000)
                }
            },
            "terms": {
                "interest_rate": 15,
                "loan_duration": 24,
                "loan_purpose": "education",
            },
            "prediction": {
                "tier": {"tier_code": "TIER_C"},
            },
            
        "timing" : {
            "opens_at" : "2026-10-01T00:00:00+07:00",
            "closes_at" : "2026-10-31T00:00:00+07:00"
        },
        "restrictions" : {
            "allowed_investor_types" : ["INDIVIDUAL"],
            "allowed_countries" : ["TH"],
            "minimum_age" : 23,
            "qualified_investor_required" : False
        },
        },
    ]

@pytest.fixture
def config():
    return {
        "features": {
            "risk_tier": {
                "type": "categorical",
                "weight": 0.35,
                "mapping": {
                    "TIER_A": 1.0,
                    "TIER_B": 0.67,
                    "TIER_C": 0.33,
                    "TIER_D": 0.0,
                },
            },
            "interest_rate": {
                "type": "numeric",
                "weight": 0.25,
                "min": 0,
                "max": 30,
            },
            "loan_duration": {
                "type": "numeric",
                "weight": 0.15,
                "min": 1,
                "max": 60,
            },
            "loan_amount": {
                "type": "numeric",
                "weight": 0.10,
                "min": 500,
                "max": 50000,
            },
            "investment_amount": {
                "type": "numeric",
                "min": 100,
                "max": 50000,
            },
            "loan_purpose": {
                "type": "categorical",
                "weight": 0.15,
            },
        }
    }

@pytest.fixture
def current_time():
    from datetime import datetime, timezone

    return datetime(2026, 10, 1, tzinfo=timezone.utc)

def test_recommend_loans_scores_and_ranks_eligible_loans(
    investor, loans, config, current_time
):
    feature_scores = {
        "risk_tier": 1.0,
        "interest_rate": 0.8,
        "loan_duration": 1.0,
        "loan_amount": 0.7,
        "loan_purpose": 1.0,
    }

    with (
        patch(
            "recommendation.recommend.check_eligibility",
            return_value={"eligible": True, "failed_check": None},
        ),
        patch(
            "recommendation.recommend.calculate_risk_score",
            return_value=feature_scores["risk_tier"],
        ),
        patch(
            "recommendation.recommend.calculate_interest_rate_score",
            return_value=feature_scores["interest_rate"],
        ),
        patch(
            "recommendation.recommend.calculate_loan_duration_score",
            return_value=feature_scores["loan_duration"],
        ),
        patch(
            "recommendation.recommend.calculate_investment_amount_score",
            return_value=feature_scores["loan_amount"],
        ),
        patch(
            "recommendation.recommend.calculate_purpose_score",
            return_value=feature_scores["loan_purpose"],
        ),
        patch(
            "recommendation.recommend.calculate_weighted_score",
            side_effect=[Decimal("0.85"), Decimal("0.75")],
        ),
    ):
        result = recommend_loans(
            investor=investor,
            loans=loans,
            investments=[],
            config=config,
            current_time=current_time,
        )

    assert [item["loan_id"] for item in result["recommendations"]] == [101, 102]
    assert result["recommendations"][0]["score"] == Decimal("0.85")
    assert result["recommendations"][0]["feature_scores"] == feature_scores
    assert result["excluded_loans"] == []


def test_recommend_loans_excludes_ineligible_loan(
    investor, loans, config, current_time
):
    def eligibility_side_effect(investor, loan, investments, loans, current_time):
        if loan["loan_id"] == 102:
            return {
                "eligible": False,
                "failed_check": "loan_availability",
            }
        return {"eligible": True, "failed_check": None}

    with (
        patch(
            "recommendation.recommend.check_eligibility",
            side_effect=eligibility_side_effect,
        ),
        patch(
            "recommendation.recommend.calculate_risk_score",
            return_value=1.0,
        ),
        patch(
            "recommendation.recommend.calculate_interest_rate_score",
            return_value=0.8,
        ),
        patch(
            "recommendation.recommend.calculate_loan_duration_score",
            return_value=1.0,
        ),
        patch(
            "recommendation.recommend.calculate_investment_amount_score",
            return_value=0.7,
        ),
        patch(
            "recommendation.recommend.calculate_purpose_score",
            return_value=1.0,
        ),
        patch(
            "recommendation.recommend.calculate_weighted_score",
            return_value=Decimal("0.85"),
        ),
    ):
        
        result = recommend_loans(
            investor=investor,
            loans=loans,
            investments=[],
            config=config,
            current_time=current_time,
        )

    assert [item["loan_id"] for item in result["recommendations"]] == [101]
    assert result["excluded_loans"] == [
        {
            "loan_id": 102,
            "failed_check": "loan_availability",
        }
    ]


@pytest.mark.parametrize(
    ("loans_input", "expected"),
    [
        ([], {"recommendations": [], "excluded_loans": []}),
    ],
)
def test_recommend_loans_with_no_candidates(
    investor, config, current_time, loans_input, expected
):
    result = recommend_loans(
        investor=investor,
        loans=loans_input,
        investments=[],
        config=config,
        current_time=current_time,
    )

    assert result == expected


def test_recommend_loans_does_not_mutate_inputs(
    investor, loans, config, current_time
):
    investor_before = deepcopy(investor)
    loans_before = deepcopy(loans)
    config_before = deepcopy(config)

    with patch(
        "recommendation.recommend.check_eligibility",
        return_value={"eligible": False, "failed_check": "loan_availability"},
    ):
        result = recommend_loans(
            investor=investor,
            loans=loans,
            investments=[],
            config=config,
            current_time=current_time,
        )

    assert investor == investor_before
    assert loans == loans_before
    assert config == config_before
    assert result["recommendations"] == []

def test_recommend_loans_uses_interest_rate_to_break_score_ties(
    investor, loans, config, current_time
):
    with (
        patch(
            "recommendation.recommend.check_eligibility",
            return_value={"eligible": True, "failed_check": None},
        ),
        patch(
            "recommendation.recommend.calculate_risk_score",
            return_value=1.0,
        ),
        patch(
            "recommendation.recommend.calculate_interest_rate_score",
            return_value=0.8,
        ),
        patch(
            "recommendation.recommend.calculate_loan_duration_score",
            return_value=1.0,
        ),
        patch(
            "recommendation.recommend.calculate_investment_amount_score",
            return_value=0.7,
        ),
        patch(
            "recommendation.recommend.calculate_purpose_score",
            return_value=1.0,
        ),
        patch(
            "recommendation.recommend.calculate_weighted_score",
            return_value=Decimal("0.85"),
        ),
    ):
        result = recommend_loans(
            investor=investor,
            loans=loans,
            investments=[],
            config=config,
            current_time=current_time,
        )

    assert [item["loan_id"] for item in result["recommendations"]] == [
        102,
        101,
    ]

def test_recommend_loans_uses_lower_loan_id_to_break_remaining_ties(
    investor, loans, config, current_time
):
    loans[0]["terms"]["interest_rate"] = 10
    loans[1]["terms"]["interest_rate"] = 10

    with (
        patch(
            "recommendation.recommend.check_eligibility",
            return_value={"eligible": True, "failed_check": None},
        ),
        patch(
            "recommendation.recommend.calculate_risk_score",
            return_value=1.0,
        ),
        patch(
            "recommendation.recommend.calculate_interest_rate_score",
            return_value=0.8,
        ),
        patch(
            "recommendation.recommend.calculate_loan_duration_score",
            return_value=1.0,
        ),
        patch(
            "recommendation.recommend.calculate_investment_amount_score",
            return_value=0.7,
        ),
        patch(
            "recommendation.recommend.calculate_purpose_score",
            return_value=1.0,
        ),
        patch(
            "recommendation.recommend.calculate_weighted_score",
            return_value=Decimal("0.85"),
        ),
    ):
        result = recommend_loans(
            investor=investor,
            loans=loans,
            investments=[],
            config=config,
            current_time=current_time,
        )

    assert [item["loan_id"] for item in result["recommendations"]] == [
        101,
        102,
    ]

def test_ineligible_loans_are_never_scored(
    investor, loans, config, current_time
):
    with (
        patch(
            "recommendation.recommend.check_eligibility",
            return_value={
                "eligible": False,
                "failed_check": "loan_availability",
            },
        ),
        patch(
            "recommendation.recommend.calculate_risk_score"
        ) as risk_score,
        patch(
            "recommendation.recommend.calculate_interest_rate_score"
        ) as interest_score,
        patch(
            "recommendation.recommend.calculate_loan_duration_score"
        ) as duration_score,
        patch(
            "recommendation.recommend.calculate_investment_amount_score"
        ) as amount_score,
        patch(
            "recommendation.recommend.calculate_purpose_score"
        ) as purpose_score,
        patch(
            "recommendation.recommend.calculate_weighted_score"
        ) as weighted_score,
    ):
        result = recommend_loans(
            investor=investor,
            loans=loans,
            investments=[],
            config=config,
            current_time=current_time,
        )

    assert result["recommendations"] == []
    assert len(result["excluded_loans"]) == 2

    risk_score.assert_not_called()
    interest_score.assert_not_called()
    duration_score.assert_not_called()
    amount_score.assert_not_called()
    purpose_score.assert_not_called()
    weighted_score.assert_not_called()

def test_recommend_loans_returns_empty_recommendations_when_all_are_ineligible(
    investor, loans, config, current_time
):
    with patch(
        "recommendation.recommend.check_eligibility",
        return_value={
            "eligible": False,
            "failed_check": "loan_availability",
        },
    ):
        result = recommend_loans(
            investor=investor,
            loans=loans,
            investments=[],
            config=config,
            current_time=current_time,
        )

    assert result == {
        "recommendations": [],
        "excluded_loans": [
            {
                "loan_id": 101,
                "failed_check": "loan_availability",
            },
            {
                "loan_id": 102,
                "failed_check": "loan_availability",
            },
        ],
    }

def test_recommend_loans_rejects_duplicate_loan_ids(
    investor, loans, config, current_time
):
    loans[1]["loan_id"] = loans[0]["loan_id"]

    with pytest.raises(ValueError, match="Duplicate loan_id"):
        recommend_loans(
            investor=investor,
            loans=loans,
            investments=[],
            config=config,
            current_time=current_time,
        )

def test_recommendation_includes_client_facing_loan_details(
    investor, loans, config, current_time
):
    result = recommend_loans(
        investor=investor,
        loans=loans,
        investments=[],
        config=config,
        current_time=current_time,
    )
    print("Recommendations:", result["recommendations"])
    print("Excluded loans:", result["excluded_loans"])

    recommendation = result["recommendations"][0]

    assert "loan_details" in recommendation
    assert recommendation["loan_details"]["borrower_id"] == loans[0]["borrower_id"]
    assert recommendation["loan_details"]["amount"] == loans[0]["amount"]
    assert recommendation["loan_details"]["terms"] == loans[0]["terms"]


def test_recommendation_exposes_risk_tier_but_not_internal_prediction(
    investor, loans, config, current_time
):
    result = recommend_loans(
        investor=investor,
        loans=loans,
        investments=[],
        config=config,
        current_time=current_time,
    )

    recommendation = result["recommendations"][0]

    assert recommendation["loan_details"]["risk_tier"] in {
        "TIER_A",
        "TIER_B",
        "TIER_C",
        "TIER_D",
    }
    assert "prediction" not in recommendation
    assert "default_probability" not in recommendation["loan_details"]
    assert "spatial_metrics" not in recommendation["loan_details"]