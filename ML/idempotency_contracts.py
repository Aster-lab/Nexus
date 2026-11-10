"""Operation-specific versioned response snapshots for IdempotencyRecord."""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

from outbox_contracts import UUIDText


MAX_SAFE_INTEGER = 9_007_199_254_740_991
PositiveSafeInt = Annotated[StrictInt, Field(gt=0, le=MAX_SAFE_INTEGER)]
SafeInt = Annotated[StrictInt, Field(ge=0, le=MAX_SAFE_INTEGER)]


class StrictDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class LedgerTransactionResponse(StrictDocument):
    schema_version: Literal["idempotency_response.v1"]
    ledger_transaction_id: UUIDText
    status: Literal["DRAFT", "POSTED", "REVERSED"]


class InvestmentContributionResponse(StrictDocument):
    schema_version: Literal["idempotency_response.v1"]
    contribution_id: UUIDText
    investment_id: UUIDText
    amount_satang: PositiveSafeInt


class InvestorPayoutResponse(StrictDocument):
    schema_version: Literal["idempotency_response.v1"]
    investor_payout_id: UUIDText
    status: Literal["PENDING", "PROCESSING", "COMPLETED", "FAILED"]
    principal_satang: SafeInt
    interest_satang: SafeInt


class WithdrawalRequestResponse(StrictDocument):
    schema_version: Literal["idempotency_response.v1"]
    withdrawal_request_id: UUIDText
    status: Literal["REQUESTED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"]
    amount_satang: PositiveSafeInt


ResponseSnapshot = Union[
    LedgerTransactionResponse,
    InvestmentContributionResponse,
    InvestorPayoutResponse,
    WithdrawalRequestResponse,
]


class IdempotencyResponseSnapshotContract(BaseModel):
    """Validation bundle coupling relational operationType with snapshot JSON."""
    model_config = ConfigDict(extra="forbid", strict=True)

    operation_type: Literal[
        "CREATE_LEDGER_TRANSACTION", "CREATE_INVESTMENT_CONTRIBUTION",
        "CREATE_INVESTOR_PAYOUT", "CREATE_WITHDRAWAL_REQUEST",
    ]
    response_snapshot: ResponseSnapshot | None

    @model_validator(mode="after")
    def match_operation_type(self):
        if self.response_snapshot is None:
            return self
        expected = {
            "CREATE_LEDGER_TRANSACTION": LedgerTransactionResponse,
            "CREATE_INVESTMENT_CONTRIBUTION": InvestmentContributionResponse,
            "CREATE_INVESTOR_PAYOUT": InvestorPayoutResponse,
            "CREATE_WITHDRAWAL_REQUEST": WithdrawalRequestResponse,
        }[self.operation_type]
        if not isinstance(self.response_snapshot, expected):
            raise ValueError("response snapshot shape does not match operation_type")
        return self
