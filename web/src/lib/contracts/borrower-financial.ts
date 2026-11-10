import { z } from "zod";

export const FINANCIAL_FREQUENCIES = [
  "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "ONE_TIME",
] as const;
export const INCOME_CATEGORIES = [
  "SALARY", "BUSINESS", "FREELANCE", "RENTAL", "INVESTMENT", "OTHER",
] as const;
export const EXPENSE_CATEGORIES = [
  "HOUSING", "UTILITIES", "FOOD", "TRANSPORT", "HEALTHCARE", "EDUCATION",
  "INSURANCE", "FAMILY_SUPPORT", "OTHER",
] as const;
export const DEBT_CATEGORIES = [
  "CREDIT_CARD", "PERSONAL_LOAN", "AUTO_LOAN", "MORTGAGE", "STUDENT_LOAN", "OTHER",
] as const;

const nonEmptyText = z.string().trim().min(1);
const safeSatang = z.number().int().nonnegative().safe();
const positiveSafeSatang = z.number().int().positive().safe();
const frequency = z.enum(FINANCIAL_FREQUENCIES);

export const IncomeDataSchema = z.object({
  schema_version: z.literal("borrower_income.v1"),
  items: z.array(z.object({
    entry_id: nonEmptyText,
    category: z.enum(INCOME_CATEGORIES),
    amount_satang: positiveSafeSatang,
    frequency,
  }).strict()),
}).strict();

export const ExpenseDataSchema = z.object({
  schema_version: z.literal("borrower_expenses.v1"),
  items: z.array(z.object({
    entry_id: nonEmptyText,
    category: z.enum(EXPENSE_CATEGORIES),
    amount_satang: positiveSafeSatang,
    frequency,
  }).strict()),
}).strict();

export const DebtDataSchema = z.object({
  schema_version: z.literal("borrower_debts.v1"),
  items: z.array(z.object({
    entry_id: nonEmptyText,
    category: z.enum(DEBT_CATEGORIES),
    outstanding_balance_satang: safeSatang,
    payment_satang: safeSatang,
    payment_frequency: frequency,
  }).strict()),
}).strict();

export const CreditDataSchema = z.object({
  schema_version: z.literal("borrower_credit.v1"),
  entry_id: nonEmptyText,
  bureau_name: nonEmptyText,
  report_date: z.iso.date(),
  credit_score: z.number().int().nonnegative().safe().nullable(),
  inquiry_count_12_months: z.number().int().nonnegative().safe(),
  delinquency_count_12_months: z.number().int().nonnegative().safe(),
}).strict();

const SourceMetadataSchema = z.object({
  schema_version: z.literal("borrower_financial_sources.v1"),
  items: z.array(z.object({
    entry_id: nonEmptyText,
    data_type: z.enum(["INCOME", "EXPENSE", "DEBT", "CREDIT"]),
    source_type: z.enum(["SELF_DECLARED", "DOCUMENT", "BANK_STATEMENT", "CREDIT_BUREAU", "OTHER"]),
    captured_at: z.iso.datetime({ offset: true }),
    verification_status: z.enum(["SELF_REPORTED", "PENDING", "VERIFIED", "REJECTED"]),
  }).strict()),
}).strict();

export const BorrowerFinancialInformationSchema = z.object({
  income_data: IncomeDataSchema,
  expense_data: ExpenseDataSchema,
  debt_data: DebtDataSchema,
  credit_data: CreditDataSchema,
  source_metadata: SourceMetadataSchema,
}).strict().superRefine((data, ctx) => {
  const entries = new Map<string, string>();
  const groups = [
    [data.income_data.items, "INCOME"],
    [data.expense_data.items, "EXPENSE"],
    [data.debt_data.items, "DEBT"],
    [[data.credit_data], "CREDIT"],
  ] as const;

  for (const [items, dataType] of groups) {
    for (const item of items) {
      if (entries.has(item.entry_id)) {
        ctx.addIssue({ code: "custom", path: ["source_metadata"], message: "entry_id values must be unique across financial data" });
      }
      entries.set(item.entry_id, dataType);
    }
  }

  const provenance = new Map<string, string>();
  data.source_metadata.items.forEach((item, index) => {
    if (provenance.has(item.entry_id)) {
      ctx.addIssue({ code: "custom", path: ["source_metadata", "items", index, "entry_id"], message: "source metadata must contain at most one record per entry_id" });
    }
    provenance.set(item.entry_id, item.data_type);
  });

  if (entries.size !== provenance.size || [...entries].some(([entryId, dataType]) => provenance.get(entryId) !== dataType)) {
    ctx.addIssue({ code: "custom", path: ["source_metadata"], message: "source metadata must match each financial entry_id and data_type exactly" });
  }
});

export type BorrowerFinancialInformation = z.infer<typeof BorrowerFinancialInformationSchema>;
