import { Prisma } from "../../generated/prisma/client";
import {
  LoanInterestPolicyValuesSchema,
  LoanOfferPolicyValuesSchema,
} from "../contracts/platform-policy";
import { prisma } from "../prisma";
import { requireFinancialAdministrator } from "./financial-authorization.service";

export class AdministratorLoanOfferError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AdministratorLoanOfferError";
  }
}

function fail(code: string, message: string): never {
  throw new AdministratorLoanOfferError(code, message);
}

export async function issueAdministratorLoanOffer(input: {
  applicationId: string;
  actorUserId: string;
  principalSatang: bigint;
  termMonths: number;
  reason: string;
}) {
  if (input.principalSatang <= 0n || !Number.isSafeInteger(input.termMonths) || input.termMonths <= 0) {
    fail("OFFER_POLICY_VIOLATION", "Offer terms are invalid.");
  }
  const reason = input.reason.trim();
  if (!reason || reason.length > 1000) {
    fail("INVALID_REASON", "An offer issuance reason is required.");
  }

  return prisma.$transaction(async (tx) => {
    await requireFinancialAdministrator(tx, input.actorUserId);
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM loan_applications WHERE id = ${input.applicationId}::uuid FOR UPDATE
    `;
    const application = await tx.loanApplication.findUnique({
      where: { id: input.applicationId },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        currentVersionId: true,
        currentVersion: {
          select: {
            id: true,
            requestedPrincipalSatang: true,
            requestedTermMonths: true,
          },
        },
      },
    });
    if (!application) fail("APPLICATION_NOT_FOUND", "Application not found.");
    if (application.status !== "APPROVED" || !application.submittedAt ||
      !application.currentVersionId || application.currentVersion?.id !== application.currentVersionId) {
      fail("OFFER_APPLICATION_NOT_ELIGIBLE", "Only the current version of an approved application can receive an offer.");
    }

    const now = new Date();
    const [offerPolicyRecord, interestPolicyRecord] = await Promise.all([
      tx.platformPolicy.findUnique({
        where: { policyCode: "LOAN_OFFER_POLICY" },
        include: { versions: {
          where: { status: "ACTIVE", OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }] },
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: { policyValues: true },
        } },
      }),
      tx.platformPolicy.findUnique({
        where: { policyCode: "LOAN_INTEREST_POLICY" },
        include: { versions: {
          where: { status: "ACTIVE", OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }] },
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: { policyValues: true },
        } },
      }),
    ]);
    const offerPolicy = LoanOfferPolicyValuesSchema.safeParse(offerPolicyRecord?.versions[0]?.policyValues);
    const interestPolicy = LoanInterestPolicyValuesSchema.safeParse(interestPolicyRecord?.versions[0]?.policyValues);
    if (!offerPolicy.success || !interestPolicy.success) {
      fail("OFFER_POLICY_UNAVAILABLE", "An active loan offer or interest policy is not available.");
    }
    const principal = input.principalSatang;
    if (principal < BigInt(offerPolicy.data.min_principal_satang) ||
      principal > BigInt(offerPolicy.data.max_principal_satang) ||
      !offerPolicy.data.allowed_term_months.includes(input.termMonths)) {
      fail("OFFER_POLICY_VIOLATION", "Offer terms are outside the active policy.");
    }

    const duplicate = await tx.loanOffer.findFirst({
      where: {
        applicationId: application.id,
        applicationVersionId: application.currentVersionId,
        status: "ISSUED",
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (duplicate) fail("OFFER_ALREADY_ISSUED", "An unexpired offer already exists for this application version.");
    const acceptedOffer = await tx.loanOffer.findFirst({
      where: { applicationId: application.id, status: "ACCEPTED" },
      select: { id: true },
    });
    const existingLoan = await tx.loan.count({ where: { applicationId: application.id } });
    if (acceptedOffer || existingLoan > 0) {
      fail("OFFER_APPLICATION_NOT_ELIGIBLE", "An offer has already been accepted for this application.");
    }

    const expiresAt = new Date(now.getTime() + offerPolicy.data.offer_validity_days * 24 * 60 * 60 * 1000);
    const annualInterestRate = new Prisma.Decimal(
      interestPolicy.data.annual_interest_rate_basis_points,
    ).div(10_000);
    const offer = await tx.loanOffer.create({
      data: {
        applicationId: application.id,
        applicationVersionId: application.currentVersionId,
        principalSatang: principal,
        annualInterestRate,
        termMonths: input.termMonths,
        expiresAt,
        status: "ISSUED",
        createdByUserId: input.actorUserId,
      },
      select: {
        id: true,
        applicationId: true,
        applicationVersionId: true,
        principalSatang: true,
        annualInterestRate: true,
        termMonths: true,
        expiresAt: true,
        status: true,
        createdAt: true,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: "LOAN_OFFER_ISSUED",
        targetType: "LOAN_OFFER",
        targetId: offer.id,
        reason,
        newValues: {
          applicationId: offer.applicationId,
          applicationVersionId: offer.applicationVersionId,
          principalSatang: offer.principalSatang.toString(),
          annualInterestRate: offer.annualInterestRate.toString(),
          termMonths: offer.termMonths,
          expiresAt: offer.expiresAt.toISOString(),
        },
        outcome: "SUCCESS",
      },
    });
    return {
      offerId: offer.id,
      applicationId: offer.applicationId,
      applicationVersionId: offer.applicationVersionId,
      principalSatang: offer.principalSatang.toString(),
      annualInterestRate: offer.annualInterestRate.toString(),
      termMonths: offer.termMonths,
      expiresAt: offer.expiresAt,
      status: offer.status,
      createdAt: offer.createdAt,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}
