import { z } from "zod";
import { apiErrorResponseFrom, ApiError } from "../../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../../lib/api/authentication";
import { requireRole } from "../../../../../lib/api/authorization";
import { apiSuccessResponse } from "../../../../../lib/api/responses";
import { validateRouteParams } from "../../../../../lib/api/validation";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ loanId: z.uuid() }).strict();

export async function GET(request: Request, context: { params: Promise<{ loanId: string }> }): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    const { loanId } = validateRouteParams(await context.params, paramsSchema);
    const loan = await prisma.loan.findFirst({
      where: { id: loanId, borrowerProfileId: identity.borrowerProfile.id },
      select: {
        id: true,
        status: true,
        principalSatang: true,
        fundedSatang: true,
        annualInterestRate: true,
        termMonths: true,
        fundingDeadline: true,
        fundedAt: true,
        disbursedAt: true,
        createdAt: true,
        borrowerProfile: { select: { userId: true } },
        repaymentSchedule: {
          select: {
            id: true,
            currentVersionId: true,
            currentVersion: { select: {
              id: true,
              installments: { orderBy: { installmentNumber: "asc" }, select: {
                installmentNumber: true,
                dueDate: true,
                principalDueSatang: true,
                interestDueSatang: true,
                paidPrincipalSatang: true,
                paidInterestSatang: true,
              } },
            } },
          },
        },
      },
    });
    if (!loan) throw new ApiError("NOT_FOUND", "The requested loan was not found.", 404);
    const disbursementConsent = await prisma.auditLog.findFirst({
      where: {
        actorUserId: loan.borrowerProfile.userId,
        action: "LOAN_DISBURSEMENT_CONSENTED",
        targetType: "LOAN",
        targetId: loan.id,
        outcome: "SUCCESS",
        newValues: { path: ["schemaVersion"], equals: "loan_disbursement_consent.v1" },
      },
      select: { createdAt: true, newValues: true },
    });
    const consentValues = disbursementConsent?.newValues as
      | { confirmedPrincipalSatang?: unknown; currency?: unknown }
      | null;
    const hasCurrentConsent = !!disbursementConsent && !!consentValues &&
      consentValues.confirmedPrincipalSatang === loan.principalSatang.toString() &&
      consentValues.currency === "THB";
    const installments = loan.repaymentSchedule?.currentVersion?.installments ?? [];
    let outstandingPrincipal = 0n;
    let outstandingInterest = 0n;
    let paidPrincipal = 0n;
    let paidInterest = 0n;
    for (const installment of installments) {
      outstandingPrincipal += installment.principalDueSatang - installment.paidPrincipalSatang;
      outstandingInterest += installment.interestDueSatang - installment.paidInterestSatang;
      paidPrincipal += installment.paidPrincipalSatang;
      paidInterest += installment.paidInterestSatang;
    }
    const maturityDate = installments.at(-1)?.dueDate ?? null;
    return apiSuccessResponse({
      id: loan.id,
      status: loan.status,
      principalSatang: loan.principalSatang.toString(),
      originalPrincipalSatang: loan.principalSatang.toString(),
      fundedSatang: loan.fundedSatang.toString(),
      annualInterestRate: loan.annualInterestRate.toString(),
      termMonths: loan.termMonths,
      fundingDeadline: loan.fundingDeadline,
      fundedAt: loan.fundedAt,
      disbursedAt: loan.disbursedAt,
      disbursementConsentAt: hasCurrentConsent ? disbursementConsent.createdAt : null,
      createdAt: loan.createdAt,
      outstandingPrincipalSatang: loan.repaymentSchedule?.currentVersion ? outstandingPrincipal.toString() : null,
      outstandingInterestSatang: loan.repaymentSchedule?.currentVersion ? outstandingInterest.toString() : null,
      outstandingBalanceSatang: loan.repaymentSchedule?.currentVersion ? (outstandingPrincipal + outstandingInterest).toString() : null,
      paidPrincipalSatang: loan.repaymentSchedule?.currentVersion ? paidPrincipal.toString() : null,
      paidInterestSatang: loan.repaymentSchedule?.currentVersion ? paidInterest.toString() : null,
      totalPaidSatang: loan.repaymentSchedule?.currentVersion ? (paidPrincipal + paidInterest).toString() : null,
      installmentCount: installments.length,
      maturityDate,
      scheduleVersionId: loan.repaymentSchedule?.currentVersion?.id ?? null,
    });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
