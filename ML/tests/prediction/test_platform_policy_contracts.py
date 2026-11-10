from pathlib import Path

import pytest
from pydantic import ValidationError

from platform_policy_contracts import PlatformPolicyContract, validate_interest_repayment_consistency, RepaymentPolicyValues, LoanInterestPolicyValues

def _valid_loan_offer_policy():
    return {
        "policy_code": "LOAN_OFFER_POLICY",
        "policy_values": {
            "schema_version": "loan_offer_policy.v1",
            "min_principal_satang": 100000,
            "max_principal_satang": 5000000,
            "allowed_term_months": [3, 6, 9, 12, 18, 24],
            "offer_validity_days": 7,
        },
    }
# essiential notification policy
def test_essential_notification_policy_contract_and_zod_alignment():
    policy = PlatformPolicyContract.model_validate({
        "policy_code": "ESSENTIAL_NOTIFICATION_POLICY",
        "policy_values": {
            "schema_version": "essential_notification_policy.v1",
            "categories": [
                {"category_code": "SECURITY_ALERT", "required_channels": ["IN_APP", "EMAIL"]},
                {"category_code": "FINANCIAL_TRANSACTION", "required_channels": ["IN_APP"]},
            ],
        },
    })
    assert policy.policy_values.schema_version == "essential_notification_policy.v1"

    contract_path = Path(__file__).resolve().parents[3] / "web" / "src" / "lib" / "contracts" / "platform-policy.ts"
    zod_contract = contract_path.read_text(encoding="utf-8")
    for value in (
        "ESSENTIAL_NOTIFICATION_POLICY", "essential_notification_policy.v1", "category_code",
        "required_channels", "IN_APP", "EMAIL", "LOAN_OFFER_POLICY", "loan_offer_policy.v1",
        "LOAN_INTEREST_POLICY", "loan_interest_policy.v1", "PLATFORM_FEE_POLICY", "platform_fee_policy.v1",
        "REPAYMENT_POLICY", "repayment_policy.v1",
    ):
        assert value in zod_contract

def test_essential_notification_policy_rejects_duplicate_categories_and_empty_channels():
    with pytest.raises(ValidationError, match="category_code values must be unique"):
        PlatformPolicyContract.model_validate({
            "policy_code": "ESSENTIAL_NOTIFICATION_POLICY",
            "policy_values": {"schema_version": "essential_notification_policy.v1", "categories": [
                {"category_code": "SECURITY_ALERT", "required_channels": ["IN_APP"]},
                {"category_code": "FINANCIAL_TRANSACTION", "required_channels": ["EMAIL"]},
                {"category_code": "SECURITY_ALERT", "required_channels": ["EMAIL"]},
            ]},
        })
    with pytest.raises(ValidationError):
        PlatformPolicyContract.model_validate({
            "policy_code": "ESSENTIAL_NOTIFICATION_POLICY",
            "policy_values": {"schema_version": "essential_notification_policy.v1", "categories": [
                {"category_code": "SECURITY_ALERT", "required_channels": []},
            ]},
        })
def test_notification_policy_rejects_duplicated_channels():
    with pytest.raises(ValidationError, match="required_channels values must be unique"):
        PlatformPolicyContract.model_validate({
            "policy_code": "ESSENTIAL_NOTIFICATION_POLICY",
            "policy_values": {"schema_version": "essential_notification_policy.v1", "categories": [
                {"category_code": "SECURITY_ALERT", "required_channels": ["IN_APP", "IN_APP"]},
            ]},
        })

