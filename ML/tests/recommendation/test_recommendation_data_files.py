from pathlib import Path

from recommendation.data.json_repository import load_recommendation_data


def test_committed_recommendation_test_fixtures_can_be_loaded():
    fixture_root = Path(__file__).resolve().parents[1] / "fixtures" / "recommendation"
    config_path = Path(__file__).resolve().parents[2] / "config" / "recommendation_config.json"
    data = load_recommendation_data(
        investor_path=fixture_root / "investor.json",
        loans_path=fixture_root / "loan.json",
        investments_path=fixture_root / "investment.json",
        config_path=config_path,
    )

    assert isinstance(data["investor"], dict)
    assert isinstance(data["loans"], list)
    assert isinstance(data["investments"], list)
    assert isinstance(data["config"], dict)
