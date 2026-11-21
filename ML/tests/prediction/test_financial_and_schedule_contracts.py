from pathlib import Path

import pytest
from pydantic import ValidationError

from borrower_financial_contracts import BorrowerFinancialInformationContract
from schedule_contracts import ScheduleInputsContract, ScheduleSnapshotContract, ScheduleVersionJsonContract


def financial_example():
    return {
        "income_data": {"schema_version": "borrower_income.v1", "items": [{
            "entry_id": "income-1", "category": "SALARY", "amount_satang": 2500000, "frequency": "MONTHLY",
        }]},
        "expense_data": {"schema_version": "borrower_expenses.v1", "items": [{
            "entry_id": "expense-1", "category": "HOUSING", "amount_satang": 800000, "frequency": "MONTHLY",
        }]},
        "debt_data": {"schema_version": "borrower_debts.v1", "items": [{
            "entry_id": "debt-1", "category": "CREDIT_CARD", "outstanding_balance_satang": 500000,
            "payment_satang": 100000, "payment_frequency": "MONTHLY",
        }]},
        "credit_data": {
            "schema_version": "borrower_credit.v1", "entry_id": "credit-1", "bureau_name": "Example Bureau",
            "report_date": "2026-10-31", "credit_score": None,
            "inquiry_count_12_months": 1, "delinquency_count_12_months": 0,
        },
        "source_metadata": {"schema_version": "borrower_financial_sources.v1", "items": [
            {"entry_id": "income-1", "data_type": "INCOME", "source_type": "SELF_DECLARED",
             "captured_at": "2026-11-05T10:00:00+07:00", "verification_status": "SELF_REPORTED"},
            {"entry_id": "expense-1", "data_type": "EXPENSE", "source_type": "DOCUMENT",
             "captured_at": "2026-11-05T10:00:00+07:00", "verification_status": "PENDING"},
            {"entry_id": "debt-1", "data_type": "DEBT", "source_type": "BANK_STATEMENT",
             "captured_at": "2026-11-05T10:00:00+07:00", "verification_status": "VERIFIED"},
            {"entry_id": "credit-1", "data_type": "CREDIT", "source_type": "CREDIT_BUREAU",
             "captured_at": "2026-11-05T10:00:00+07:00", "verification_status": "VERIFIED"},
        ]},
    }


def test_borrower_financial_contract_accepts_approved_shapes():
    value = BorrowerFinancialInformationContract.model_validate(financial_example())
    assert value.debt_data.items[0].outstanding_balance_satang == 500000
    zod_path = Path(__file__).resolve().parents[3] / "web" / "src" / "lib" / "contracts" / "borrower-financial.ts"
    zod_contract = zod_path.read_text(encoding="utf-8")
    for category in (
        "SALARY", "BUSINESS", "FREELANCE", "RENTAL", "INVESTMENT", "HOUSING", "UTILITIES",
        "FOOD", "TRANSPORT", "HEALTHCARE", "EDUCATION", "INSURANCE", "FAMILY_SUPPORT",
        "CREDIT_CARD", "PERSONAL_LOAN", "AUTO_LOAN", "MORTGAGE", "STUDENT_LOAN",
        "SELF_DECLARED", "CREDIT_BUREAU", "VERIFIED",
    ):
        assert category in zod_contract


def test_financial_contract_rejects_unknown_category_and_mismatched_provenance():
    invalid_category = financial_example()
    invalid_category["expense_data"]["items"][0]["category"] = "OTHER_EXPENSE"
    with pytest.raises(ValidationError):
        BorrowerFinancialInformationContract.model_validate(invalid_category)

    invalid_provenance = financial_example()
    invalid_provenance["source_metadata"]["items"].pop()
    with pytest.raises(ValidationError, match="source metadata must match"):
        BorrowerFinancialInformationContract.model_validate(invalid_provenance)


def test_financial_contract_rejects_duplicate_ids_and_naive_capture_time():
    duplicate = financial_example()
    duplicate["expense_data"]["items"][0]["entry_id"] = "income-1"
    with pytest.raises(ValidationError, match="unique across financial data"):
        BorrowerFinancialInformationContract.model_validate(duplicate)

    naive_time = financial_example()
    naive_time["source_metadata"]["items"][0]["captured_at"] = "2026-11-05T10:00:00"
    with pytest.raises(ValidationError):
        BorrowerFinancialInformationContract.model_validate(naive_time)


