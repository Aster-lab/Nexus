import { Prisma } from "../src/generated/prisma/client";
import { assertDemoDatabase } from "../src/lib/config/demo-environment";
import {
  PlatformPolicyContractSchema,
  validateInterestRepaymentConsistency,
} from "../src/lib/contracts/platform-policy";
import { prisma } from "../src/lib/prisma";

const DEMO_POLICY_CODES = [
  "LOAN_OFFER_POLICY",
  "LOAN_INTEREST_POLICY",
  "PLATFORM_FEE_POLICY",
  "REPAYMENT_POLICY",
] as const;

export interface DemoPolicyVersionState {
  id: string;
  policyCode: string;
  versionNumber: number;
  status: string;
  approvedByUserId: string | null;
  effectiveAt: Date | null;
}

export function buildDemoPolicyActivationPlan(
  versions: DemoPolicyVersionState[],
): DemoPolicyVersionState[] {
  const byCode = new Map<string, DemoPolicyVersionState[]>();
  for (const policyCode of DEMO_POLICY_CODES) byCode.set(policyCode, []);
  for (const version of versions) {
    const list = byCode.get(version.policyCode);
    if (!list) throw new Error(`Unexpected policy ${version.policyCode}; demo policy activation stopped.`);
    list.push(version);
  }

  const plan: DemoPolicyVersionState[] = [];
  for (const policyCode of DEMO_POLICY_CODES) {
    const policyVersions = byCode.get(policyCode) ?? [];
    if (policyVersions.length === 0) throw new Error(`Missing ${policyCode}; run demo setup/seed before activation.`);
    if (policyVersions.length !== 1 || policyVersions[0].versionNumber !== 1) {
      throw new Error(`${policyCode} must contain only its expected initial version 1 in the demo database.`);
    }
    const version = policyVersions[0];
    if (version.status === "ACTIVE") {
      if (!version.approvedByUserId || !version.effectiveAt) {
        throw new Error(`${policyCode} is ACTIVE without valid approval metadata.`);
      }
      continue;
    }
    if (version.status !== "PROPOSED" || version.approvedByUserId !== null || version.effectiveAt !== null) {
      throw new Error(`${policyCode} version 1 cannot be activated from its current governance state.`);
    }
    plan.push(version);
  }
  return plan;
}

export async function activateDemoLoanPolicies(): Promise<string[]> {
  const databaseUrl = assertDemoDatabase();

  const statuses = await prisma.$transaction(async (tx) => {
    const administrator = await tx.user.findFirst({
      where: {
        email: "demo-admin@nexus.local",
        accountStatus: "ACTIVE",
        deactivatedAt: null,
        roles: { some: { revokedAt: null, role: { code: "ADMIN" } } },
      },
      select: { id: true },
    });
    if (!administrator) throw new Error("An active demo administrator is required to approve demo lending policies.");

    const versions = await tx.policyVersion.findMany({
      where: { policy: { policyCode: { in: [...DEMO_POLICY_CODES] } } },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        approvedByUserId: true,
        effectiveAt: true,
        policy: { select: { policyCode: true } },
        policyValues: true,
      },
    });
    const versionsByCode = new Map(versions.map((version) => [version.policy.policyCode, version]));
    const offer = versionsByCode.get("LOAN_OFFER_POLICY");
    const interest = versionsByCode.get("LOAN_INTEREST_POLICY");
    const fee = versionsByCode.get("PLATFORM_FEE_POLICY");
    const repayment = versionsByCode.get("REPAYMENT_POLICY");
    const parsedOffer = PlatformPolicyContractSchema.safeParse({ policy_code: "LOAN_OFFER_POLICY", policy_values: offer?.policyValues });
    const parsedInterest = PlatformPolicyContractSchema.safeParse({ policy_code: "LOAN_INTEREST_POLICY", policy_values: interest?.policyValues });
    const parsedFee = PlatformPolicyContractSchema.safeParse({ policy_code: "PLATFORM_FEE_POLICY", policy_values: fee?.policyValues });
    const parsedRepayment = PlatformPolicyContractSchema.safeParse({ policy_code: "REPAYMENT_POLICY", policy_values: repayment?.policyValues });
    if (!parsedOffer.success || !parsedInterest.success || !parsedFee.success || !parsedRepayment.success) {
      throw new Error("Demo lending policies do not match the approved version-one contracts; no policy was changed.");
    }
    if (parsedFee.data.policy_values.schema_version !== "platform_fee_policy.v1" ||
      parsedFee.data.policy_values.fee_rate_basis_points !== 200) {
      throw new Error("Demo platform-fee policy differs from the approved initial demo terms; no policy was changed.");
    }
    validateInterestRepaymentConsistency(parsedInterest.data, parsedRepayment.data);

    const plan = buildDemoPolicyActivationPlan(versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      status: version.status,
      approvedByUserId: version.approvedByUserId,
      effectiveAt: version.effectiveAt,
      policyCode: version.policy.policyCode,
    })));

    const approvedAt = new Date();
    for (const version of plan) {
      const changed = await tx.policyVersion.updateMany({
        where: {
          id: version.id,
          status: "PROPOSED",
          approvedByUserId: null,
          effectiveAt: null,
        },
        data: {
          status: "ACTIVE",
          approvedByUserId: administrator.id,
          effectiveAt: approvedAt,
        },
      });
      if (changed.count !== 1) throw new Error(`${version.policyCode} changed during demo policy activation.`);
      await tx.auditLog.create({
        data: {
          actorUserId: administrator.id,
          action: "DEMO_POLICY_ACTIVATED",
          targetType: "POLICY_VERSION",
          targetId: version.id,
          reason: "Approved initial policy set for isolated NEXUS demo workflows.",
          oldValues: { status: "PROPOSED", versionNumber: version.versionNumber },
          newValues: { status: "ACTIVE", policyCode: version.policyCode, versionNumber: version.versionNumber, demoOnly: true },
          outcome: "SUCCESS",
        },
      });
    }
    return DEMO_POLICY_CODES.map((policyCode) => `${policyCode} v1: ACTIVE`);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return [`${databaseUrl.hostname}/${databaseUrl.pathname.replace(/^\//, "")}`, ...statuses];
}
