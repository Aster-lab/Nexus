
import { describe, expect, it } from "vitest";
import { BorrowerFinancialInformationSchema } from "../../src/lib/contracts/borrower-financial";
import { buildNexusRiskFeatures } from "../../src/lib/services/risk-feature-builder";

const financialInformation = {
  income_data: {
    schema_version: "borrower_income.v1",
    items: [{ entry_id: "income-1", category: "SALARY", amount_satang: 5_000_000, frequency: "MONTHLY" }],
  },
  expense_data: { schema_version: "borrower_expenses.v1", items: [] },
  debt_data: {
    schema_version: "borrower_debts.v1",
    items: [{ entry_id: "debt-1", category: "CREDIT_CARD", outstanding_balance_satang: 2_000_000, payment_satang: 500_000, payment_frequency: "MONTHLY" }],
  },
  credit_data: {
    schema_version: "borrower_credit.v2",
    entry_id: "credit-1",
    bureau_name: "THAI_CREDIT_BUREAU",
    report_date: "2026-11-01",
    credit_score: 720,
    inquiry_count_12_months: 1,
    delinquency_count_12_months: 0,
    accounts_opened_past_24_months: 2,
    bankcard_balance_satang: 2_000_000,
    bankcard_credit_limit_satang: 10_000_000,
    revolving_balance_satang: 3_000_000,
    revolving_credit_limit_satang: 12_000_000,
  },
  source_metadata: {
    schema_version: "borrower_financial_sources.v1",
    items: [
      { entry_id: "income-1", data_type: "INCOME", source_type: "DOCUMENT", captured_at: "2026-11-21T10:00:00+07:00", verification_status: "VERIFIED" },
      { entry_id: "debt-1", data_type: "DEBT", source_type: "DOCUMENT", captured_at: "2026-11-21T10:00:00+07:00", verification_status: "VERIFIED" },
      { entry_id: "credit-1", data_type: "CREDIT", source_type: "CREDIT_BUREAU", captured_at: "2026-11-21T10:00:00+07:00", verification_status: "VERIFIED" },
    ],
  },
};

describe("NEXUS prediction feature inputs", () => {
  it("accepts the expanded versioned bureau fields", () => {
    expect(BorrowerFinancialInformationSchema.safeParse(financialInformation).success).toBe(true);
  });

  it("rejects incomplete bureau limits and prevents fabricated utilization", () => {
    const incomplete = structuredClone(financialInformation);
    delete (incomplete.credit_data as { bankcard_credit_limit_satang?: number }).bankcard_credit_limit_satang;
    expect(BorrowerFinancialInformationSchema.safeParse(incomplete).success).toBe(false);
  });

  it("requires verified bureau provenance before generating model features", () => {
    const unverified = structuredClone(financialInformation);
    unverified.source_metadata.items[2].verification_status = "SELF_REPORTED";
    expect(() => buildNexusRiskFeatures({
      requestedPrincipalSatang: 10_000_000n,
      termMonths: 12,
      annualInterestRate: 0.12,
      financialInformation: unverified,
      applicationVersionId: "123e4567-e89b-12d3-a456-426614174000",
      now: new Date("2026-11-21T10:00:00.000Z"),
    })).toThrow("VERIFIED_CREDIT_BUREAU_REQUIRED");
  });

  it("derives ratios and monetary features from persisted satang using THB units", () => {
    const snapshot = buildNexusRiskFeatures({
      requestedPrincipalSatang: 10_000_000n,
      termMonths: 12,
      annualInterestRate: 0.12,
      financialInformation,
      applicationVersionId: "123e4567-e89b-12d3-a456-426614174000",
      now: new Date("2026-11-21T10:00:00.000Z"),
    });
    expect(snapshot.schema_version).toBe("nexus_risk_features.v2");
    expect(snapshot.feature_values.annual_income).toBe(600_000);
    expect(snapshot.feature_values.loan_amount).toBe(100_000);
    expect(snapshot.feature_values.dti).toBe(10);
    expect(snapshot.feature_values.bc_util).toBe(0.2);
    expect(snapshot.feature_values.revol_util).toBe(0.25);
    expect(snapshot.feature_values.credit_score).toBe(720);
    expect(snapshot.feature_units.annual_income).toBe("THB/year");
    expect(snapshot.feature_units.loan_amount).toBe("THB");
    expect(snapshot.source_application_version_id).toBe("123e4567-e89b-12d3-a456-426614174000");
  });

  it("does not treat one-time income as recurring annual income", () => {
    const oneTime = structuredClone(financialInformation);
    oneTime.income_data.items[0].frequency = "ONE_TIME";
    expect(() => buildNexusRiskFeatures({
      requestedPrincipalSatang: 10_000_000n,
      termMonths: 12,
      annualInterestRate: 0.12,
      financialInformation: oneTime,
      applicationVersionId: "123e4567-e89b-12d3-a456-426614174000",
    })).toThrow("POSITIVE_VERIFIED_ANNUAL_INCOME_REQUIRED");
  });
});
