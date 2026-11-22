import { z } from "zod";
import { BorrowerProfileAddressSchema } from "./application";
import { BorrowerRegistrationProfileSchema, InvestorRegistrationProfileSchema } from "./registration";

const borrowerEnrollmentProfileSchema = BorrowerRegistrationProfileSchema.extend({
  address: BorrowerProfileAddressSchema.extend({
    subdistrict: z.string().trim().min(1),
    district: z.string().trim().min(1),
    province: z.string().trim().min(1),
    postal_code: z.string().trim().regex(/^\d{5}$/),
    country_code: z.literal("TH"),
  }),
});

export const SelfServiceRoleEnrollmentSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("BORROWER"), profile: borrowerEnrollmentProfileSchema }).strict(),
  z.object({ role: z.literal("INVESTOR"), profile: InvestorRegistrationProfileSchema }).strict(),
]);

export type SelfServiceRoleEnrollment = z.infer<typeof SelfServiceRoleEnrollmentSchema>;
