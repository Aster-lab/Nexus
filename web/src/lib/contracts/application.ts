import { z } from "zod";

export const APPLICATION_SNAPSHOT_SCHEMA_VERSION = "application_snapshot.v1" as const;

const nullableText = z.string().trim().nullable();
const nonEmptyText = z.string().trim().min(1);

export const ApplicationAddressSchema = z
  .object({
    line1: nonEmptyText,
    line2: nullableText,
    subdistrict: nullableText,
    district: nullableText,
    province: nullableText,
    postal_code: nullableText,
    country_code: nullableText,
  })
  .strict();

export const BorrowerProfileAddressSchema = ApplicationAddressSchema.extend({
  schema_version: z.literal("borrower_profile_address.v1"),
}).strict();

export const ApplicationSnapshotSchema = z
  .object({
    schema_version: z.literal(APPLICATION_SNAPSHOT_SCHEMA_VERSION),
    borrower: z
      .object({
        legal_name: nonEmptyText,
        phone: nullableText,
        address: ApplicationAddressSchema,
      })
      .strict(),
    employment: z
      .object({
        employment_status: nonEmptyText,
        employer_name: nullableText,
        occupation: nullableText,
        months_in_role: z.number().int().nonnegative().safe().nullable(),
      })
      .strict(),
    requested_loan: z
      .object({
        purpose: nonEmptyText,
        amount_satang: z.number().int().positive().safe(),
        term_months: z.number().int().positive().safe(),
      })
      .strict(),
  })
  .strict();

export type ApplicationSnapshot = z.infer<typeof ApplicationSnapshotSchema>;
