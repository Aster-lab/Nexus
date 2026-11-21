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
        repaymentSchedule: {
          select: { id: true, currentVersionId: true },
        },
      },
    });
    if (!loan) throw new ApiError("NOT_FOUND", "The requested loan was not found.", 404);
    return apiSuccessResponse({
      ...loan,
      principalSatang: loan.principalSatang.toString(),
      fundedSatang: loan.fundedSatang.toString(),
      annualInterestRate: loan.annualInterestRate.toString(),
    });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
