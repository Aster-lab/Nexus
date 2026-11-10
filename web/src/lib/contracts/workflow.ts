import { z } from "zod";

const scopeVersion = { schema_version: z.literal("account_restriction_scope.v1") };

export const AccountRestrictionScopeSchema = z.discriminatedUnion("scope_type", [
  z.object({ ...scopeVersion, scope_type: z.literal("ACCOUNT") }).strict(),
  z.object({ ...scopeVersion, scope_type: z.literal("ALL_WALLETS") }).strict(),
  z.object({
    ...scopeVersion,
    scope_type: z.literal("WALLET_IDS"),
    wallet_ids: z.array(z.uuid()).min(1),
  }).strict().superRefine((scope, ctx) => {
    if (new Set(scope.wallet_ids).size !== scope.wallet_ids.length) {
      ctx.addIssue({ code: "custom", path: ["wallet_ids"], message: "wallet_ids must be unique" });
    }
  }),
  z.object({ ...scopeVersion, scope_type: z.literal("ALL_LOANS") }).strict(),
  z.object({
    ...scopeVersion,
    scope_type: z.literal("LOAN_IDS"),
    loan_ids: z.array(z.uuid()).min(1),
  }).strict().superRefine((scope, ctx) => {
    if (new Set(scope.loan_ids).size !== scope.loan_ids.length) {
      ctx.addIssue({ code: "custom", path: ["loan_ids"], message: "loan_ids must be unique" });
    }
  }),
  z.object({ ...scopeVersion, scope_type: z.literal("ALL_APPLICATIONS") }).strict(),
  z.object({
    ...scopeVersion,
    scope_type: z.literal("APPLICATION_IDS"),
    application_ids: z.array(z.uuid()).min(1),
  }).strict().superRefine((scope, ctx) => {
    if (new Set(scope.application_ids).size !== scope.application_ids.length) {
      ctx.addIssue({ code: "custom", path: ["application_ids"], message: "application_ids must be unique" });
    }
  }),
]);

export const AccountRestrictionContractSchema = z.object({
  restriction_type: z.enum(["ACCOUNT_FREEZE", "WITHDRAWAL_BLOCK", "INVESTMENT_BLOCK", "APPLICATION_BLOCK"]),
  scope: AccountRestrictionScopeSchema,
}).strict().superRefine((restriction, ctx) => {
  const allowed = {
    ACCOUNT_FREEZE: ["ACCOUNT"],
    WITHDRAWAL_BLOCK: ["ALL_WALLETS", "WALLET_IDS"],
    INVESTMENT_BLOCK: ["ALL_LOANS", "LOAN_IDS"],
    APPLICATION_BLOCK: ["ALL_APPLICATIONS", "APPLICATION_IDS"],
  } as const;
  if (!(allowed[restriction.restriction_type] as readonly string[]).includes(restriction.scope.scope_type)) {
    ctx.addIssue({ code: "custom", path: ["scope", "scope_type"], message: "scope_type is not allowed for restriction_type" });
  }
});

const fieldCode = z.string().trim().regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);
const nonEmptyText = z.string().trim().min(1);

export const InformationRequestDetailsSchema = z.object({
  schema_version: z.literal("information_request_details.v1"),
  items: z.array(z.object({
    field_code: fieldCode,
    prompt: nonEmptyText,
    required: z.boolean(),
    response_type: z.enum(["TEXT", "NUMBER", "DATE", "DOCUMENT", "YES_NO"]),
  }).strict()).min(1),
}).strict().superRefine((details, ctx) => {
  const codes = details.items.map((item) => item.field_code);
  if (new Set(codes).size !== codes.length) {
    ctx.addIssue({ code: "custom", path: ["items"], message: "field_code values must be unique" });
  }
});

export type AccountRestriction = z.infer<typeof AccountRestrictionContractSchema>;
export type InformationRequestDetails = z.infer<typeof InformationRequestDetailsSchema>;