#loan offer policy
def test_loan_offer_policy_bounds_and_policy_code_pairing():
    policy = PlatformPolicyContract.model_validate({
        "policy_code": "LOAN_OFFER_POLICY",
        "policy_values": {
            "schema_version": "loan_offer_policy.v1", "min_principal_satang": 100000,
            "max_principal_satang": 5000000, "allowed_term_months": [3, 6, 9, 12, 18, 24],
            "offer_validity_days": 7,
        },
    })
    assert policy.policy_values.offer_validity_days == 7

    with pytest.raises(ValidationError, match="must not exceed"):
        PlatformPolicyContract.model_validate({
            "policy_code": "LOAN_OFFER_POLICY",
            "policy_values": {"schema_version": "loan_offer_policy.v1", "min_principal_satang": 200,
                "max_principal_satang": 100, "allowed_term_months": [12], "offer_validity_days": 7},
        })
    with pytest.raises(ValidationError, match="does not match policy_code"):
        PlatformPolicyContract.model_validate({
            "policy_code": "LOAN_OFFER_POLICY",
            "policy_values": {"schema_version": "essential_notification_policy.v1",
                "categories": [{"category_code": "SECURITY_ALERT", "required_channels": ["IN_APP"]}]},
        })

def test_loan_offer_policy_rejects_duplicate_terms():
    with pytest.raises(ValidationError, match="allowed_term_months values must be unique"):
        PlatformPolicyContract.model_validate({
            "policy_code": "LOAN_OFFER_POLICY",
            "policy_values": {"schema_version": "loan_offer_policy.v1", "min_principal_satang": 100000,
                "max_principal_satang": 5000000, "allowed_term_months": [12, 12], "offer_validity_days": 7},
        })


def test_loan_offer_rejects_unapproved_minimum_principal():
    with pytest.raises(ValidationError):
        PlatformPolicyContract.model_validate({
            "policy_code": "LOAN_OFFER_POLICY",
            "policy_values": {
                **_valid_loan_offer_policy(),
                "min_principal_satang": 99999,
            },
        })


def test_loan_offer_rejects_unapproved_maximum_principal():
    with pytest.raises(ValidationError):
        PlatformPolicyContract.model_validate({
            "policy_code": "LOAN_OFFER_POLICY",
            "policy_values": {
                **_valid_loan_offer_policy(),
                "max_principal_satang": 5000001,
            },
        })


def test_loan_offer_rejects_unsupported_terms():
    with pytest.raises(ValidationError):
        PlatformPolicyContract.model_validate({
            "policy_code": "LOAN_OFFER_POLICY",
            "policy_values": {
                **_valid_loan_offer_policy(),
                "allowed_term_months": [3, 6, 10],
            },
        })


def test_loan_offer_rejects_missing_approved_term():
    with pytest.raises(ValidationError):
        PlatformPolicyContract.model_validate({
            "policy_code": "LOAN_OFFER_POLICY",
            "policy_values": {
                **_valid_loan_offer_policy(),
                "allowed_term_months": [3, 6, 9, 12, 18],
            },
        })


def test_loan_offer_rejects_unapproved_validity_period():
    with pytest.raises(ValidationError):
        PlatformPolicyContract.model_validate({
            "policy_code": "LOAN_OFFER_POLICY",
            "policy_values": {
                **_valid_loan_offer_policy(),
                "offer_validity_days": 14,
            },
        })

#laon interst policy
def test_loan_interest_policy_accepts_approved_configuration():
    policy = PlatformPolicyContract.model_validate({
        "policy_code": "LOAN_INTEREST_POLICY",
        "policy_values": {
            "schema_version": "loan_interest_policy.v1",
            "annual_interest_rate_basis_points": 1200,
            "calculation_method": "REDUCING_BALANCE",
            "calculation_frequency": "MONTHLY",
            "currency": "THB",
        },
    })

    assert policy.policy_values.annual_interest_rate_basis_points == 1200
    assert policy.policy_values.currency == "THB"


@pytest.mark.parametrize(
    "field,value",
    [
        ("currency", "USD"),
        ("calculation_method", "FLAT_RATE"),
        ("calculation_frequency", "YEARLY"),
        ("annual_interest_rate_basis_points", 0),
        ("annual_interest_rate_basis_points", -100),
        ("annual_interest_rate_basis_points", 1200.5),
    ],
)
def test_loan_interest_policy_rejects_invalid_values(field, value):
    values = {
        "schema_version": "loan_interest_policy.v1",
        "annual_interest_rate_basis_points": 1200,
        "calculation_method": "REDUCING_BALANCE",
        "calculation_frequency": "MONTHLY",
        "currency": "THB",
    }

    values[field] = value

    with pytest.raises(ValidationError):
        PlatformPolicyContract.model_validate({
            "policy_code": "LOAN_INTEREST_POLICY",
            "policy_values": values,
        })

