import pytest
from recommendation.eligibility.investment_compatibility import (
    check_investment_capacity,
    check_available_balance,
    check_investment_compatibility
)

def make_investor(
        min = 500,
        max = 5000,
        balance = 10000
):
    return {
        "financial" : {
            "available_balance" : balance,
            "investment_capacity":{
                "minimum" : min,
                "maximum" : max,
            },
        }
    }

def make_loan(min=1000,max = 8000):
    return {
        "amount" : {
            "investment" :{
                "min" : min,
                "max" : max,
            },
        }
    }

@pytest.mark.parametrize(
    "investor_min,investor_max,loan_min,loan_max,expected",
    [
        (500, 5000, 1000, 8000, True),
        (500, 5000, 5000, 10000, True),
        (500, 5000, 6000, 10000, False),
        (10000, 20000, 500, 5000, False),
        (500, 5000, 500, 5000, True),
    ],
)
def test_check_investment_capacity(
    investor_min,
    investor_max,
    loan_min,
    loan_max,
    expected,
) :
    investor = make_investor(min = investor_min, max = investor_max)
    loan = make_loan(loan_min,loan_max)
    assert check_investment_capacity(investor,loan) is expected

def test_check_investment_capacity_invalid_range():
    investor = make_investor(min=5000,max = 500)
    loan =make_loan()

    with pytest.raises(ValueError):
        check_investment_capacity(investor,loan)

def test_check_investment_capacity_invalid_loan():
    investor = make_investor()
    loan = make_loan(min = 8000, max = 1000)

    with pytest.raises(ValueError):
        check_investment_capacity(investor,loan)

@pytest.mark.parametrize(
    "balance,loan_min,expected",
    [
        (10000, 500, True),
        (500, 500, True),
        (499, 500, False),
        (3000, 500, True),
    ]
)
def test_check_balance_availability(balance, loan_min, expected):
    investor = make_investor(balance = balance)
    loan = make_loan(min = loan_min)

    assert check_available_balance(investor,loan) is expected

@pytest.mark.parametrize(
    "capacity_min, capacity_max, balance, loan_min, loan_max, expected",
    [
        (500, 5000, 10000, 1000, 8000, True),
        (500, 5000, 500, 1000, 8000, False),
        (500, 5000, 10000, 6000, 10000, False),
        (10000, 20000, 10000, 500, 5000, False),
    ],
)
def test_check_investment_compatibility(
    capacity_min,
    capacity_max,
    balance,
    loan_min,
    loan_max,
    expected,
):
    investor = make_investor(
        min=capacity_min,
        max=capacity_max,
        balance=balance,
    )
    loan = make_loan(loan_min, loan_max)

    assert check_investment_compatibility(investor, loan) is expected

def test_investment_compatibility_usecase(load_test_investor,load_test_loan):
    investor = load_test_investor
    loans = load_test_loan

    for loan in loans:
        capacity = check_investment_capacity(investor,loan)
        balance = check_available_balance(investor,loan)
        compatible = check_investment_compatibility(investor,loan)

        print(
            f"Loan {loan['loan_id']}: "
            f"capacity_ok={capacity}, "
            f"balance_ok={balance}, "
            f"compatible={compatible}"
        )

        assert isinstance(capacity,bool)
        assert isinstance(balance,bool)
        assert compatible == (capacity and balance)