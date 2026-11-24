import {Prisma} from "../../src/generated/prisma/client";
import {prisma} from "../../src/lib/prisma";

import {
    PlatformPolicyContractSchema,
    validateInterestRepaymentConsistency,
    type PlatformPolicy
} from "../../src/lib/contracts/platform-policy";

const policyDefinitions = [
    {
        policyCode: "LOAN_OFFER_POLICY",
        name: "Loan offer policy",
        description: "Defines the permitted loan principal range,loan terms, and offer validity perod.",
        policyValues: {
            schema_version: "loan_offer_policy.v1",
            min_principal_satang : 100000,
            max_principal_satang : 5000000,
            allowed_term_months: [3,6,9,12,18,24],
            offer_validity_days: 7,
        }
    },
    {
        policyCode : "ESSENTIAL_NOTIFICATION_POLICY",
        name : "Essential Notification Policy",
        description : "Defines the required notification channels for essential platform events.",
        policyValues : {
            schema_version : "essential_notification_policy.v1",
            categories : [
                {category_code: "APPLICATION_SUBMITTED",required_channels: ["IN_APP"],},
                {category_code: "APPLICATION_STATUS_UPDATED",required_channels: ['IN_APP'],},
                {category_code : "LOAN_OFFER_RECEIVED",required_channels: ['IN_APP','EMAIL']},
                {category_code: "LOAN_OFFER_EXPIRING", required_channels: ["IN_APP","EMAIL"]},
                {category_code: "INVESTMENT_CONFIRMED",required_channels: ["IN_APP"],},
                {category_code: "LOAN_FULLY_FUNDED",required_channels: ["IN_APP", "EMAIL"],},
                {category_code: "REPAYMENT_DUE",required_channels: ["IN_APP", "EMAIL"],},
                {category_code: "REPAYMENT_RECORDED",required_channels: ["IN_APP"],},
                {category_code: "INVESTOR_DISTRIBUTION_RECORDED",required_channels: ["IN_APP"],},
            ]
        },
    },
    {
        policyCode: "LOAN_INTEREST_POLICY",
        name: "Loan Interest Policy",
        description:"Defines the annual interest rate and interest calculation method for loans.",
        policyValues: {
            schema_version: "loan_interest_policy.v1",
            annual_interest_rate_basis_points: 1200,
            calculation_method: "REDUCING_BALANCE",
            calculation_frequency: "MONTHLY",
            currency: "THB",
            },
    },
    {
        policyCode: "PLATFORM_FEE_POLICY",
        name: "Platform Fee Policy",
        description:"Defines the platform fee calculation and display rules for the MVP.",
        policyValues: {
            schema_version: "platform_fee_policy.v1",
            fee_rate_basis_points: 200,
            calculation_basis: "ORIGINAL_LOAN_PRINCIPAL",
            calculation_timing: "ONCE_PER_LOAN",
            wallet_deduction: false,
            treatment: "CALCULATE_AND_DISPLAY_ONLY",
            currency: "THB",
            },
    },
    {
        policyCode: "REPAYMENT_POLICY",
        name: "Repayment Policy",
        description:"Defines the monthly repayment schedule and the principal and interest components.",
        policyValues: {
            schema_version: "repayment_policy.v1",
            repayment_frequency: "MONTHLY",
            repayment_schedule: "EQUAL_MONTHLY_INSTALLMENTS",
            interest_calculation_method: "REDUCING_BALANCE",
            annual_interest_rate_basis_points: 1200,
            repayment_components: ["PRINCIPAL", "INTEREST"],
            currency: "THB",
            },
    },
] satisfies {
policyCode: string;
name: string;
description: string;
policyValues: Record<string, unknown>;
}[];

const INITIAL_VERSION_NUMBER = 1;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) =>
      a.localeCompare(b),
    );

    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? String(value);
}

function validateInitialPolicies(): PlatformPolicy[] {
  const validatedPolicies = policyDefinitions.map((definition) =>
    PlatformPolicyContractSchema.parse({
      policy_code: definition.policyCode,
      policy_values: definition.policyValues,
    }),
  );

  const interestPolicy = validatedPolicies.find(
    (policy) => policy.policy_code === "LOAN_INTEREST_POLICY",
  );

  const repaymentPolicy = validatedPolicies.find(
    (policy) => policy.policy_code === "REPAYMENT_POLICY",
  );

  if (
    !interestPolicy || !repaymentPolicy) {
    throw new Error(
      "Initial policy configuration is missing the loan interest or repayment policy.",
    );
  }

  validateInterestRepaymentConsistency(
    interestPolicy,
    repaymentPolicy,
  );

  return validatedPolicies;
}

export async function seedPlatformPolicies(): Promise<void> {
  console.log("Validating initial platform policies...");

  const validatedPolicies = validateInitialPolicies();

  console.log("Initial platform policy validation passed.");
  console.log("Seeding platform policies...");

  await prisma.$transaction(async (tx) => {
    for (const definition of policyDefinitions) {
      const validatedPolicy = validatedPolicies.find(
        (policy) => policy.policy_code === definition.policyCode,
      );

      if (!validatedPolicy) {
        throw new Error(
          `Validated policy ${definition.policyCode} could not be found.`,
        );
      }

      const expectedValues = validatedPolicy.policy_values;

      const existingPolicy = await tx.platformPolicy.findUnique({
        where: {
          policyCode: definition.policyCode,
        },
      });

      const policy =
        existingPolicy ??
        (await tx.platformPolicy.create({
          data: {
            policyCode: definition.policyCode,
            name: definition.name,
            description: definition.description,
          },
        }));

      const existingVersion = await tx.policyVersion.findUnique({
        where: {
          policyId_versionNumber: {
            policyId: policy.id,
            versionNumber: INITIAL_VERSION_NUMBER,
          },
        },
      });

      if (existingVersion) {
        const valuesMatch =
          canonicalJson(existingVersion.policyValues) ===
          canonicalJson(expectedValues);

        const governanceStateMatches =
          existingVersion.status === "PROPOSED" &&
          existingVersion.approvedByUserId === null &&
          existingVersion.effectiveAt === null;

        if (!valuesMatch || !governanceStateMatches) {
          throw new Error(
            [
              `Existing version 1 conflicts with the approved initial configuration for ${definition.policyCode}.`,
              `Values match: ${valuesMatch}.`,
              `Governance state matches: ${governanceStateMatches}.`,
              "No existing policy version was overwritten.",
            ].join(" "),
          );
        }

        console.log(
          `Policy ${definition.policyCode}: matching version 1 already exists; preserving it.`,
        );

        continue;
      }

      await tx.policyVersion.create({
        data: {
          policyId: policy.id,
          versionNumber: INITIAL_VERSION_NUMBER,
          policyValues: expectedValues as Prisma.InputJsonValue,
          status: "PROPOSED",
          approvedByUserId: null,
          effectiveAt: null,
        },
      });

      console.log(
        `Policy ${definition.policyCode}: created initial PROPOSED version.`,
      );
    }
  });

  console.log("Platform policies seeded successfully.");
}