#platform fee policy
def test_platform_fee_policy_accepts_approved_configuration():
    policy = PlatformPolicyContract.model_validate({
        "policy_code": "PLATFORM_FEE_POLICY",
        "policy_values": {
            "schema_version": "platform_fee_policy.v1",
            "fee_rate_basis_points": 200,
            "calculation_basis": "ORIGINAL_LOAN_PRINCIPAL",
            "calculation_timing": "ONCE_PER_LOAN",
            "wallet_deduction": False,
            "treatment": "CALCULATE_AND_DISPLAY_ONLY",
            "currency": "THB",
        },
    })

    assert policy.policy_values.fee_rate_basis_points == 200
    assert policy.policy_values.wallet_deduction is False


@pytest.mark.parametrize(
    "field,value",
    [
        ("fee_rate_basis_points", 0),
        ("fee_rate_basis_points", -200),
        ("calculation_basis", "OUTSTANDING_BALANCE"),
        ("calculation_timing", "MONTHLY"),
        ("wallet_deduction", True),
        ("treatment", "COLLECT_AND_DEDUCT"),
        ("currency", "USD"),
    ],
)
def test_platform_fee_policy_rejects_invalid_values(field, value):
    values = {
        "schema_version": "platform_fee_policy.v1",
        "fee_rate_basis_points": 200,
        "calculation_basis": "ORIGINAL_LOAN_PRINCIPAL",
        "calculation_timing": "ONCE_PER_LOAN",
        "wallet_deduction": False,
        "treatment": "CALCULATE_AND_DISPLAY_ONLY",
        "currency": "THB",
    }

    values[field] = value

    with pytest.raises(ValidationError):
        PlatformPolicyContract.model_validate({
            "policy_code": "PLATFORM_FEE_POLICY",
            "policy_values": values,
        })

#repayment policy
def test_repayment_policy_accepts_approved_configuration():
    policy = PlatformPolicyContract.model_validate({
        "policy_code": "REPAYMENT_POLICY",
        "policy_values": {
            "schema_version": "repayment_policy.v1",
            "repayment_frequency": "MONTHLY",
            "repayment_schedule": "EQUAL_MONTHLY_INSTALLMENTS",
            "interest_calculation_method": "REDUCING_BALANCE",
            "annual_interest_rate_basis_points": 1200,
            "repayment_components": ["PRINCIPAL", "INTEREST"],
            "currency": "THB",
        },
    })

    assert policy.policy_values.repayment_components == [
        "PRINCIPAL",
        "INTEREST",
    ]


@pytest.mark.parametrize(
    "components",
    [
        ["PRINCIPAL"],
        ["INTEREST"],
        ["PRINCIPAL", "PRINCIPAL"],
        ["INTEREST", "INTEREST"],
        ["PRINCIPAL", "INTEREST", "FEE"],
        ["PRINCIPAL", "INTEREST", "INTEREST"],
    ],
)
def test_repayment_policy_rejects_invalid_components(components):
    with pytest.raises(ValidationError):
        PlatformPolicyContract.model_validate({
            "policy_code": "REPAYMENT_POLICY",
            "policy_values": {
                "schema_version": "repayment_policy.v1",
                "repayment_frequency": "MONTHLY",
                "repayment_schedule": "EQUAL_MONTHLY_INSTALLMENTS",
                "interest_calculation_method": "REDUCING_BALANCE",
                "annual_interest_rate_basis_points": 1200,
                "repayment_components": components,
                "currency": "THB",
            },
        })


