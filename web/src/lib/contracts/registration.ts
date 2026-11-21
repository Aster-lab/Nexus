import { z } from "zod";
import { BorrowerProfileAddressSchema } from "./application";

const borrowerRegistrationProfileSchema = z.object({
  legalName: z.string().trim().min(2).max(150),
  phone: z.string().trim().max(30).transform((phone) => phone || null).nullable(),
  address: BorrowerProfileAddressSchema,
}).strict();

const investorRegistrationProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
}).strict();

export const RegistrationRequestSchema = z.object({
  email: z.string().trim().pipe(z.email().max(254)).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(128),
  roles: z.array(z.enum(["BORROWER", "INVESTOR"])).min(1).max(2),
  borrowerProfile: borrowerRegistrationProfileSchema.optional(),
  investorProfile: investorRegistrationProfileSchema.optional(),
}).strict().superRefine((registration, context) => {
  if (new Set(registration.roles).size !== registration.roles.length) {
    context.addIssue({ code: "custom", path: ["roles"], message: "Each role may be selected once." });
  }
  const borrowerSelected = registration.roles.includes("BORROWER");
  const investorSelected = registration.roles.includes("INVESTOR");
  if (borrowerSelected !== Boolean(registration.borrowerProfile)) {
    context.addIssue({ code: "custom", path: ["borrowerProfile"], message: "Borrower details must match the selected role." });
  }
  if (investorSelected !== Boolean(registration.investorProfile)) {
    context.addIssue({ code: "custom", path: ["investorProfile"], message: "Investor details must match the selected role." });
  }
});

export type RegistrationRequest = z.infer<typeof RegistrationRequestSchema>;
