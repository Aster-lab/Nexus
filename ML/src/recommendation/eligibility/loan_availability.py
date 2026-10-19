from datetime import datetime

def check_loan_status(loan):
    return loan['status'] == "OPEN"

def check_funding(loan):
    total = loan['amount']['total']
    funded = loan['amount']['funded']
    min = loan['amount']['investment']['min']

    return (
        total >0 
        and 0<= funded <= total
        and total - funded >= min
    )


def check_investment_time(loan,current_time):
    opens_at = loan['timing']['opens_at']
    closes_at = loan['timing']['closes_at']

    if isinstance(opens_at,str):
        opens_at = datetime.fromisoformat(opens_at)

    if isinstance(closes_at,str):
        closes_at = datetime.fromisoformat(closes_at)

    return opens_at <= current_time <= closes_at

def check_loan_availability(loan,current_time):
    return (
        check_loan_status(loan)
        and check_funding(loan)
        and check_investment_time(loan,current_time)
    )
