"""Strict contract for immutable ApplicationVersion.submittedData JSON."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StringConstraints


NonEmpty = Annotated[str, StringConstraints(min_length=1, strip_whitespace=True)]
SafeCount = Annotated[StrictInt, Field(ge=0, le=9_007_199_254_740_991)]


class ApplicationAddress(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    line1: NonEmpty
    line2: str | None
    subdistrict: str | None
    district: str | None
    province: str | None
    postal_code: str | None
    country_code: str | None


class BorrowerProfileAddressContract(ApplicationAddress):
    """Versioned shape for the editable BorrowerProfile.address JSON column."""
    schema_version: Literal["borrower_profile_address.v1"]


class ApplicationBorrower(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    legal_name: NonEmpty
    phone: str | None
    address: ApplicationAddress


class ApplicationEmployment(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    employment_status: NonEmpty
    employer_name: str | None
    occupation: str | None
    months_in_role: SafeCount | None


class ApplicationRequestedLoan(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    purpose: NonEmpty
    amount_satang: StrictInt = Field(gt=0, le=9_007_199_254_740_991)
    term_months: StrictInt = Field(gt=0, le=9_007_199_254_740_991)


class ApplicationSnapshotContract(BaseModel):
    """Approved baseline; financial and credit facts live in BorrowerFinancialInformation."""

    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal["application_snapshot.v1"]
    borrower: ApplicationBorrower
    employment: ApplicationEmployment
    requested_loan: ApplicationRequestedLoan
