
import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory Prisma mock shared by the seed function and tests.
const { mockPrisma, policies, versions } = vi.hoisted(() => {
  const policies: any[] = [];
  const versions: any[] = [];

  const tx = {
    platformPolicy: {
      findUnique: vi.fn(async ({ where }: any) => {
        return (
          policies.find(
            (policy) => policy.policyCode === where.policyCode
          ) ?? null
        );
      }),

      create: vi.fn(async ({ data }: any) => {
        const policy = {
          id: `policy-${policies.length + 1}`,
          ...data,
        };

        policies.push(policy);
        return policy;
      }),
    },

    policyVersion: {
      findUnique: vi.fn(async ({ where }: any) => {
        return (
          versions.find(
            (version) =>
              version.policyId === where.policyId_versionNumber.policyId &&
              version.versionNumber ===
                where.policyId_versionNumber.versionNumber
          ) ?? null
        );
      }),

      create: vi.fn(async ({ data }: any) => {
        const version = {
          id: `version-${versions.length + 1}`,
          ...data,
        };

        versions.push(version);
        return version;
      }),
    },
  };

  const mockPrisma = {
    $transaction: vi.fn(async (callback: any) => callback(tx)),
  };

  return { mockPrisma, policies, versions };
});

vi.mock("../../src/lib/prisma", () => ({
  prisma: mockPrisma,
}));

import { seedPlatformPolicies } from "../../prisma/seed/platform-policies.seed";

const expectedPolicyCodes = [
  "LOAN_OFFER_POLICY",
  "ESSENTIAL_NOTIFICATION_POLICY",
  "LOAN_INTEREST_POLICY",
  "PLATFORM_FEE_POLICY",
  "REPAYMENT_POLICY",
];

describe("seedPlatformPolicies", () => {
  beforeEach(() => {
    policies.length = 0;
    versions.length = 0;

    vi.clearAllMocks();
  });

  it("creates all five platform policy definitions", async () => {
    await seedPlatformPolicies();

    expect(policies).toHaveLength(5);

    expect(policies.map((policy) => policy.policyCode).sort()).toEqual(
      [...expectedPolicyCodes].sort()
    );
  });

  it("creates version 1 for every policy", async () => {
    await seedPlatformPolicies();

    expect(versions).toHaveLength(5);

    for (const version of versions) {
      expect(version.versionNumber).toBe(1);
    }
  });

  it("creates all initial policy versions as PROPOSED", async () => {
    await seedPlatformPolicies();

    for (const version of versions) {
      expect(version.status).toBe("PROPOSED");
      expect(version.approvedByUserId).toBeNull();
      expect(version.effectiveAt).toBeNull();
    }
  });

  it("does not create duplicate records when executed repeatedly", async () => {
    await seedPlatformPolicies();

    const originalPolicies = structuredClone(policies);
    const originalVersions = structuredClone(versions);

    await seedPlatformPolicies();

    expect(policies).toEqual(originalPolicies);
    expect(versions).toEqual(originalVersions);
  });

  it("rejects an existing version with conflicting policy values", async () => {
    await seedPlatformPolicies();

    const existingVersion = versions.find(
      (version) => version.policyId === policies.find(
        (policy) => policy.policyCode === "LOAN_INTEREST_POLICY"
      )?.id
    );

    expect(existingVersion).toBeDefined();

    // Simulate an unexpected change to the existing immutable version.
    existingVersion.policyValues.annual_interest_rate_basis_points = 1300;

    await expect(seedPlatformPolicies()).rejects.toThrow();
  });

  it("rejects an existing version that is not PROPOSED", async () => {
    await seedPlatformPolicies();

    versions[0].status = "ACTIVE";

    await expect(seedPlatformPolicies()).rejects.toThrow();
  });

  it("rejects an existing version that has an approver", async () => {
    await seedPlatformPolicies();

    versions[0].approvedByUserId = "unexpected-user-id";

    await expect(seedPlatformPolicies()).rejects.toThrow();
  });

  it("uses a Prisma transaction for database writes", async () => {
    await seedPlatformPolicies();

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
