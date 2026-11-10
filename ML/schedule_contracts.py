"""Versioned JSON contracts for schedule calculation inputs and snapshots."""

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, field_validator, model_validator


SafeSatang = Annotated[StrictInt, Field(ge=0, le=9_007_199_254_740_991)]
PositiveSafeSatang = Annotated[StrictInt, Field(gt=0, le=9_007_199_254_740_991)]


class ScheduleInputsContract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal["repayment_schedule_inputs.v1"]
    principal_satang: PositiveSafeSatang
    term_months: StrictInt = Field(gt=0, le=9_007_199_254_740_991)
    first_due_date: StrictStr

    @field_validator("first_due_date")
    @classmethod
    def require_iso_calendar_date(cls, value: str) -> str:
        try:
            parsed = date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("first_due_date must be an ISO calendar date (YYYY-MM-DD)") from exc
        if parsed.isoformat() != value:
            raise ValueError("first_due_date must use YYYY-MM-DD format")
        return value


class ScheduleInstallmentContract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    installment_number: StrictInt = Field(gt=0, le=9_007_199_254_740_991)
    due_date: StrictStr
    opening_principal_satang: SafeSatang
    principal_due_satang: SafeSatang
    interest_due_satang: SafeSatang

    @field_validator("due_date")
    @classmethod
    def require_iso_calendar_date(cls, value: str) -> str:
        try:
            parsed = date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("due_date must be an ISO calendar date (YYYY-MM-DD)") from exc
        if parsed.isoformat() != value:
            raise ValueError("due_date must use YYYY-MM-DD format")
        return value


class ScheduleSnapshotContract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal["repayment_schedule_snapshot.v1"]
    installments: list[ScheduleInstallmentContract] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_installment_sequence(self):
        expected_numbers = list(range(1, len(self.installments) + 1))
        numbers = [item.installment_number for item in self.installments]
        if numbers != expected_numbers:
            raise ValueError("installments must be ordered and numbered consecutively from 1")
        dates = [date.fromisoformat(item.due_date) for item in self.installments]
        if any(later <= earlier for earlier, later in zip(dates, dates[1:])):
            raise ValueError("installment due dates must be strictly increasing")
        return self


class ScheduleVersionJsonContract(BaseModel):
    """Cross-check both JSON columns stored on one ScheduleVersion row."""
    model_config = ConfigDict(extra="forbid", strict=True)

    schedule_inputs: ScheduleInputsContract
    schedule_snapshot: ScheduleSnapshotContract

    @model_validator(mode="after")
    def validate_inputs_match_snapshot(self):
        installments = self.schedule_snapshot.installments
        if len(installments) != self.schedule_inputs.term_months:
            raise ValueError("installment count must equal term_months")
        if installments[0].due_date != self.schedule_inputs.first_due_date:
            raise ValueError("first installment due_date must match first_due_date")
        return self
