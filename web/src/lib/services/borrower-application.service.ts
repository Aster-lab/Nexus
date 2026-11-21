import { Prisma } from "../../generated/prisma/client";
import type { ApplicationSnapshot } from "../contracts/application";
import { LoanOfferPolicyValuesSchema } from "../contracts/platform-policy";
import { prisma } from "../prisma";

type TransactionClient = Prisma.TransactionClient;

export class BorrowerApplicationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "BorrowerApplicationError";
  }
}

function fail(code: string): never {
  throw new BorrowerApplicationError(code);
}

async function lockApplication(tx: TransactionClient, applicationId: string): Promise<void> {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM loan_applications WHERE id = ${applicationId}::uuid FOR UPDATE
  `;
}

async function validateSnapshotAgainstActivePolicy(
  tx: TransactionClient,
  snapshot: ApplicationSnapshot,
): Promise<void> {
  const now = new Date();
  const policy = await tx.platformPolicy.findUnique({
    where: { policyCode: "LOAN_OFFER_POLICY" },
    include: {
      versions: {
        where: {
          status: "ACTIVE",
          OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }],
        },
        select: { policyValues: true },
      },
    },
  });
  const activeVersion = policy?.versions[0];
  if (!activeVersion) fail("APPLICATION_POLICY_UNAVAILABLE");

  const parsedPolicy = LoanOfferPolicyValuesSchema.safeParse(activeVersion.policyValues);
  if (!parsedPolicy.success) fail("APPLICATION_POLICY_UNAVAILABLE");
  const requested = snapshot.requested_loan;
  if (
    requested.amount_satang < parsedPolicy.data.min_principal_satang ||
    requested.amount_satang > parsedPolicy.data.max_principal_satang ||
    !parsedPolicy.data.allowed_term_months.includes(requested.term_months)
  ) {
    fail("APPLICATION_POLICY_VIOLATION");
  }
}

function applicationResult<T extends {
  id: string;
  borrowerProfileId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  closedAt: Date | null;
  financialReviews: Array<{ id: string; decision: string; reason: string; createdAt: Date }>;
  informationRequests: Array<{ id: string; requestDetails: Prisma.JsonValue; status: string; createdAt: Date }>;
  currentVersion: { id: string; versionNumber: number; requestedPrincipalSatang: bigint; requestedTermMonths: number; submittedData: Prisma.JsonValue } | null;
}>(application: T) {
  return {
    id: application.id,
    borrowerProfileId: application.borrowerProfileId,
    status: application.status,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    submittedAt: application.submittedAt,
    closedAt: application.closedAt,
    permissions: {
      canEdit: application.status === "DRAFT",
      canSubmit: application.status === "DRAFT" && application.currentVersion !== null,
    },
    financialReviews: application.financialReviews,
    informationRequests: application.informationRequests,
    currentVersion: application.currentVersion ? {
      id: application.currentVersion.id,
      versionNumber: application.currentVersion.versionNumber,
      requestedPrincipalSatang: application.currentVersion.requestedPrincipalSatang.toString(),
      requestedTermMonths: application.currentVersion.requestedTermMonths,
      submittedData: application.currentVersion.submittedData,
    } : null,
  };
}

const applicationSelect = {
  id: true,
  borrowerProfileId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
  closedAt: true,
  financialReviews: { select: { id: true, decision: true, reason: true, createdAt: true }, orderBy: { createdAt: "desc" } },
  informationRequests: { select: { id: true, requestDetails: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } },
  currentVersion: {
    select: {
      id: true,
      versionNumber: true,
      requestedPrincipalSatang: true,
      requestedTermMonths: true,
      submittedData: true,
    },
  },
} satisfies Prisma.LoanApplicationSelect;

export async function createBorrowerApplication(input: {
  actorUserId: string;
  borrowerProfileId: string;
  snapshot: ApplicationSnapshot;
}) {
  return prisma.$transaction(async (tx) => {
    const profile = await tx.borrowerProfile.findUnique({
      where: { id: input.borrowerProfileId },
      select: { userId: true },
    });
    if (!profile || profile.userId !== input.actorUserId) fail("APPLICATION_NOT_FOUND");
    await validateSnapshotAgainstActivePolicy(tx, input.snapshot);

    const application = await tx.loanApplication.create({
      data: { borrowerProfileId: input.borrowerProfileId, status: "DRAFT" },
      select: { id: true, borrowerProfileId: true, status: true, submittedAt: true },
    });
    const version = await tx.applicationVersion.create({
      data: {
        applicationId: application.id,
        versionNumber: 1,
        submittedData: input.snapshot as unknown as Prisma.InputJsonValue,
        requestedPrincipalSatang: BigInt(input.snapshot.requested_loan.amount_satang),
        requestedTermMonths: input.snapshot.requested_loan.term_months,
        createdByUserId: input.actorUserId,
      },
      select: { id: true },
    });
    return applicationResult(await tx.loanApplication.update({
      where: { id: application.id },
      data: { currentVersionId: version.id },
      select: applicationSelect,
    }));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateBorrowerDraftApplication(input: {
  actorUserId: string;
  borrowerProfileId: string;
  applicationId: string;
  snapshot: ApplicationSnapshot;
}) {
  return prisma.$transaction(async (tx) => {
    await lockApplication(tx, input.applicationId);
    const application = await tx.loanApplication.findUnique({
      where: { id: input.applicationId },
      select: {
        borrowerProfileId: true,
        status: true,
        versions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 },
      },
    });
    if (!application || application.borrowerProfileId !== input.borrowerProfileId) {
      fail("APPLICATION_NOT_FOUND");
    }
    if (application.status !== "DRAFT") fail("APPLICATION_NOT_EDITABLE");
    await validateSnapshotAgainstActivePolicy(tx, input.snapshot);

    const version = await tx.applicationVersion.create({
      data: {
        applicationId: input.applicationId,
        versionNumber: (application.versions[0]?.versionNumber ?? 0) + 1,
        submittedData: input.snapshot as unknown as Prisma.InputJsonValue,
        requestedPrincipalSatang: BigInt(input.snapshot.requested_loan.amount_satang),
        requestedTermMonths: input.snapshot.requested_loan.term_months,
        createdByUserId: input.actorUserId,
      },
      select: { id: true },
    });
    return applicationResult(await tx.loanApplication.update({
      where: { id: input.applicationId },
      data: { currentVersionId: version.id },
      select: applicationSelect,
    }));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function submitBorrowerApplication(input: {
  borrowerProfileId: string;
  applicationId: string;
}) {
  return prisma.$transaction(async (tx) => {
    await lockApplication(tx, input.applicationId);
    const application = await tx.loanApplication.findUnique({
      where: { id: input.applicationId },
      select: { borrowerProfileId: true, status: true, currentVersionId: true },
    });
    if (!application || application.borrowerProfileId !== input.borrowerProfileId) {
      fail("APPLICATION_NOT_FOUND");
    }
    if (application.status !== "DRAFT" || !application.currentVersionId) {
      fail("APPLICATION_NOT_SUBMITTABLE");
    }
    const submittedAt = new Date();
    await tx.applicationVersion.update({
      where: { id: application.currentVersionId },
      data: { submittedAt },
    });
    return applicationResult(await tx.loanApplication.update({
      where: { id: input.applicationId },
      data: { status: "SUBMITTED", submittedAt },
      select: applicationSelect,
    }));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
