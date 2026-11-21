import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../../../lib/api/errors";
import { requireInvestor } from "../../../../../lib/api/investor";
import { apiSuccessResponse } from "../../../../../lib/api/responses";
import { validateRouteParams } from "../../../../../lib/api/validation";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const safeSelect = { id: true, status: true, principalSatang: true, fundedSatang: true, annualInterestRate: true, termMonths: true, fundingDeadline: true, createdAt: true } as const;

export async function GET(request: Request, context: { params: Promise<{ loanId: string }> }): Promise<Response> {
  try {
    await requireInvestor(request);
    const { loanId } = validateRouteParams(await context.params, z.object({ loanId: z.string().uuid() }).strict());
    const loan = await prisma.loan.findFirst({ where: { id: loanId, status: "FUNDING", fundingDeadline: { gt: new Date() }, escrowAccount: { is: { status: "OPEN" } } }, select: safeSelect });
    if (!loan) throw new ApiError("NOT_FOUND", "The requested marketplace loan was not found.", 404);
    if (loan.fundedSatang >= loan.principalSatang) throw new ApiError("NOT_FOUND", "The requested marketplace loan was not found.", 404);
    return apiSuccessResponse({ ...loan, principalSatang: loan.principalSatang.toString(), fundedSatang: loan.fundedSatang.toString(), remainingFundingSatang: (loan.principalSatang - loan.fundedSatang).toString(), annualInterestRate: loan.annualInterestRate.toString() });
  } catch (error) { return apiErrorResponseFrom(error); }
}
