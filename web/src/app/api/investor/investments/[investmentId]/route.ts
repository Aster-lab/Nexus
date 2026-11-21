import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../../../lib/api/errors";
import { requireInvestor } from "../../../../../lib/api/investor";
import { apiSuccessResponse } from "../../../../../lib/api/responses";
import { validateRouteParams } from "../../../../../lib/api/validation";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ investmentId: string }> }): Promise<Response> {
  try {
    const identity = await requireInvestor(request);
    const { investmentId } = validateRouteParams(await context.params, z.object({ investmentId: z.string().uuid() }).strict());
    const row = await prisma.investment.findFirst({ where: { id: investmentId, investorProfileId: identity.investorProfile.id }, include: { loan: { select: { id: true, status: true, principalSatang: true, annualInterestRate: true, termMonths: true } }, contributions: { orderBy: { createdAt: "asc" }, select: { id: true, amountSatang: true, createdAt: true, ledgerTransaction: { select: { id: true, status: true } } } }, payoutAllocation: { select: { id: true, principalSatang: true, interestSatang: true, recoverySatang: true, repaymentId: true } } } });
    if (!row) throw new ApiError("NOT_FOUND", "The requested investment was not found.", 404);
    return apiSuccessResponse({ ...row, loan: { ...row.loan, principalSatang: row.loan.principalSatang.toString(), annualInterestRate: row.loan.annualInterestRate.toString() }, contributions: row.contributions.map((item) => ({ ...item, amountSatang: item.amountSatang.toString() })), payoutAllocation: row.payoutAllocation.map((item) => ({ ...item, principalSatang: item.principalSatang.toString(), interestSatang: item.interestSatang.toString(), recoverySatang: item.recoverySatang.toString() })) });
  } catch (error) { return apiErrorResponseFrom(error); }
}
