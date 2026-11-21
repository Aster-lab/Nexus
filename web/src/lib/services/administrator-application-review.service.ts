import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import { requireFinancialAdministrator } from "./financial-authorization.service";

export type AdministratorApplicationDecision = "APPROVED" | "REJECTED";

export class AdministratorApplicationReviewError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AdministratorApplicationReviewError";
  }
}

export async function decideLoanApplication(input: {
  applicationId: string;
  actorUserId: string;
  decision: AdministratorApplicationDecision;
  reason: string;
  notes?: string;
}) {
  if (!input.reason.trim() || input.reason.trim().length > 1000) {
    throw new AdministratorApplicationReviewError("INVALID_REASON", "A decision reason is required.");
  }
  return prisma.$transaction(async (tx) => {
    await requireFinancialAdministrator(tx, input.actorUserId);
    await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM loan_applications WHERE id = ${input.applicationId}::uuid FOR UPDATE`;
    const application = await tx.loanApplication.findUnique({
      where: { id: input.applicationId },
      select: { id: true, status: true, currentVersionId: true, submittedAt: true },
    });
    if (!application) throw new AdministratorApplicationReviewError("APPLICATION_NOT_FOUND", "Application not found.");
    if (!application.currentVersionId || !application.submittedAt || !["SUBMITTED", "UNDER_REVIEW"].includes(application.status)) {
      throw new AdministratorApplicationReviewError("APPLICATION_NOT_REVIEWABLE", "Only a submitted application can receive a final decision.");
    }
    const now = new Date();
    const nextStatus = input.decision;
    const review = await tx.applicationReview.create({
      data: {
        applicationId: application.id,
        applicationVersionId: application.currentVersionId,
        reviewerUserId: input.actorUserId,
        decision: input.decision,
        reason: input.reason.trim(),
        notes: input.notes?.trim() || null,
      },
      select: { id: true, decision: true, createdAt: true },
    });
    const changed = await tx.loanApplication.updateMany({
      where: { id: application.id, currentVersionId: application.currentVersionId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      data: { status: nextStatus, ...(nextStatus === "REJECTED" ? { closedAt: now } : {}) },
    });
    if (changed.count !== 1) throw new AdministratorApplicationReviewError("APPLICATION_NOT_REVIEWABLE", "Application state changed before the decision was saved.");
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: `APPLICATION_${input.decision}`,
        targetType: "LOAN_APPLICATION",
        targetId: application.id,
        reason: input.reason.trim(),
        oldValues: { status: application.status },
        newValues: { status: nextStatus, applicationReviewId: review.id, applicationVersionId: application.currentVersionId },
        outcome: "SUCCESS",
      },
    });
    return { applicationId: application.id, status: nextStatus, reviewId: review.id, decision: review.decision, decidedAt: review.createdAt };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}
