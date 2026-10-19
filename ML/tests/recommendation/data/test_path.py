from recommendation.data.path import (
    INVESTOR_DATA_PATH,
    LOAN_DATA_PATH,
    INVESTMENT_DATA_PATH,
    RECOMMENDATION_CONFIG_PATH,
)


def test_data_paths_point_to_expected_files():
    assert INVESTOR_DATA_PATH.name == "investor.json"
    assert LOAN_DATA_PATH.name == "loan.json"
    assert INVESTMENT_DATA_PATH.name == "investment.json"
    assert RECOMMENDATION_CONFIG_PATH.name == "recommendation_config.json"


def test_data_paths_are_absolute():
    assert INVESTOR_DATA_PATH.is_absolute()
    assert LOAN_DATA_PATH.is_absolute()
    assert INVESTMENT_DATA_PATH.is_absolute()
    assert RECOMMENDATION_CONFIG_PATH.is_absolute()