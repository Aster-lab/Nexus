"""Versioned strict contracts for the approved initial transactional outbox events."""

from typing import Annotated, Literal, Union
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StrictInt, StrictStr, model_validator


MAX_SAFE_INTEGER = 9_007_199_254_740_991
PositiveSafeSatang = Annotated[StrictInt, Field(gt=0, le=MAX_SAFE_INTEGER)]


def require_uuid(value: str) -> str:
    try:
        UUID(value)
    except ValueError as exc:
        raise ValueError("value must be a UUID") from exc
    return value


UUIDText = Annotated[StrictStr, AfterValidator(require_uuid)]


class StrictDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ApplicationSubmittedData(StrictDocument):
    application_version_id: UUIDText


class InvestmentCommittedData(StrictDocument):
    investment_id: UUIDText
    principal_satang: PositiveSafeSatang


class LoanFundedData(StrictDocument):
    repayment_schedule_id: UUIDText


class RepaymentPostedData(StrictDocument):
    repayment_id: UUIDText
    total_satang: PositiveSafeSatang


class WithdrawalRequestedData(StrictDocument):
    withdrawal_request_id: UUIDText
    amount_satang: PositiveSafeSatang


class DocumentScanRequestedData(StrictDocument):
    document_id: UUIDText


OutboxEventData = Union[
    ApplicationSubmittedData,
    InvestmentCommittedData,
    LoanFundedData,
    RepaymentPostedData,
    WithdrawalRequestedData,
    DocumentScanRequestedData,
]


class OutboxPayloadContract(StrictDocument):
    schema_version: Literal["nexus_outbox_payload.v1"]
    event_data: OutboxEventData


class OutboxEventContract(BaseModel):
    """Validation bundle coupling the relational eventType and payload JSON."""
    model_config = ConfigDict(extra="forbid", strict=True)

    event_type: Literal[
        "APPLICATION_SUBMITTED", "INVESTMENT_COMMITTED", "LOAN_FUNDED",
        "REPAYMENT_POSTED", "WITHDRAWAL_REQUESTED", "DOCUMENT_SCAN_REQUESTED",
    ]
    payload: OutboxPayloadContract

    @model_validator(mode="after")
    def match_event_type_and_payload(self):
        expected = {
            "APPLICATION_SUBMITTED": ApplicationSubmittedData,
            "INVESTMENT_COMMITTED": InvestmentCommittedData,
            "LOAN_FUNDED": LoanFundedData,
            "REPAYMENT_POSTED": RepaymentPostedData,
            "WITHDRAWAL_REQUESTED": WithdrawalRequestedData,
            "DOCUMENT_SCAN_REQUESTED": DocumentScanRequestedData,
        }[self.event_type]
        if not isinstance(self.payload.event_data, expected):
            raise ValueError("event_data shape does not match event_type")
        return self
