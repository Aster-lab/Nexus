def check_investment_capacity(investor,loan):
    capacity = investor['financial']['investment_capacity']
    investment = loan['amount']['investment']

    investor_min = capacity['minimum']
    investor_max = capacity['maximum']
    loan_min = investment['min']
    loan_max = investment['max']

    if investor_min > investor_max:
        raise ValueError("Investor minimum investment cannot exceed maximum")
    if loan_min > loan_max:
        raise ValueError("Loan minimum investment cannot exceed maximum")

    return investor_min<= loan_max and loan_min <= investor_max

def check_available_balance(investor,loan):
    available_balance = investor['financial']['available_balance']
    loan_min = loan['amount']['investment']['min']

    return available_balance >= loan_min

def check_investment_compatibility(investor,loan):
    return (
        check_investment_capacity(investor,loan)
        and check_available_balance(investor,loan)
    )