import { z } from "zod";
import { apiErrorResponseFrom, ApiError } from "../../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../../lib/api/authentication";
import { requireRole } from "../../../../../lib/api/authorization";
import { apiSuccessResponse } from "../../../../../lib/api/responses";
import { validateRouteParams } from "../../../../../lib/api/validation";
import { LoanInterestPolicyValuesSchema, PlatformFeePolicyValuesSchema } from "../../../../../lib/contracts/platform-policy";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ offerId: z.uuid() }).strict();

export async function GET(
  request: Request,
  context: { params: Promise<{ offerId: string }> },
): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    const { offerId } = validateRouteParams(await context.params, paramsSchema);
    const [offer, feePolicy, interestPolicy] = await Promise.all([
      prisma.loanOffer.findFirst({
        where: { id: offerId, application: { borrowerProfileId: identity.borrowerProfile.id } },
        select: {
          id: true,
          applicationId: true,
          applicationVersionId: true,
          principalSatang: true,
          annualInterestRate: true,
          termMonths: true,
          repaymentFrequency: true,
          expiresAt: true,
          status: true,
          acceptedAt: true,
          createdAt: true,
          application: { select: { status: true, currentVersionId: true } },
          loan: { select: { id: true } },
        },
      }),
      prisma.platformPolicy.findUnique({
        where: { policyCode: "PLATFORM_FEE_POLICY" },
        include: { versions: { where: { status: "ACTIVE", OR: [{ effectiveAt: null }, { effectiveAt: { lte: new Date() } }] }, orderBy: { versionNumber: "desc" }, take: 1, select: { policyValues: true } } },
      }),
      prisma.platformPolicy.findUnique({
        where: { policyCode: "LOAN_INTEREST_POLICY" },
        include: { versions: { where: { status: "ACTIVE", OR: [{ effectiveAt: null }, { effectiveAt: { lte: new Date() } }] }, orderBy: { versionNumber: "desc" }, take: 1, select: { policyValues: true } } },
      }),
    ]);
    if (!offer) throw new ApiError("NOT_FOUND", "The requested offer was not found.", 404);
    const fee = PlatformFeePolicyValuesSchema.safeParse(feePolicy?.versions[0]?.policyValues);
    const interest = LoanInterestPolicyValuesSchema.safeParse(interestPolicy?.versions[0]?.policyValues);
    if (!fee.success || !interest.success) throw new ApiError("SERVICE_UNAVAILABLE", "Offer terms are temporarily unavailable.", 503);
    const now = new Date();
    return apiSuccessResponse({
      id: offer.id,
      applicationId: offer.applicationId,
      principalSatang: offer.principalSatang.toString(),
      annualInterestRate: offer.annualInterestRate.toString(),
      termMonths: offer.termMonths,
      repaymentFrequency: offer.repaymentFrequency,
      expiresAt: offer.expiresAt,
      status: offer.status,
      isExpired: offer.status === "ISSUED" && offer.expiresAt <= now,
      acceptedAt: offer.acceptedAt,
      createdAt: offer.createdAt,
      loanId: offer.loan?.id ?? null,
      permissions: {
        canAccept: offer.status === "ISSUED" && offer.expiresAt > now &&
          offer.application.status === "APPROVED" &&
          offer.application.currentVersionId === offer.applicationVersionId && !offer.loan,
      },
      platformFee: {
        rateBasisPoints: fee.data.fee_rate_basis_points,
        calculationBasis: fee.data.calculation_basis,
        calculationTiming: fee.data.calculation_timing,
        walletDeduction: fee.data.wallet_deduction,
        treatment: fee.data.treatment,
        currency: fee.data.currency,
      },
      repaymentTerms: {
        calculationMethod: interest.data.calculation_method,
        calculationFrequency: interest.data.calculation_frequency,
        currency: interest.data.currency,
      },
    });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