def test_v2_credit_contract_requires_bureau_features_for_nexus_prediction():
    value = financial_example()
    value["credit_data"] = {
        "schema_version": "borrower_credit.v2", "entry_id": "credit-1",
        "bureau_name": "THAI_CREDIT_BUREAU", "report_date": "2026-10-31",
        "credit_score": 720, "inquiry_count_12_months": 1,
        "delinquency_count_12_months": 0, "accounts_opened_past_24_months": 2,
        "bankcard_balance_satang": 200000, "bankcard_credit_limit_satang": 1000000,
        "revolving_balance_satang": 300000, "revolving_credit_limit_satang": 1200000,
    }
    contract = BorrowerFinancialInformationContract.model_validate(value)
    assert contract.credit_data.schema_version == "borrower_credit.v2"
    assert contract.credit_data.accounts_opened_past_24_months == 2

    del value["credit_data"]["revolving_credit_limit_satang"]
    with pytest.raises(ValidationError):
        BorrowerFinancialInformationContract.model_validate(value)


def test_schedule_inputs_and_snapshot_contracts():
    inputs = ScheduleInputsContract.model_validate({
        "schema_version": "repayment_schedule_inputs.v1", "principal_satang": 12000000,
        "term_months": 2, "first_due_date": "2026-12-05",
    })
    assert inputs.term_months == 2

    snapshot_doc = {
        "schema_version": "repayment_schedule_snapshot.v1", "installments": [
            {"installment_number": 1, "due_date": "2026-12-05", "opening_principal_satang": 12000000,
             "principal_due_satang": 6000000, "interest_due_satang": 100000},
            {"installment_number": 2, "due_date": "2027-01-05", "opening_principal_satang": 6000000,
             "principal_due_satang": 6000000, "interest_due_satang": 50000},
        ],
    }
    snapshot = ScheduleSnapshotContract.model_validate(snapshot_doc)
    assert len(snapshot.installments) == 2
    ScheduleVersionJsonContract.model_validate({
        "schedule_inputs": {"schema_version": "repayment_schedule_inputs.v1", "principal_satang": 12000000,
            "term_months": 2, "first_due_date": "2026-12-05"},
        "schedule_snapshot": snapshot_doc,
    })
    zod_path = Path(__file__).resolve().parents[3] / "web" / "src" / "lib" / "contracts" / "schedule.ts"
    zod_contract = zod_path.read_text(encoding="utf-8")
    for key in (
        "repayment_schedule_inputs.v1", "repayment_schedule_snapshot.v1", "principal_satang",
        "term_months", "first_due_date", "installment_number", "due_date",
        "opening_principal_satang", "principal_due_satang", "interest_due_satang",
    ):
        assert key in zod_contract


def test_schedule_contracts_reject_bad_dates_order_numbers_and_extra_keys():
    with pytest.raises(ValidationError):
        ScheduleInputsContract.model_validate({
            "schema_version": "repayment_schedule_inputs.v1", "principal_satang": 1000,
            "term_months": 1, "first_due_date": "2026-02-30",
        })

    bad_order = {
        "schema_version": "repayment_schedule_snapshot.v1",
        "installments": [
            {"installment_number": 2, "due_date": "2026-12-05", "opening_principal_satang": 100,
             "principal_due_satang": 50, "interest_due_satang": 1},
        ],
    }
    with pytest.raises(ValidationError, match="numbered consecutively"):
        ScheduleSnapshotContract.model_validate(bad_order)

    with pytest.raises(ValidationError, match="first installment due_date"):
        ScheduleVersionJsonContract.model_validate({
            "schedule_inputs": {"schema_version": "repayment_schedule_inputs.v1", "principal_satang": 100,
                "term_months": 1, "first_due_date": "2026-12-01"},
            "schedule_snapshot": {"schema_version": "repayment_schedule_snapshot.v1", "installments": [
                {"installment_number": 1, "due_date": "2026-12-02", "opening_principal_satang": 100,
                 "principal_due_satang": 100, "interest_due_satang": 1},
            ]},
        })

    extra = financial_example()
    extra["income_data"]["unexpected"] = True
    with pytest.raises(ValidationError):
        BorrowerFinancialInformationContract.model_validate(extra)
