import { z } from "zod";

const positiveSafeInteger = z.number().int().positive().safe();
const safeInteger = z.number().int().nonnegative().safe();

const ledgerTransactionResponse = z.object({
  schema_version: z.literal("idempotency_response.v1"),
  ledger_transaction_id: z.uuid(),
  status: z.enum(["DRAFT", "POSTED", "REVERSED"]),
}).strict();
const investmentContributionResponse = z.object({
  schema_version: z.literal("idempotency_response.v1"),
  contribution_id: z.uuid(),
  investment_id: z.uuid(),
  amount_satang: positiveSafeInteger,
}).strict();
const investorPayoutResponse = z.object({
  schema_version: z.literal("idempotency_response.v1"),
  investor_payout_id: z.uuid(),
  status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]),
  principal_satang: safeInteger,
  interest_satang: safeInteger,
}).strict();
const withdrawalRequestResponse = z.object({
  schema_version: z.literal("idempotency_response.v1"),
  withdrawal_request_id: z.uuid(),
  status: z.enum(["REQUESTED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"]),
  amount_satang: positiveSafeInteger,
}).strict();

const responseSnapshot = z.union([
  ledgerTransactionResponse,
  investmentContributionResponse,
  investorPayoutResponse,
  withdrawalRequestResponse,
]);

export const IdempotencyResponseSnapshotSchema = z.object({
  operation_type: z.enum([
    "CREATE_LEDGER_TRANSACTION", "CREATE_INVESTMENT_CONTRIBUTION",
    "CREATE_INVESTOR_PAYOUT", "CREATE_WITHDRAWAL_REQUEST",
  ]),
  response_snapshot: responseSnapshot.nullable(),
}).strict().superRefine((record, ctx) => {
  if (record.response_snapshot === null) return;
  const schemas = {
    CREATE_LEDGER_TRANSACTION: ledgerTransactionResponse,
    CREATE_INVESTMENT_CONTRIBUTION: investmentContributionResponse,
    CREATE_INVESTOR_PAYOUT: investorPayoutResponse,
    CREATE_WITHDRAWAL_REQUEST: withdrawalRequestResponse,
  } as const;
  if (!schemas[record.operation_type].safeParse(record.response_snapshot).success) {
    ctx.addIssue({ code: "custom", path: ["response_snapshot"], message: "response snapshot shape does not match operation_type" });
  }
});

export type IdempotencyResponseSnapshot = z.infer<typeof IdempotencyResponseSnapshotSchema>;
