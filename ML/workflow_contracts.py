"""Contracts for account-restriction scopes and information requests."""

from typing import Annotated, Literal, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictStr, StringConstraints, field_validator, model_validator


NonEmpty = Annotated[str, StringConstraints(min_length=1, strip_whitespace=True)]
FieldCode = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$", strip_whitespace=True)]


class StrictDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class AccountScope(StrictDocument):
    schema_version: Literal["account_restriction_scope.v1"]
    scope_type: Literal["ACCOUNT"]


class AllWalletsScope(StrictDocument):
    schema_version: Literal["account_restriction_scope.v1"]
    scope_type: Literal["ALL_WALLETS"]


class WalletIdsScope(StrictDocument):
    schema_version: Literal["account_restriction_scope.v1"]
    scope_type: Literal["WALLET_IDS"]
    wallet_ids: list[StrictStr] = Field(min_length=1)

    @field_validator("wallet_ids")
    @classmethod
    def require_unique_uuids(cls, values: list[str]) -> list[str]:
        try:
            parsed = [UUID(value) for value in values]
        except ValueError as exc:
            raise ValueError("wallet_ids must contain UUID values") from exc
        if len(parsed) != len(set(parsed)):
            raise ValueError("wallet_ids must be unique")
        return values


class AllLoansScope(StrictDocument):
    schema_version: Literal["account_restriction_scope.v1"]
    scope_type: Literal["ALL_LOANS"]


class LoanIdsScope(StrictDocument):
    schema_version: Literal["account_restriction_scope.v1"]
    scope_type: Literal["LOAN_IDS"]
    loan_ids: list[StrictStr] = Field(min_length=1)

    @field_validator("loan_ids")
    @classmethod
    def require_unique_uuids(cls, values: list[str]) -> list[str]:
        try:
            parsed = [UUID(value) for value in values]
        except ValueError as exc:
            raise ValueError("loan_ids must contain UUID values") from exc
        if len(parsed) != len(set(parsed)):
            raise ValueError("loan_ids must be unique")
        return values


class AllApplicationsScope(StrictDocument):
    schema_version: Literal["account_restriction_scope.v1"]
    scope_type: Literal["ALL_APPLICATIONS"]


class ApplicationIdsScope(StrictDocument):
    schema_version: Literal["account_restriction_scope.v1"]
    scope_type: Literal["APPLICATION_IDS"]
    application_ids: list[StrictStr] = Field(min_length=1)

    @field_validator("application_ids")
    @classmethod
    def require_unique_uuids(cls, values: list[str]) -> list[str]:
        try:
            parsed = [UUID(value) for value in values]
        except ValueError as exc:
            raise ValueError("application_ids must contain UUID values") from exc
        if len(parsed) != len(set(parsed)):
            raise ValueError("application_ids must be unique")
        return values


RestrictionScope = Annotated[
    Union[
        AccountScope, AllWalletsScope, WalletIdsScope, AllLoansScope,
        LoanIdsScope, AllApplicationsScope, ApplicationIdsScope,
    ],
    Field(discriminator="scope_type"),
]


class AccountRestrictionContract(BaseModel):
    """Validation bundle for restriction_type relational value and scope JSON."""
    model_config = ConfigDict(extra="forbid", strict=True)

    restriction_type: Literal["ACCOUNT_FREEZE", "WITHDRAWAL_BLOCK", "INVESTMENT_BLOCK", "APPLICATION_BLOCK"]
    scope: RestrictionScope

    @model_validator(mode="after")
    def match_type_and_scope(self):
        allowed_scope = {
            "ACCOUNT_FREEZE": "ACCOUNT",
            "WITHDRAWAL_BLOCK": {"ALL_WALLETS", "WALLET_IDS"},
            "INVESTMENT_BLOCK": {"ALL_LOANS", "LOAN_IDS"},
            "APPLICATION_BLOCK": {"ALL_APPLICATIONS", "APPLICATION_IDS"},
        }[self.restriction_type]
        scope_type = self.scope.scope_type
        if isinstance(allowed_scope, set):
            is_allowed = scope_type in allowed_scope
        else:
            is_allowed = scope_type == allowed_scope
        if not is_allowed:
            raise ValueError("scope_type is not allowed for restriction_type")
        return self


class InformationRequestItem(StrictDocument):
    field_code: FieldCode
    prompt: NonEmpty
    required: bool
    response_type: Literal["TEXT", "NUMBER", "DATE", "DOCUMENT", "YES_NO"]


class InformationRequestDetailsContract(StrictDocument):
    schema_version: Literal["information_request_details.v1"]
    items: list[InformationRequestItem] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_field_codes(self):
        codes = [item.field_code for item in self.items]
        if len(codes) != len(set(codes)):
            raise ValueError("field_code values must be unique")
        return self
