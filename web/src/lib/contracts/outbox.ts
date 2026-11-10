import { z } from "zod";

const positiveSafeSatang = z.number().int().positive().safe();

const applicationSubmittedData = z.object({
  application_version_id: z.uuid(),
}).strict();
const investmentCommittedData = z.object({
  investment_id: z.uuid(),
  principal_satang: positiveSafeSatang,
}).strict();
const loanFundedData = z.object({
  repayment_schedule_id: z.uuid(),
}).strict();
const repaymentPostedData = z.object({
  repayment_id: z.uuid(),
  total_satang: positiveSafeSatang,
}).strict();
const withdrawalRequestedData = z.object({
  withdrawal_request_id: z.uuid(),
  amount_satang: positiveSafeSatang,
}).strict();
const documentScanRequestedData = z.object({
  document_id: z.uuid(),
}).strict();

const outboxEventData = z.union([
  applicationSubmittedData,
  investmentCommittedData,
  loanFundedData,
  repaymentPostedData,
  withdrawalRequestedData,
  documentScanRequestedData,
]);

export const OutboxPayloadSchema = z.object({
  schema_version: z.literal("nexus_outbox_payload.v1"),
  event_data: outboxEventData,
}).strict();

export const OutboxEventContractSchema = z.object({
  event_type: z.enum([
    "APPLICATION_SUBMITTED", "INVESTMENT_COMMITTED", "LOAN_FUNDED",
    "REPAYMENT_POSTED", "WITHDRAWAL_REQUESTED", "DOCUMENT_SCAN_REQUESTED",
  ]),
  payload: OutboxPayloadSchema,
}).strict().superRefine((event, ctx) => {
  const schemas = {
    APPLICATION_SUBMITTED: applicationSubmittedData,
    INVESTMENT_COMMITTED: investmentCommittedData,
    LOAN_FUNDED: loanFundedData,
    REPAYMENT_POSTED: repaymentPostedData,
    WITHDRAWAL_REQUESTED: withdrawalRequestedData,
    DOCUMENT_SCAN_REQUESTED: documentScanRequestedData,
  } as const;
  if (!schemas[event.event_type].safeParse(event.payload.event_data).success) {
    ctx.addIssue({ code: "custom", path: ["payload", "event_data"], message: "event_data shape does not match event_type" });
  }
});

export type OutboxEvent = z.infer<typeof OutboxEventContractSchema>;
export type OutboxPayload = z.infer<typeof OutboxPayloadSchema>;
