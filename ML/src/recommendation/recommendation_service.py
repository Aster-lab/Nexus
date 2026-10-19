from recommendation.data.path import (
    INVESTMENT_DATA_PATH,
    LOAN_DATA_PATH,
    INVESTOR_DATA_PATH,
    RECOMMENDATION_CONFIG_PATH,
)
from recommendation.data.json_repository import load_recommendation_data
from recommendation.recommend import recommend_loans

def get_recommendations(
    current_time,
    investor_path = INVESTOR_DATA_PATH,
    loans_path = LOAN_DATA_PATH,
    investments_path = INVESTMENT_DATA_PATH,
    config_path = RECOMMENDATION_CONFIG_PATH,
):
    """Load recommendation data and return ranked recommendations."""
    data = load_recommendation_data(
        investor_path=investor_path,
        loans_path=loans_path,
        investments_path=investments_path,
        config_path=config_path,
    )

    return recommend_loans(
        investor=data["investor"],
        loans=data["loans"],
        investments=data["investments"],
        config=data["config"],
        current_time=current_time,
    )