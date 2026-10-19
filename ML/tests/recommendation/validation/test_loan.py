from recommendation.validation.loan import validate_loan
from recommendation.validation.load_config import load_config

def test_loan(load_test_loan):
    loans = load_test_loan
    config = load_config()
    for loan in loans:
        validate_loan(loan, config)