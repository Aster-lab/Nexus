from unittest.mock import patch

from recommendation.recommendation_service import get_recommendations


def test_get_recommendations_loads_data_and_calls_pipeline():
    data = {
        "investor": {"investor_id": 1},
        "loans": [{"loan_id": 10}],
        "investments": [],
        "config": {"features": {}},
    }
    expected = {
        "recommendations": [{"loan_id": 10, "score": 0.9}],
        "excluded_loans": [],
    }

    with (
        patch(
            "recommendation.recommendation_service.load_recommendation_data",
            return_value=data,
        ) as load_data,
        patch(
            "recommendation.recommendation_service.recommend_loans",
            return_value=expected,
        ) as recommend,
    ):
        result = get_recommendations(
            investor_path="investor.json",
            loans_path="loans.json",
            investments_path="investments.json",
            config_path="config.json",
            current_time="2026-10-14T12:00:00",
        )

    assert result == expected
    load_data.assert_called_once()
    recommend.assert_called_once_with(
        investor=data["investor"],
        loans=data["loans"],
        investments=data["investments"],
        config=data["config"],
        current_time="2026-10-14T12:00:00",
    )