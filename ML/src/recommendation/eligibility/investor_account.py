def check_account_status(investor):
    return investor['account']['status'] == "ACTIVE"

def check_verification(investor):
    return investor['account']['verified'] is True

def check_onboarding(investor):
    return investor['account']['onboarding_completed'] is True

def check_investor_account(investor):
    return (
        check_account_status(investor)
        and check_verification(investor)
        and check_onboarding(investor)
    )