import pytest
from recommendation.eligibility.investor_account import (
    check_account_status,
    check_verification,
    check_onboarding,
    check_investor_account,
)

def make_investor(status='ACTIVE',verified=True,onboarding = True):
    return {
        "account" : {
            "status" : status,
            "verified" : verified,
            "onboarding_completed" : onboarding
        }
    }

@pytest.mark.parametrize(
    "status,expected",
    [
        ('ACTIVE',True),
        ('PENDING',False),
        ('SUSPENDED',False),
        ('CLOSED',False),
        ("RESTRICTED", False),
        ("INVALID", False),
    ]
)
def test_check_account_status(status,expected):
    investor = make_investor(status=status)
    assert check_account_status(investor) is expected

@pytest.mark.parametrize(
    "verified,expected",
    [
        (True,True),
        (False,False),
    ]
)
def test_check_verification(verified,expected):
    investor = make_investor(verified=verified)
    assert check_verification(investor) is expected

@pytest.mark.parametrize(
    "onboarding_completed, expected",
    [
        (True, True),
        (False, False),
    ],
)
def test_check_onboarding(onboarding_completed,expected):
    investor = make_investor(onboarding=onboarding_completed)
    assert check_onboarding(investor) is expected

@pytest.mark.parametrize(
    "status, verified, onboarding_completed, expected",
    [
        ("ACTIVE", True, True, True),
        ("SUSPENDED", True, True, False),
        ("ACTIVE", False, True, False),
        ("ACTIVE", True, False, False),
        ("CLOSED", False, False, False),
    ],
)
def test_check_investor_account(status,verified,onboarding_completed,expected):
    investor = make_investor(status = status, verified=verified,onboarding=onboarding_completed)
    assert check_investor_account(investor) is expected


def test_check_investor_account_usecase(load_test_investor):
    investor = load_test_investor

    status = check_account_status(investor)
    verified = check_verification(investor)
    onboarding = check_onboarding(investor)
    eligible = check_investor_account(investor)

    print(
        f"Investor {investor['investor_id']}: "
        f"status_ok={status}, "
        f"verification_ok={verified}, "
        f"onboarding_ok={onboarding}, "
        f"eligible={eligible}"
    )

    assert eligible == (
        status and verified and onboarding
    )