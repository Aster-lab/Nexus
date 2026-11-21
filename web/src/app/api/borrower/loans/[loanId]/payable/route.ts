import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../../../lib/api/authentication";
import { requireRole } from "../../../../../../lib/api/authorization";
import { apiSuccessResponse } from "../../../../../../lib/api/responses";
import { validateRouteParams } from "../../../../../../lib/api/validation";
import { getBorrowerPayableSummary } from "../../../../../../lib/services/repayment/repayment-submitrepayment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ loanId: string }> },
): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) {
      throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    }
    const { loanId } = validateRouteParams(
      await context.params,
      z.object({ loanId: z.uuid() }).strict(),
    );
    const summary = await getBorrowerPayableSummary({
      loanId,
      borrowerUserId: identity.userId,
    });
    if (!summary) {
      throw new ApiError("NOT_FOUND", "The payable loan summary was not found.", 404);
    }
    return apiSuccessResponse({
      loanId: summary.loanId,
      scheduleVersionId: summary.scheduleVersionId,
      payableAmountSatang: summary.payableAmountSatang.toString(),
      installments: summary.installments.map((installment) => ({
        ...installment,
        remainingPrincipalSatang: installment.remainingPrincipalSatang.toString(),
        remainingInterestSatang: installment.remainingInterestSatang.toString(),
        remainingBalanceSatang: installment.remainingBalanceSatang.toString(),
      })),
    });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
