from recommendation.validation.investor import validate_investor
from recommendation.validation.load_config import load_config


def test_investor(load_test_investor):
    investor = load_test_investor
    config = load_config()
    validate_investor(investor, config)
