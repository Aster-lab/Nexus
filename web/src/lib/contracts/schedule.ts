import { z } from "zod";

const safeSatang = z.number().int().nonnegative().safe();
const positiveSafeSatang = z.number().int().positive().safe();

export const ScheduleInputsSchema = z
  .object({
    schema_version: z.literal("repayment_schedule_inputs.v1"),
    principal_satang: positiveSafeSatang,
    term_months: z.number().int().positive().safe(),
    first_due_date: z.iso.date(),
  })
  .strict();

export const ScheduleInstallmentSchema = z
  .object({
    installment_number: z.number().int().positive().safe(),
    due_date: z.iso.date(),
    opening_principal_satang: safeSatang,
    principal_due_satang: safeSatang,
    interest_due_satang: safeSatang,
  })
  .strict();

export const ScheduleSnapshotSchema = z
  .object({
    schema_version: z.literal("repayment_schedule_snapshot.v1"),
    installments: z.array(ScheduleInstallmentSchema).min(1),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    snapshot.installments.forEach((item, index) => {
      if (item.installment_number !== index + 1) {
        ctx.addIssue({
          code: "custom",
          path: ["installments", index, "installment_number"],
          message: "installments must be ordered and numbered consecutively from 1",
        });
      }
      if (index > 0 && item.due_date <= snapshot.installments[index - 1].due_date) {
        ctx.addIssue({
          code: "custom",
          path: ["installments", index, "due_date"],
          message: "installment due dates must be strictly increasing",
        });
      }
    });
  });

export const ScheduleVersionJsonSchema = z.object({
  schedule_inputs: ScheduleInputsSchema,
  schedule_snapshot: ScheduleSnapshotSchema,
}).strict().superRefine((version, ctx) => {
  const installments = version.schedule_snapshot.installments;
  if (installments.length !== version.schedule_inputs.term_months) {
    ctx.addIssue({ code: "custom", path: ["schedule_snapshot", "installments"], message: "installment count must equal term_months" });
  }
  if (installments[0]?.due_date !== version.schedule_inputs.first_due_date) {
    ctx.addIssue({ code: "custom", path: ["schedule_snapshot", "installments", 0, "due_date"], message: "first installment due_date must match first_due_date" });
  }
});

export type ScheduleInputs = z.infer<typeof ScheduleInputsSchema>;
export type ScheduleSnapshot = z.infer<typeof ScheduleSnapshotSchema>;
export type ScheduleVersionJson = z.infer<typeof ScheduleVersionJsonSchema>;
