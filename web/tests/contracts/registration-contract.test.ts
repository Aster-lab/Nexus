import { describe, expect, it } from "vitest";
import { RegistrationRequestSchema } from "../../src/lib/contracts/registration";

const borrowerProfile = {
  legalName: "Example Borrower",
  phone: "+66 80 123 4567",
  address: {
    schema_version: "borrower_profile_address.v1",
    line1: "12 Example Road",
    line2: null,
    subdistrict: null,
    district: "Pathum Wan",
    province: "Bangkok",
    postal_code: "10330",
    country_code: "TH",
  },
};

describe("WP9.3 account registration contract", () => {
  it("accepts borrower and investor together without allowing an administrator role", () => {
    expect(RegistrationRequestSchema.safeParse({
      email: " New.User@Example.Test ",
      password: "a long secure password",
      roles: ["BORROWER", "INVESTOR"],
      borrowerProfile,
      investorProfile: { displayName: "New Investor" },
    }).success).toBe(true);
  });

  it("requires each selected role's profile and rejects unselected profile data", () => {
    expect(RegistrationRequestSchema.safeParse({
      email: "borrower@example.test",
      password: "a long secure password",
      roles: ["BORROWER"],
      borrowerProfile,
    }).success).toBe(true);
    expect(RegistrationRequestSchema.safeParse({
      email: "borrower@example.test",
      password: "a long secure password",
      roles: ["BORROWER", "INVESTOR"],
      borrowerProfile,
    }).success).toBe(false);
    expect(RegistrationRequestSchema.safeParse({
      email: "investor@example.test",
      password: "a long secure password",
      roles: ["INVESTOR"],
      borrowerProfile,
      investorProfile: { displayName: "Investor" },
    }).success).toBe(false);
  });

  it("rejects administrator roles, malformed email, and passwords outside 12–128 characters", () => {
    const valid = {
      email: "borrower@example.test",
      password: "a long secure password",
      roles: ["BORROWER"],
      borrowerProfile,
    };
    expect(RegistrationRequestSchema.safeParse({ ...valid, roles: ["ADMIN"] }).success).toBe(false);
    expect(RegistrationRequestSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
    expect(RegistrationRequestSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
    expect(RegistrationRequestSchema.safeParse({ ...valid, password: "x".repeat(129) }).success).toBe(false);
  });

  it("rejects unknown fields and normalizes the email address", () => {
    const result = RegistrationRequestSchema.safeParse({
      email: " New.User@Example.Test ",
      password: "a long secure password",
      roles: ["INVESTOR"],
      investorProfile: { displayName: "New Investor" },
      accountStatus: "ADMIN",
    });
    expect(result.success).toBe(false);
    const valid = RegistrationRequestSchema.safeParse({
      email: " New.User@Example.Test ",
      password: "a long secure password",
      roles: ["INVESTOR"],
      investorProfile: { displayName: "New Investor" },
    });
    expect(valid.success && valid.data.email).toBe("new.user@example.test");
  });

  it("enforces email and profile-name limits without restricting Thai or other Unicode names", () => {
    const base = { email: "investor@example.test", password: "a long secure password", roles: ["INVESTOR"], investorProfile: { displayName: "Somchai" } };
    expect(RegistrationRequestSchema.safeParse({ ...base, email: `${"a".repeat(246)}@test.com` }).success).toBe(false);
    expect(RegistrationRequestSchema.safeParse({ ...base, email: " user+tag@example.test " }).success).toBe(true);
    expect(RegistrationRequestSchema.safeParse({ ...base, investorProfile: { displayName: "A" } }).success).toBe(false);
    expect(RegistrationRequestSchema.safeParse({ ...base, investorProfile: { displayName: "นักลงทุนไทย" } }).success).toBe(true);
    expect(RegistrationRequestSchema.safeParse({
      email: "borrower@example.test", password: "a long secure password", roles: ["BORROWER"],
      borrowerProfile: { ...borrowerProfile, legalName: "A" },
    }).success).toBe(false);
    expect(RegistrationRequestSchema.safeParse({
      email: "borrower@example.test", password: "a long secure password", roles: ["BORROWER"],
      borrowerProfile: { ...borrowerProfile, legalName: "สมชาย ใจดี" },
    }).success).toBe(true);
  });
});
