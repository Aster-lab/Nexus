import {
  BorrowerFinancialInformationSchema,
  type BorrowerFinancialInformation,
} from "../contracts/borrower-financial";
import {
  NEXUS_RISK_FEATURE_SCHEMA_VERSION,
  NexusFeatureSnapshotContractSchema,
  type NexusRiskFeatures,
} from "../contracts/risk";

export class RiskFeatureBuildError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "RiskFeatureBuildError";
  }
}

const FREQUENCY_PER_YEAR = {
  WEEKLY: 52,
  BIWEEKLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  YEARLY: 1,
  ONE_TIME: 0,
} as const;

function annualizeVerifiedItems(
  items: Array<{ entry_id: string; amount_satang: number; frequency: keyof typeof FREQUENCY_PER_YEAR }>,
  provenance: Map<string, string>,
  type: "INCOME" | "DEBT",
): number {
  let annualSatang = 0;
  for (const item of items) {
    if (provenance.get(item.entry_id) !== `${type}:VERIFIED`) {
      throw new RiskFeatureBuildError(`VERIFIED_${type}_DATA_REQUIRED`);
    }
    annualSatang += item.amount_satang * FREQUENCY_PER_YEAR[item.frequency];
  }
  return annualSatang / 100;
}

export function buildNexusRiskFeatures(input: {
  requestedPrincipalSatang: bigint;
  termMonths: number;
  annualInterestRate: number;
  financialInformation: unknown;
  applicationVersionId: string;
  now?: Date;
}) {
  if (input.requestedPrincipalSatang <= 0n) throw new RiskFeatureBuildError("POSITIVE_REQUESTED_PRINCIPAL_REQUIRED");
  if (!Number.isSafeInteger(input.termMonths) || input.termMonths <= 0) throw new RiskFeatureBuildError("VALID_TERM_REQUIRED");
  if (!Number.isFinite(input.annualInterestRate) || input.annualInterestRate < 0 || input.annualInterestRate > 1) {
    throw new RiskFeatureBuildError("VALID_INTEREST_RATE_REQUIRED");
  }

  const parsed = BorrowerFinancialInformationSchema.safeParse(input.financialInformation);
  if (!parsed.success) throw new RiskFeatureBuildError("BORROWER_FINANCIAL_INFORMATION_INVALID");
  const info: BorrowerFinancialInformation = parsed.data;
  if (info.credit_data.schema_version !== "borrower_credit.v2") {
    throw new RiskFeatureBuildError("NEXUS_BUREAU_FEATURES_REQUIRED");
  }
  const now = input.now ?? new Date();
  if (new Date(`${info.credit_data.report_date}T00:00:00.000Z`) > now) {
    throw new RiskFeatureBuildError("CREDIT_REPORT_DATE_IN_FUTURE");
  }

  const provenance = new Map(info.source_metadata.items.map((item) => [
    item.entry_id,
    `${item.data_type}:${item.verification_status}`,
  ]));
  if (provenance.get(info.credit_data.entry_id) !== "CREDIT:VERIFIED" ||
      info.source_metadata.items.find((item) => item.entry_id === info.credit_data.entry_id)?.source_type !== "CREDIT_BUREAU") {
    throw new RiskFeatureBuildError("VERIFIED_CREDIT_BUREAU_REQUIRED");
  }

  const annualIncome = annualizeVerifiedItems(info.income_data.items, provenance, "INCOME");
  if (annualIncome <= 0) throw new RiskFeatureBuildError("POSITIVE_VERIFIED_ANNUAL_INCOME_REQUIRED");
  const annualDebtPayments = annualizeVerifiedItems(
    info.debt_data.items.map((item) => ({ ...item, amount_satang: item.payment_satang, frequency: item.payment_frequency })),
    provenance,
    "DEBT",
  );
  const loanAmount = Number(input.requestedPrincipalSatang) / 100;
  if (!Number.isSafeInteger(Number(input.requestedPrincipalSatang)) || !Number.isFinite(loanAmount)) {
    throw new RiskFeatureBuildError("REQUESTED_PRINCIPAL_OUT_OF_RANGE");
  }
  const credit = info.credit_data;
  const features: NexusRiskFeatures = {
    annual_income: annualIncome,
    dti: (annualDebtPayments / annualIncome) * 100,
    loan_amount: loanAmount,
    acc_open_past_24mths: credit.accounts_opened_past_24_months,
    bc_util: credit.bankcard_balance_satang / credit.bankcard_credit_limit_satang,
    lti: loanAmount / annualIncome,
    interest_burden: (loanAmount * input.annualInterestRate) / (annualIncome + 1),
    credit_score: credit.credit_score,
    int_rate: input.annualInterestRate,
    revol_util: credit.revolving_balance_satang / credit.revolving_credit_limit_satang,
    term_months: input.termMonths,
  };

  const metadata = {
    annual_income: "THB/year from verified recurring income",
    dti: "percent: annual verified debt payments / annual verified income",
    loan_amount: "THB",
    acc_open_past_24mths: "bureau account count, prior 24 months",
    bc_util: "bankcard balance / bankcard credit limit",
    lti: "THB loan amount / THB annual income",
    interest_burden: "(THB loan amount * annual rate) / (THB annual income + 1)",
    credit_score: `bureau-native score from ${credit.bureau_name}`,
    int_rate: "annual rate proportion",
    revol_util: "revolving balance / revolving credit limit",
    term_months: "months",
  };
  const sourceMapping = {
    annual_income: "BorrowerFinancialInformation.income_data; verified entries only; recurring amounts annualized",
    dti: "BorrowerFinancialInformation.debt_data.payment_satang and income_data; verified entries only",
    loan_amount: "ApplicationVersion.requestedPrincipalSatang / 100",
    acc_open_past_24mths: `verified credit bureau entry ${credit.entry_id}`,
    bc_util: `verified credit bureau entry ${credit.entry_id}: bankcard balance / credit limit`,
    lti: "requested principal / annualized verified income",
    interest_burden: "requested principal, active policy-derived rate, and annualized verified income",
    credit_score: `verified credit bureau entry ${credit.entry_id}`,
    int_rate: "active LOAN_INTEREST_POLICY annual_interest_rate_basis_points / 10000",
    revol_util: `verified credit bureau entry ${credit.entry_id}: revolving balance / credit limit`,
    term_months: "ApplicationVersion.requestedTermMonths",
  };
  const snapshot = NexusFeatureSnapshotContractSchema.safeParse({
    schema_version: NEXUS_RISK_FEATURE_SCHEMA_VERSION,
    feature_generation_version: "nexus-feature-builder.v2",
    source_application_version_id: input.applicationVersionId,
    created_at: now.toISOString(),
    feature_values: features,
    feature_units: metadata,
    source_mapping: sourceMapping,
  });
  if (!snapshot.success) throw new RiskFeatureBuildError("GENERATED_FEATURES_INVALID");
  return snapshot.data;
}
