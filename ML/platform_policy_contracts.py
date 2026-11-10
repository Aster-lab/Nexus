"""Strict contracts for the approved initial PlatformPolicy code catalog."""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StringConstraints, model_validator


MAX_SAFE_INTEGER = 9_007_199_254_740_991
PositiveSafeInt = Annotated[StrictInt, Field(gt=0, le=MAX_SAFE_INTEGER)]

#notification codes are uppercase
CategoryCode = Annotated[
    str,
    StringConstraints(pattern=r"^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$", max_length=60, strip_whitespace=True),
]


class StrictDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

#essiental notification policy
class EssentialNotificationCategory(StrictDocument):
    category_code: CategoryCode
    required_channels: list[Literal["IN_APP", "EMAIL"]] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_channels(self):
        if len(self.required_channels) != len(set(self.required_channels)):
            raise ValueError("required_channels values must be unique")
        return self


class EssentialNotificationPolicyValues(StrictDocument):
    schema_version: Literal["essential_notification_policy.v1"]
    categories: list[EssentialNotificationCategory] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_categories(self):
        codes = [category.category_code for category in self.categories]
        if len(codes) != len(set(codes)):
            raise ValueError("category_code values must be unique")
        return self

#loan offer policy
class LoanOfferPolicyValues(StrictDocument):
    schema_version: Literal["loan_offer_policy.v1"]
    min_principal_satang: PositiveSafeInt
    max_principal_satang: PositiveSafeInt
    allowed_term_months: list[PositiveSafeInt] = Field(min_length=1)
    offer_validity_days: PositiveSafeInt

    @model_validator(mode="after")
    def validate_bounds_and_terms(self):
        if self.min_principal_satang > self.max_principal_satang:
            raise ValueError("min_principal_satang must not exceed max_principal_satang")
        if len(self.allowed_term_months) != len(set(self.allowed_term_months)):
            raise ValueError("allowed_term_months values must be unique")
        if self.min_principal_satang != 100000:
            raise ValueError("min_principal_satang must equal 100000 satang")
        if self.max_principal_satang != 5000000:
            raise ValueError("max_principal_satang must equal 5000000 satang")

        expected_terms = {3,6,9,12,18,24}
        if set(self.allowed_term_months) != expected_terms:
            raise ValueError("allowed_term_months exactly {3,6,9,12,18,24}")
        if self.offer_validity_days != 7:
            raise ValueError("offer_validity_days must equal 7")
        return self



#loan interest policy
class LoanInterestPolicyValues(StrictDocument):
    schema_version: Literal["loan_interest_policy.v1"]
    annual_interest_rate_basis_points: PositiveSafeInt
    calculation_method: Literal["REDUCING_BALANCE"]
    calculation_frequency: Literal["MONTHLY"]
    currency: Literal["THB"]

#platform fee policy
class PlatformFeePolicyValues(StrictDocument):
    schema_version: Literal["platform_fee_policy.v1"]
    fee_rate_basis_points: PositiveSafeInt
    calculation_basis: Literal["ORIGINAL_LOAN_PRINCIPAL"]
    calculation_timing: Literal["ONCE_PER_LOAN"]
    wallet_deduction : Literal[False]
    treatment : Literal["CALCULATE_AND_DISPLAY_ONLY"]
    currency: Literal["THB"]

#repayment policy
class RepaymentPolicyValues(StrictDocument):
    schema_version: Literal["repayment_policy.v1"]
    repayment_frequency: Literal["MONTHLY"]
    repayment_schedule: Literal["EQUAL_MONTHLY_INSTALLMENTS"]
    interest_calculation_method: Literal["REDUCING_BALANCE"]
    annual_interest_rate_basis_points: Literal[1200]
    repayment_components: list[Literal["PRINCIPAL", "INTEREST"]] = Field(min_length=2,max_length=2)
    currency: Literal["THB"]

    @model_validator(mode= "after")
    def validate_repayment_components(self):
        expected_components = {"PRINCIPAL", "INTEREST"}
        if set(self.repayment_components) != expected_components:
            raise ValueError("repayment_components must contain exactly 'PRINCIPAL' and 'INTEREST'")
        return self

#combined policy values
PolicyValues = Union[
    EssentialNotificationPolicyValues,
    LoanOfferPolicyValues,
    LoanInterestPolicyValues,
    PlatformFeePolicyValues,
    RepaymentPolicyValues]

POLICY_CONTRACTS = {
    "ESSENTIAL_NOTIFICATION_POLICY": EssentialNotificationPolicyValues,
    "LOAN_OFFER_POLICY": LoanOfferPolicyValues,
    "LOAN_INTEREST_POLICY": LoanInterestPolicyValues,
    "PLATFORM_FEE_POLICY": PlatformFeePolicyValues,
    "REPAYMENT_POLICY": RepaymentPolicyValues
}

class PlatformPolicyContract(BaseModel):
    """Validation bundle coupling relational policyCode to policyValues JSON."""
    model_config = ConfigDict(extra="forbid", strict=True)

    policy_code: Literal[
        "ESSENTIAL_NOTIFICATION_POLICY",
        "LOAN_OFFER_POLICY",
        "LOAN_INTEREST_POLICY",
        "PLATFORM_FEE_POLICY",
        "REPAYMENT_POLICY"
    ]
    policy_values: PolicyValues

    @model_validator(mode="after")
    def match_code_to_values(self):
        expected =POLICY_CONTRACTS[self.policy_code]
        if not isinstance(self.policy_values, expected):
            raise ValueError("policy_values schema does not match policy_code")
        return self

#cross policy validation
def validate_interest_repayment_consistency(
        interest_policy: PlatformPolicyContract,
        repayment_policy: PlatformPolicyContract
) -> None:
    if interest_policy.policy_code != "LOAN_INTEREST_POLICY":
        raise ValueError("interest_policy must have policy_code 'LOAN_INTEREST_POLICY'")
    if repayment_policy.policy_code != "REPAYMENT_POLICY":
        raise ValueError("repayment_policy must have policy_code 'REPAYMENT_POLICY'")
    
    interest_values = interest_policy.policy_values
    repayment_values = repayment_policy.policy_values

    if not isinstance(interest_values, LoanInterestPolicyValues):
        raise ValueError("interest_policy.policy_values must be of type LoanInterestPolicyValues")
    if not isinstance(repayment_values, RepaymentPolicyValues):
        raise ValueError("repayment_policy.policy_values must be of type RepaymentPolicyValues")

    if interest_values.annual_interest_rate_basis_points != repayment_values.annual_interest_rate_basis_points:
        raise ValueError("annual_interest_rate_basis_points must match between interest_policy and repayment_policy")