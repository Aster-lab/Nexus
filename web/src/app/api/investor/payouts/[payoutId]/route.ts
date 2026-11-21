import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../../../lib/api/errors";
import { requireInvestor } from "../../../../../lib/api/investor";
import { apiSuccessResponse } from "../../../../../lib/api/responses";
import { validateRouteParams } from "../../../../../lib/api/validation";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ payoutId: string }> }): Promise<Response> {
  try {
    const identity = await requireInvestor(request);
    const { payoutId } = validateRouteParams(await context.params, z.object({ payoutId: z.string().uuid() }).strict());
    const row = await prisma.investorPayout.findFirst({ where: { id: payoutId, investorProfileId: identity.investorProfile.id }, select: { id: true, investorProfileId: true, walletId: true, payoutAllocationId: true, principalSatang: true, interestSatang: true, status: true, ledgerTransactionId: true, completedAt: true, createdAt: true, payoutAllocation: { select: { repaymentId: true, investmentId: true, repayment: { select: { loanId: true, ledgerTransactionId: true } } } } } });
    if (!row) throw new ApiError("NOT_FOUND", "The requested payout was not found.", 404);
    return apiSuccessResponse({ ...row, principalSatang: row.principalSatang.toString(), interestSatang: row.interestSatang.toString() });
  } catch (error) { return apiErrorResponseFrom(error); }
}
