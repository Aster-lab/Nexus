import { z } from "zod";

const categoryCode = z.string().trim().max(60).regex(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/);
const positiveSafeInteger = z.number().int().positive().safe();

export const EssentialNotificationPolicyValuesSchema = z.object({
  schema_version: z.literal("essential_notification_policy.v1"),
  categories: z.array(z.object({
    category_code: categoryCode,
    required_channels: z.array(z.enum(["IN_APP", "EMAIL"])).min(1),
  }).strict().superRefine((category, ctx) => {
    if (new Set(category.required_channels).size !== category.required_channels.length) {
      ctx.addIssue({ code: "custom", path: ["required_channels"], message: "required_channels values must be unique" });
    }
  })).min(1),
}).strict().superRefine((policy, ctx) => {
  const codes = policy.categories.map((category) => category.category_code);
  if (new Set(codes).size !== codes.length) {
    ctx.addIssue({ code: "custom", path: ["categories"], message: "category_code values must be unique" });
  }
});

export const LoanOfferPolicyValuesSchema = z.object({
  schema_version: z.literal("loan_offer_policy.v1"),
  min_principal_satang: positiveSafeInteger,
  max_principal_satang: positiveSafeInteger,
  allowed_term_months: z.array(positiveSafeInteger).min(1),
  offer_validity_days: positiveSafeInteger,
}).strict().superRefine((policy, ctx) => {
  if (policy.min_principal_satang !== 100000) {
    ctx.addIssue({ code: "custom", path: ["min_principal_satang"], message: "must equal approved minimum of 100000" });
  }
  if (policy.max_principal_satang !== 5000000) {
    ctx.addIssue({code: "custom" ,path: ["max_principal_satang"], message: "must equal approved maximum of 5000000"})
  }

  if (policy.min_principal_satang > policy.max_principal_satang){
    ctx.addIssue({code: "custom",path: ["min_principal_satang"], message: "must not exceed max_prinicipal_satang"})
  }
  const expectedTerms = [3,6,9,12,18,24];

  if (policy.allowed_term_months.length !== expectedTerms.length || !expectedTerms.every((term)=>policy.allowed_term_months.includes(term))) {
    ctx.addIssue({code: "custom", path: ["allowed_term_months"],message: "must contain exactly [3, 6, 9, 12, 18, 24]"})
  }
  if (new Set(policy.allowed_term_months).size !== policy.allowed_term_months.length) {
    ctx.addIssue({ code: "custom", path: ["allowed_term_months"], message: "values must be unique" });
  }

  if (policy.offer_validity_days !== 7) {
    ctx.addIssue({code: "custom", path: ["offer_validity_days"],message: "must equal approved period of 7 days"})
  }
});

export const LoanInterestPolicyValuesSchema = z.object({
  schema_version: z.literal("loan_interest_policy.v1"),
  annual_interest_rate_basis_points: positiveSafeInteger,
  calculation_method: z.literal("REDUCING_BALANCE"),
  calculation_frequency: z.literal("MONTHLY"),
  currency: z.literal("THB"),
}).strict();

export const PlatformFeePolicyValuesSchema = z.object({
  schema_version: z.literal("platform_fee_policy.v1"),
  fee_rate_basis_points: positiveSafeInteger,
  calculation_basis : z.literal("ORIGINAL_LOAN_PRINCIPAL"),
  calculation_timing : z.literal("ONCE_PER_LOAN"),
  wallet_deduction : z.literal(false),
  treatment: z.literal("CALCULATE_AND_DISPLAY_ONLY"),
  currency: z.literal("THB"),
}).strict();

export const RepaymentPolicyValuesSchema = z.object({
  schema_version: z.literal("repayment_policy.v1"),
  repayment_frequency: z.literal("MONTHLY"),
  repayment_schedule: z.literal("EQUAL_MONTHLY_INSTALLMENTS"),
  interest_calculation_method: z.literal("REDUCING_BALANCE"),
  annual_interest_rate_basis_points: z.literal(1200),
  repayment_components: z.array(z.enum(["PRINCIPAL", "INTEREST"])).length(2),
  currency: z.literal("THB"),
}).strict().superRefine((policy,ctx)=>{
  const expectedComponents = new Set(["PRINCIPAL", "INTEREST"]);
  if (new Set(policy.repayment_components).size !== 2 || !policy.repayment_components.every((component) =>  expectedComponents.has(component))) {
    ctx.addIssue({code: "custom", path: ["repayment_components"], message: "must contain exactly 'PRINCIPAL' and 'INTEREST'"});
  }
});

const PolicyValuesSchema = z.union([
  EssentialNotificationPolicyValuesSchema,
  LoanOfferPolicyValuesSchema,
  LoanInterestPolicyValuesSchema,
  PlatformFeePolicyValuesSchema,
  RepaymentPolicyValuesSchema
]);

export const PlatformPolicyContractSchema = z.object({
  policy_code: z.enum([
    "ESSENTIAL_NOTIFICATION_POLICY",
    "LOAN_OFFER_POLICY",
    "LOAN_INTEREST_POLICY",
    "PLATFORM_FEE_POLICY",
    "REPAYMENT_POLICY"]),
  policy_values: PolicyValuesSchema,
}).strict().superRefine((policy, ctx) => {
  const expectedSchemaVersions = {
    "ESSENTIAL_NOTIFICATION_POLICY": "essential_notification_policy.v1",
    "LOAN_OFFER_POLICY": "loan_offer_policy.v1",
    "LOAN_INTEREST_POLICY": "loan_interest_policy.v1",
    "PLATFORM_FEE_POLICY": "platform_fee_policy.v1",
    "REPAYMENT_POLICY": "repayment_policy.v1"
  } as const;

  const expectedSchemaVersion = expectedSchemaVersions[policy.policy_code];

  if (policy.policy_values.schema_version !== expectedSchemaVersion) {
    ctx.addIssue({ code: "custom", path: ["policy_values", "schema_version"], message: "schema version does not match policy_code" });
  }
});

export type PlatformPolicy = z.infer<typeof PlatformPolicyContractSchema>;

export function validateInterestRepaymentConsistency(
  interestPolicy : PlatformPolicy,
  repaymentPolicy : PlatformPolicy
) : void {
  if (interestPolicy.policy_code !== "LOAN_INTEREST_POLICY") {
    throw new Error("interestPolicy must have policy_code 'LOAN_INTEREST_POLICY'");
  }
  if (repaymentPolicy.policy_code !== "REPAYMENT_POLICY") {
    throw new Error("repaymentPolicy must have policy_code 'REPAYMENT_POLICY'");
  }

  const interestValues = interestPolicy.policy_values;
  const repaymentValues = repaymentPolicy.policy_values;

  if (interestValues.schema_version !== "loan_interest_policy.v1" || repaymentValues.schema_version !== "repayment_policy.v1") {
    throw new Error("Invalid schema versions for interestPolicy or repaymentPolicy");
  }

  if (interestValues.annual_interest_rate_basis_points !== repaymentValues.annual_interest_rate_basis_points) {
    throw new Error("annual_interest_rate_basis_points must match between interestPolicy and repaymentPolicy");
  }
}