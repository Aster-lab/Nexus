import { z } from "zod";

const fieldCode = z.string().trim().regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);

const AuditFieldValueSchema = z.object({
  field_code: fieldCode,
  value: z.json(),
}).strict();

export const AuditValuesSchema = z.object({
  schema_version: z.literal("audit_values.v1"),
  fields: z.array(AuditFieldValueSchema).min(1),
}).strict().superRefine((audit, ctx) => {
  const codes = audit.fields.map((item) => item.field_code);
  if (new Set(codes).size !== codes.length) {
    ctx.addIssue({ code: "custom", path: ["fields"], message: "field_code values must be unique" });
  }
});

export const AuditLogValuesPairSchema = z.object({
  old_values: AuditValuesSchema.nullable(),
  new_values: AuditValuesSchema.nullable(),
}).strict().superRefine((pair, ctx) => {
  if (pair.old_values && pair.new_values) {
    const oldCodes = new Set(pair.old_values.fields.map((item) => item.field_code));
    const newCodes = new Set(pair.new_values.fields.map((item) => item.field_code));
    if (oldCodes.size !== newCodes.size || [...oldCodes].some((code) => !newCodes.has(code))) {
      ctx.addIssue({ code: "custom", message: "old_values and new_values must use the same field_code set" });
    }
  }
});

export const HistoryValuesPairSchema = z.object({
  old_value: AuditValuesSchema.nullable(),
  new_value: AuditValuesSchema.nullable(),
}).strict().superRefine((pair, ctx) => {
  if (pair.old_value && pair.new_value) {
    const oldCodes = new Set(pair.old_value.fields.map((item) => item.field_code));
    const newCodes = new Set(pair.new_value.fields.map((item) => item.field_code));
    if (oldCodes.size !== newCodes.size || [...oldCodes].some((code) => !newCodes.has(code))) {
      ctx.addIssue({ code: "custom", message: "old_value and new_value must use the same field_code set" });
    }
  }
});

export const DataCorrectionRequestSchema = z.object({
  schema_version: z.literal("data_correction_request.v1"),
  changes: z.array(z.object({
    field_code: fieldCode,
    proposed_value: z.json(),
  }).strict()).min(1),
}).strict().superRefine((request, ctx) => {
  const codes = request.changes.map((change) => change.field_code);
  if (new Set(codes).size !== codes.length) {
    ctx.addIssue({ code: "custom", path: ["changes"], message: "field_code values must be unique" });
  }
});

export type AuditValues = z.infer<typeof AuditValuesSchema>;
export type AuditLogValuesPair = z.infer<typeof AuditLogValuesPairSchema>;
export type HistoryValuesPair = z.infer<typeof HistoryValuesPairSchema>;
export type DataCorrectionRequest = z.infer<typeof DataCorrectionRequestSchema>;