def test_repayment_policy_rejects_wrong_schedule_or_currency():
    base_values = {
        "schema_version": "repayment_policy.v1",
        "repayment_frequency": "MONTHLY",
        "repayment_schedule": "EQUAL_MONTHLY_INSTALLMENTS",
        "interest_calculation_method": "REDUCING_BALANCE",
        "annual_interest_rate_basis_points": 1200,
        "repayment_components": ["PRINCIPAL", "INTEREST"],
        "currency": "THB",
    }

    for field, value in [
        ("repayment_frequency", "WEEKLY"),
        ("repayment_schedule", "INTEREST_ONLY"),
        ("interest_calculation_method", "FLAT_RATE"),
        ("annual_interest_rate_basis_points", 1000),
        ("currency", "USD"),
    ]:
        values = {**base_values, field: value}

        try:
            PlatformPolicyContract.model_validate({
                "policy_code": "REPAYMENT_POLICY",
                "policy_values": values,
            })
        except ValidationError:
            continue

        pytest.fail(
            f"Repayment policy incorrectly accepted "
            f"{field}={value!r}"
        )
#cross validation
def _valid_interest_policy(rate=1200):
    return PlatformPolicyContract.model_validate({
        "policy_code": "LOAN_INTEREST_POLICY",
        "policy_values": {
            "schema_version": "loan_interest_policy.v1",
            "annual_interest_rate_basis_points": rate,
            "calculation_method": "REDUCING_BALANCE",
            "calculation_frequency": "MONTHLY",
            "currency": "THB",
        },
    })


def _valid_repayment_policy(rate=1200):
    return PlatformPolicyContract.model_validate({
        "policy_code": "REPAYMENT_POLICY",
        "policy_values": {
            "schema_version": "repayment_policy.v1",
            "repayment_frequency": "MONTHLY",
            "repayment_schedule": "EQUAL_MONTHLY_INSTALLMENTS",
            "interest_calculation_method": "REDUCING_BALANCE",
            "annual_interest_rate_basis_points": rate,
            "repayment_components": ["PRINCIPAL", "INTEREST"],
            "currency": "THB",
        },
    })


def test_interest_and_repayment_policies_accept_matching_rates():
    interest_policy = _valid_interest_policy(1200)
    repayment_policy = _valid_repayment_policy(1200)

    validate_interest_repayment_consistency(
        interest_policy,
        repayment_policy,
    )


def test_interest_and_repayment_policies_reject_mismatched_rates():
    interest_policy = _valid_interest_policy(1200)
    repayment_policy = _valid_repayment_policy(1200)

    invalid_repayment_values = RepaymentPolicyValues.model_construct(
        schema_version="repayment_policy.v1",
        repayment_frequency="MONTHLY",
        repayment_schedule="EQUAL_MONTHLY_INSTALLMENTS",
        interest_calculation_method="REDUCING_BALANCE",
        annual_interest_rate_basis_points=1000,
        repayment_components=["PRINCIPAL", "INTEREST"],
        currency="THB",
    )

    repayment_policy = PlatformPolicyContract.model_construct(
        policy_code="REPAYMENT_POLICY",
        policy_values=invalid_repayment_values,
    )

    with pytest.raises(ValueError, match="must match"):
        validate_interest_repayment_consistency(
            interest_policy,
            repayment_policy,
        )
#strict validation
def test_policy_contract_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        PlatformPolicyContract.model_validate({
            "policy_code": "LOAN_INTEREST_POLICY",
            "policy_values": {
                "schema_version": "loan_interest_policy.v1",
                "annual_interest_rate_basis_points": 1200,
                "calculation_method": "REDUCING_BALANCE",
                "calculation_frequency": "MONTHLY",
                "currency": "THB",
                "unexpected_setting": True,
            },
        })


def test_policy_contract_rejects_wrong_policy_code():
    with pytest.raises(ValidationError):
        PlatformPolicyContract.model_validate({
            "policy_code": "UNKNOWN_POLICY",
            "policy_values": {
                "schema_version": "loan_interest_policy.v1",
                "annual_interest_rate_basis_points": 1200,
                "calculation_method": "REDUCING_BALANCE",
                "calculation_frequency": "MONTHLY",
                "currency": "THB",
            },
        })