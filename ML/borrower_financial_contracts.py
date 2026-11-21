"""Versioned contracts for BorrowerFinancialInformation JSON columns."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, field_validator, model_validator


NonEmpty = Annotated[str, Field(min_length=1)]
SafeSatang = Annotated[StrictInt, Field(ge=0, le=9_007_199_254_740_991)]
PositiveSafeSatang = Annotated[StrictInt, Field(gt=0, le=9_007_199_254_740_991)]
SafeCount = Annotated[StrictInt, Field(ge=0, le=9_007_199_254_740_991)]
Frequency = Literal["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "ONE_TIME"]


class StrictDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class IncomeItem(StrictDocument):
    entry_id: NonEmpty
    category: Literal["SALARY", "BUSINESS", "FREELANCE", "RENTAL", "INVESTMENT", "OTHER"]
    amount_satang: PositiveSafeSatang
    frequency: Frequency


class IncomeDataContract(StrictDocument):
    schema_version: Literal["borrower_income.v1"]
    items: list[IncomeItem]


class ExpenseItem(StrictDocument):
    entry_id: NonEmpty
    category: Literal[
        "HOUSING", "UTILITIES", "FOOD", "TRANSPORT", "HEALTHCARE", "EDUCATION",
        "INSURANCE", "FAMILY_SUPPORT", "OTHER",
    ]
    amount_satang: PositiveSafeSatang
    frequency: Frequency


class ExpenseDataContract(StrictDocument):
    schema_version: Literal["borrower_expenses.v1"]
    items: list[ExpenseItem]


class DebtItem(StrictDocument):
    entry_id: NonEmpty
    category: Literal["CREDIT_CARD", "PERSONAL_LOAN", "AUTO_LOAN", "MORTGAGE", "STUDENT_LOAN", "OTHER"]
    outstanding_balance_satang: SafeSatang
    payment_satang: SafeSatang
    payment_frequency: Frequency


class DebtDataContract(StrictDocument):
    schema_version: Literal["borrower_debts.v1"]
    items: list[DebtItem]


class CreditDataContract(StrictDocument):
    schema_version: Literal["borrower_credit.v1"]
    entry_id: NonEmpty
    bureau_name: NonEmpty
    report_date: StrictStr
    credit_score: SafeCount | None
    inquiry_count_12_months: SafeCount
    delinquency_count_12_months: SafeCount

    @field_validator("report_date")
    @classmethod
    def require_iso_calendar_date(cls, value: str) -> str:
        try:
            parsed = date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("report_date must be an ISO calendar date (YYYY-MM-DD)") from exc
        if parsed.isoformat() != value:
            raise ValueError("report_date must use YYYY-MM-DD format")
        return value


class CreditDataV2Contract(StrictDocument):
    schema_version: Literal["borrower_credit.v2"]
    entry_id: NonEmpty
    bureau_name: NonEmpty
    report_date: StrictStr
    credit_score: SafeCount
    inquiry_count_12_months: SafeCount
    delinquency_count_12_months: SafeCount
    accounts_opened_past_24_months: SafeCount
    bankcard_balance_satang: SafeSatang
    bankcard_credit_limit_satang: PositiveSafeSatang
    revolving_balance_satang: SafeSatang
    revolving_credit_limit_satang: PositiveSafeSatang

    @field_validator("report_date")
    @classmethod
    def require_iso_calendar_date(cls, value: str) -> str:
        try:
            parsed = date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("report_date must be an ISO calendar date (YYYY-MM-DD)") from exc
        if parsed.isoformat() != value:
            raise ValueError("report_date must use YYYY-MM-DD format")
        return value

class FinancialSourceItem(StrictDocument):
    entry_id: NonEmpty
    data_type: Literal["INCOME", "EXPENSE", "DEBT", "CREDIT"]
    source_type: Literal["SELF_DECLARED", "DOCUMENT", "BANK_STATEMENT", "CREDIT_BUREAU", "OTHER"]
    captured_at: StrictStr
    verification_status: Literal["SELF_REPORTED", "PENDING", "VERIFIED", "REJECTED"]

    @field_validator("captured_at")
    @classmethod
    def require_timezone(cls, value: str) -> str:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("captured_at must be an ISO timestamp") from exc
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError("captured_at must include a timezone")
        return value


class SourceMetadataContract(StrictDocument):
    schema_version: Literal["borrower_financial_sources.v1"]
    items: list[FinancialSourceItem]


class BorrowerFinancialInformationContract(BaseModel):
    """Validation bundle; its five members persist in separate JSON columns."""
    model_config = ConfigDict(extra="forbid", strict=True)

    income_data: IncomeDataContract
    expense_data: ExpenseDataContract
    debt_data: DebtDataContract
    credit_data: CreditDataContract | CreditDataV2Contract
    source_metadata: SourceMetadataContract

    @model_validator(mode="after")
    def validate_entry_provenance(self):
        entries: dict[str, str] = {}
        groups = (
            (self.income_data.items, "INCOME"),
            (self.expense_data.items, "EXPENSE"),
            (self.debt_data.items, "DEBT"),
            ([self.credit_data], "CREDIT"),
        )
        for items, data_type in groups:
            for item in items:
                if item.entry_id in entries:
                    raise ValueError("entry_id values must be unique across financial data")
                entries[item.entry_id] = data_type

        provenance: dict[str, str] = {}
        for item in self.source_metadata.items:
            if item.entry_id in provenance:
                raise ValueError("source metadata must contain at most one record per entry_id")
            provenance[item.entry_id] = item.data_type
        if provenance != entries:
            raise ValueError("source metadata must match each financial entry_id and data_type exactly")
        return self
