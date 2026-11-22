import { z } from "zod";

export const APPLICATION_SNAPSHOT_SCHEMA_VERSION = "application_snapshot.v1" as const;
export const BORROWER_COMPANY_TYPES = [
  "SOLE_PROPRIETORSHIP",
  "PARTNERSHIP",
  "PRIVATE_LIMITED_COMPANY",
  "PUBLIC_LIMITED_COMPANY",
  "COOPERATIVE",
  "OTHER",
] as const;

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
        company_name: nullableText.optional(),
        company_type: z.enum(BORROWER_COMPANY_TYPES).nullable().optional(),
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
  .strict()
  .superRefine((snapshot, context) => {
    const companyName = snapshot.employment.company_name?.trim() || null;
    const companyType = snapshot.employment.company_type ?? null;
    if (companyName && !companyType) {
      context.addIssue({ code: "custom", path: ["employment", "company_type"], message: "Choose the company type when a company name is provided." });
    }
    if (!companyName && companyType) {
      context.addIssue({ code: "custom", path: ["employment", "company_name"], message: "Enter the company name when choosing a company type." });
    }
  });

export type ApplicationSnapshot = z.infer<typeof ApplicationSnapshotSchema>;
