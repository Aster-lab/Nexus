import json
from decimal import Decimal
from datetime import datetime
import pytest
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent

CONFIG_PATH = (
    BASE_DIR / "config" / "recommendation_config.json"
)

INVESTOR_PATH = (
    BASE_DIR / "fixtures" / "recommendation" / "investor.json"
)

LOAN_PATH = (
    BASE_DIR / "fixtures" / "recommendation" / "loan.json"
)

INVESTMENT_PATH = (
    BASE_DIR / "fixtures" / "recommendation" / "investment.json"
)

#loading real data
@pytest.fixture
def load_test_investor():
    with open(INVESTOR_PATH, "r", encoding="utf-8") as file:
        return json.load(file,parse_float = Decimal)


@pytest.fixture
def load_test_loan():
    with open(LOAN_PATH, "r", encoding="utf-8") as file:
        return json.load(file,parse_float = Decimal)

@pytest.fixture
def load_test_investment():
    with open(INVESTMENT_PATH,"r", encoding= "utf-8") as file:
        return json.load(file,parse_float = Decimal)
#test data
@pytest.fixture
def investor():
    return {
        "investor_id": 1,
        "exposure": {
            "proposed_amount": Decimal("1000"),
            "limits": {
                "total": Decimal("50000"),
                "per_loan": Decimal("5000"),
                "per_borrower": Decimal("10000"),
                "per_purpose": Decimal("20000"),
            },
    #not used by builder
            "current": {
                "total": Decimal("99999"),
                "per_loan": Decimal("99999"),
                "per_borrower": Decimal("99999"),
                "per_purpose": Decimal("99999"),
            },
        },
    }


@pytest.fixture
def loans():
    return [
        {
            "loan_id": 10,
            "borrower_id": 101,
            "terms": {"loan_purpose": "business"},
        },
        {
            "loan_id": 11,
            "borrower_id": 101,
            "terms": {"loan_purpose": "education"},
        },
        {
            "loan_id": 12,
            "borrower_id": 102,
            "terms": {"loan_purpose": "business"},
        },
    ]


@pytest.fixture
def investments():
    return [
        {
            "investor_id": 1,
            "loan_id": 10,
            "amount": Decimal("1000"),
            "status": "CONFIRMED",
        },
        {
            "investor_id": 1,
            "loan_id": 11,
            "amount": Decimal("2000"),
            "status": "PENDING",
        },
        {
            "investor_id": 1,
            "loan_id": 12,
            "amount": Decimal("3000"),
            "status": "CONFIRMED",
        },
        {
            "investor_id": 2,
            "loan_id": 10,
            "amount": Decimal("9000"),
            "status": "CONFIRMED",
        },
        {
            "investor_id": 1,
            "loan_id": 12,
            "amount": Decimal("7000"),
            "status": "CANCELLED",
        },
        {
            "investor_id": 1,
            "loan_id": 10,
            "amount": Decimal("8000"),
            "status": "REJECTED",
        },
    ]

@pytest.fixture
def exposure_data():
    return {
        "proposed_amount" : Decimal("1000"),
        "limits" : {
            "total" : Decimal("50000"),
            "per_loan" : Decimal("5000"),
            "per_borrower" : Decimal("10000"),
            "per_borrower" : Decimal("10000"),
            "per_purpose" : Decimal("20000")
        },
        "current" : {
            "total" : Decimal("20000"),
            "per_loan" : Decimal("3000"),
            "per_borrower" : Decimal("7000"),
            "per_purpose" : Decimal("12000")
        },
    }

@pytest.fixture
def eligibility_investor():
    return {
        "investor_id": 1,
        "account": {
            "status": "ACTIVE",
            "verified": True,
            "onboarding_completed": True,
        },
        "eligibility": {
            "age": 30,
            "country": "TH",
            "investor_type": "INDIVIDUAL",
            "qualified_investor": False,
        },
        "financial": {
            "available_balance": Decimal("10000"),
            "investment_capacity": {
                "minimum": Decimal("500"),
                "maximum": Decimal("5000"),
            },
        },
        "exposure": {
            "proposed_amount": Decimal("1000"),
            "limits": {
                "total": Decimal("50000"),
                "per_loan": Decimal("5000"),
                "per_borrower": Decimal("10000"),
                "per_purpose": Decimal("20000"),
            },
            "current": {
                "total": Decimal("99999"),
                "per_loan": Decimal("99999"),
                "per_borrower": Decimal("99999"),
                "per_purpose": Decimal("99999"),
            },
        },
    }


@pytest.fixture
def eligibility_loans():
    return [
        {
            "loan_id": 10,
            "borrower_id": 101,
            "status": "OPEN",
            "amount": {
                "total": Decimal("10000"),
                "funded": Decimal("3000"),
                "investment": {
                    "min": Decimal("500"),
                    "max": Decimal("5000"),
                },
            },
            "terms": {
                "interest_rate": Decimal("10"),
                "loan_duration": 12,
                "loan_purpose": "business",
            },
            "restrictions": {
                "minimum_age": 18,
                "allowed_countries": ["TH"],
                "allowed_investor_types": ["INDIVIDUAL"],
                "qualified_investor_required": False,
            },
            "timing": {
                "opens_at": "2026-10-01T00:00:00+07:00",
                "closes_at": "2026-10-31T23:59:59+07:00",
            },
        },
        {
            "loan_id": 11,
            "borrower_id": 101,
            "status": "OPEN",
            "amount": {
                "total": Decimal("10000"),
                "funded": Decimal("2000"),
                "investment": {
                    "min": Decimal("500"),
                    "max": Decimal("5000"),
                },
            },
            "terms": {
                "interest_rate": Decimal("11"),
                "loan_duration": 24,
                "loan_purpose": "education",
            },
            "restrictions": {
                "minimum_age": 18,
                "allowed_countries": ["TH"],
                "allowed_investor_types": ["INDIVIDUAL"],
                "qualified_investor_required": False,
            },
            "timing": {
                "opens_at": "2026-10-01T00:00:00+07:00",
                "closes_at": "2026-10-31T23:59:59+07:00",
            },
        },
    ]


@pytest.fixture
def eligibility_target_loan(eligibility_loans):
    return eligibility_loans[0]


@pytest.fixture
def eligibility_investments():
    return [
        {
            "investor_id": 1,
            "loan_id": 10,
            "amount": Decimal("1000"),
            "status": "CONFIRMED",
        },
        {
            "investor_id": 1,
            "loan_id": 11,
            "amount": Decimal("2000"),
            "status": "PENDING",
        },
    ]


@pytest.fixture
def eligibility_current_time():
    return datetime.fromisoformat("2026-10-08T12:00:00+07:00")
