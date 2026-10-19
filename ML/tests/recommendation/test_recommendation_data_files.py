from recommendation.data.path import (
    INVESTOR_DATA_PATH,
    LOAN_DATA_PATH,
    INVESTMENT_DATA_PATH,
    RECOMMENDATION_CONFIG_PATH,
)
from recommendation.data.json_repository import load_recommendation_data


def test_real_recommendation_json_files_can_be_loaded():
    data = load_recommendation_data(
        investor_path=INVESTOR_DATA_PATH,
        loans_path=LOAN_DATA_PATH,
        investments_path=INVESTMENT_DATA_PATH,
        config_path=RECOMMENDATION_CONFIG_PATH,
    )

    assert isinstance(data["investor"], dict)
    assert isinstance(data["loans"], list)
    assert isinstance(data["investments"], list)
    assert isinstance(data["config"], dict)