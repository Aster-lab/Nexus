import { Prisma } from "../../generated/prisma/client";
import {
  PlatformPolicyContractSchema,
  validateInterestRepaymentConsistency,
  type PlatformPolicy,
} from "../contracts/platform-policy";
import { ApiError } from "../api/errors";
import { prisma } from "../prisma";

export type PolicyAdministrationAction = "APPROVE" | "ACTIVATE";

export async function administerPolicyVersion(input: {
  policyVersionId: string;
  actorUserId: string;
  action: PolicyAdministrationAction;
}) {
  return prisma.$transaction(async (tx) => {
    // Lock policy definitions in one stable order so concurrent activation of the
    // interest and repayment policies cannot each validate against stale peers.
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM platform_policies ORDER BY policy_code FOR UPDATE
    `;
    const version = await tx.policyVersion.findUnique({
      where: { id: input.policyVersionId },
      include: { policy: { select: { id: true, policyCode: true, name: true } } },
    });
    if (!version) throw new ApiError("NOT_FOUND", "Policy version not found.", 404);

    if (input.action === "APPROVE") {
      if (version.status !== "PROPOSED") {
        throw new ApiError("POLICY_STATE_CONFLICT", "Only a proposed policy version can be approved.", 409);
      }
      const changed = await tx.policyVersion.updateMany({
        where: { id: version.id, status: "PROPOSED" },
        data: { status: "APPROVED", approvedByUserId: input.actorUserId },
      });
      if (changed.count !== 1) throw new ApiError("POLICY_STATE_CONFLICT", "Policy state changed before approval.", 409);
      await tx.auditLog.create({ data: {
        actorUserId: input.actorUserId,
        action: "PLATFORM_POLICY_APPROVED",
        targetType: "POLICY_VERSION",
        targetId: version.id,
        reason: "Administrator approved a proposed platform policy version.",
        oldValues: { status: "PROPOSED" },
        newValues: { status: "APPROVED", policyCode: version.policy.policyCode, versionNumber: version.versionNumber },
        outcome: "SUCCESS",
      } });
      return { id: version.id, policyCode: version.policy.policyCode, versionNumber: version.versionNumber, status: "APPROVED" as const, approvedByUserId: input.actorUserId, effectiveAt: null };
    }

    if (version.status !== "APPROVED") {
      throw new ApiError("POLICY_STATE_CONFLICT", "Approve this policy version before activating it.", 409);
    }
    const parsed = PlatformPolicyContractSchema.safeParse({ policy_code: version.policy.policyCode, policy_values: version.policyValues });
    if (!parsed.success) throw new ApiError("POLICY_INVALID", "Policy values do not match the supported policy contract.", 422);
    await ensureInterestAndRepaymentConsistency(tx, parsed.data);

    const now = new Date();
    const current = await tx.policyVersion.findMany({
      where: { policyId: version.policyId, status: "ACTIVE" },
      select: { id: true, versionNumber: true },
    });
    for (const active of current) {
      await tx.policyVersion.update({ where: { id: active.id }, data: { status: "SUPERSEDED" } });
    }
    const changed = await tx.policyVersion.updateMany({
      where: { id: version.id, status: "APPROVED" },
      data: { status: "ACTIVE", effectiveAt: now },
    });
    if (changed.count !== 1) throw new ApiError("POLICY_STATE_CONFLICT", "Policy state changed before activation.", 409);
    await tx.auditLog.create({ data: {
      actorUserId: input.actorUserId,
      action: "PLATFORM_POLICY_ACTIVATED",
      targetType: "POLICY_VERSION",
      targetId: version.id,
      reason: "Administrator activated an approved platform policy version.",
      oldValues: { status: "APPROVED" },
      newValues: { status: "ACTIVE", policyCode: version.policy.policyCode, versionNumber: version.versionNumber, effectiveAt: now, supersededVersionIds: current.map((item) => item.id) },
      outcome: "SUCCESS",
    } });
    return { id: version.id, policyCode: version.policy.policyCode, versionNumber: version.versionNumber, status: "ACTIVE" as const, approvedByUserId: version.approvedByUserId, effectiveAt: now };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

async function ensureInterestAndRepaymentConsistency(
  tx: Prisma.TransactionClient,
  candidate: PlatformPolicy,
): Promise<void> {
  if (candidate.policy_code !== "LOAN_INTEREST_POLICY" && candidate.policy_code !== "REPAYMENT_POLICY") return;
  const counterpartCode = candidate.policy_code === "LOAN_INTEREST_POLICY" ? "REPAYMENT_POLICY" : "LOAN_INTEREST_POLICY";
  const counterpart = await tx.policyVersion.findFirst({
    where: { policy: { policyCode: counterpartCode }, status: "ACTIVE", OR: [{ effectiveAt: null }, { effectiveAt: { lte: new Date() } }] },
    orderBy: { versionNumber: "desc" },
    select: { policyValues: true },
  });
  if (!counterpart) {
    // The MVP repayment contract is fixed at 12%; do not activate a loan rate it cannot honor.
    const candidateRate = "annual_interest_rate_basis_points" in candidate.policy_values
      ? candidate.policy_values.annual_interest_rate_basis_points
      : null;
    if (candidateRate !== 1200) throw new ApiError("POLICY_MISMATCH", "Loan interest and repayment policies must both use 12% until a matching counterpart is active.", 409);
    return;
  }
  const counterpartPolicy = PlatformPolicyContractSchema.safeParse({ policy_code: counterpartCode, policy_values: counterpart.policyValues });
  if (!counterpartPolicy.success) throw new ApiError("POLICY_INVALID", "The active interest or repayment policy is invalid.", 409);
  const interest = candidate.policy_code === "LOAN_INTEREST_POLICY" ? candidate : counterpartPolicy.data;
  const repayment = candidate.policy_code === "REPAYMENT_POLICY" ? candidate : counterpartPolicy.data;
  try {
    validateInterestRepaymentConsistency(interest, repayment);
  } catch {
    throw new ApiError("POLICY_MISMATCH", "Loan interest and repayment policies must use the same annual interest rate.", 409);
  }
}
