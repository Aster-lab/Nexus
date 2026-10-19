from datetime import datetime
from recommendation.eligibility.loan_availability import(
     check_loan_availability,
     check_loan_status,
     check_investment_time,
     check_funding
)

CURRENT_TIME = datetime.fromisoformat(
    "2026-10-08T12:00:00+07:00"
)

def create_loan():
    return{
        "status" : 'OPEN',
        'amount': {
            "total" : 10000,
            "funded" : 3000,
            "investment" : {
                'min': 500,
                'max' : 5000,
            },
        },
        "timing" : {
            'opens_at': "2026-10-01T00:00:00+07:00",
            'closes_at' : '2026-10-31T23:59:59+07:00'
        },
    }

#loan status
def test_check_loan_status():
    loan = create_loan()
    assert check_loan_status(loan) is True

    loan['status'] = 'DRAFT'
    assert check_loan_status(loan) is False

    loan['status'] = 'FUNDED'
    assert check_loan_status(loan) is False

    loan['status'] = 'CANCELLED'
    assert check_loan_status(loan) is False

    loan['status'] = 'EXPIRED'
    assert check_loan_status(loan) is False

    loan['status'] = 'INVALID'
    assert check_loan_status(loan) is False

#funding
def test_check_funding():
    loan= create_loan()
    assert check_funding(loan) is True

    loan['amount']['funded'] = 0
    assert check_funding(loan) is True

    loan['amount']['funded'] = 5000
    assert check_funding(loan) is True

    loan['amount']['funded'] = 9500
    assert check_funding(loan) is True

    loan['amount']['funded'] = 9501
    assert check_funding(loan) is False

    loan['amount']['funded'] = 10000
    assert check_funding(loan) is False

    loan['amount']['funded'] = 10001
    assert check_funding(loan) is False

    loan['amount']['funded'] = -1
    assert check_funding(loan) is False

    loan['amount']['total'] = -1
    assert check_funding(loan) is False

def test_check_investment_time():
    loan = create_loan()

    current_time = datetime.fromisoformat("2026-10-08T12:00:00+07:00")       
    assert check_investment_time(loan,current_time) is True

    current_time = datetime.fromisoformat("2026-09-08T12:00:00+07:00")       
    assert check_investment_time(loan,current_time) is False

    current_time = datetime.fromisoformat("2026-10-01T00:00:00+07:00")       
    assert check_investment_time(loan,current_time) is True

    current_time = datetime.fromisoformat("2026-10-01T00:00:01+07:00")       
    assert check_investment_time(loan,current_time) is True

    current_time = datetime.fromisoformat("2026-10-31T23:59:58+07:00")       
    assert check_investment_time(loan,current_time) is True

    current_time = datetime.fromisoformat("2026-10-31T23:59:59+07:00")       
    assert check_investment_time(loan,current_time) is True

    current_time = datetime.fromisoformat("2026-11-01T23:59:58+07:00")       
    assert check_investment_time(loan,current_time) is False

    loan["timing"]["opens_at"] = "2026-10-31T00:00:00+07:00"
    loan["timing"]["closes_at"] = "2026-10-01T00:00:00+07:00"

    current_time = datetime.fromisoformat("2026-10-15T12:00:00+07:00")

    assert check_investment_time(loan,current_time) is False

#loan_availability
def test_check_availability():
    loan = create_loan()

    assert check_loan_availability(loan,CURRENT_TIME) is True

    loan['status'] = 'FUNDED'
    assert check_loan_availability(loan,CURRENT_TIME) is False

    loan["status"] = "CANCELLED"
    assert check_loan_availability(loan,CURRENT_TIME) is False

    loan["amount"]["funded"] = 10000
    assert check_loan_availability(loan,CURRENT_TIME) is False

    loan["amount"]["funded"] = 9501
    assert check_loan_availability(loan,CURRENT_TIME) is False

    loan["amount"]["total"] = 0
    assert check_loan_availability(loan,CURRENT_TIME) is False

    current_time = datetime.fromisoformat(
        "2026-09-30T23:59:59"
    )
    assert check_loan_availability(loan,current_time) is False
    current_time = datetime.fromisoformat(
        "2026-11-01T00:00:00+07:00"
    )
    assert check_loan_availability(loan,current_time) is False

#use case
def test_check_availability_usecase(load_test_loan):
    loans = load_test_loan
    results = []
    for loan in loans:
        available = check_loan_availability(loan,CURRENT_TIME)
        results.append({
            "loan_id" : loan['loan_id'],
            "status" : loan['status'],
            "available" :available,
        })
    for result in results:
        print(result)
    assert len(results) == 4
