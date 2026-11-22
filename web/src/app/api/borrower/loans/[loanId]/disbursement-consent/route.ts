import { z } from "zod";
import { apiErrorResponseFrom, ApiError } from "../../../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../../../lib/api/authentication";
import { requireRole } from "../../../../../../lib/api/authorization";
import { apiSuccessResponse } from "../../../../../../lib/api/responses";
import { parseJsonBody, validateRouteParams } from "../../../../../../lib/api/validation";
import { recordBorrowerDisbursementConsent } from "../../../../../../lib/services/loan-disbursement-approval.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ loanId: z.uuid() }).strict();
const bodySchema = z.object({ confirmDisbursement: z.literal(true) }).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ loanId: string }> },
): Promise<Response> {
  try {
    const identity = requireRole(await authenticateApiRequest(request), "BORROWER");
    if (!identity.borrowerProfile) {
      throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    }
    const { loanId } = validateRouteParams(await context.params, paramsSchema);
    await parseJsonBody(request, bodySchema);
    const consent = await recordBorrowerDisbursementConsent({
      loanId,
      borrowerUserId: identity.userId,
    });
    return apiSuccessResponse({
      loanId: consent.loanId,
      confirmedAt: consent.confirmedAt.toISOString(),
      alreadyConfirmed: consent.alreadyConfirmed,
    }, {
      status: consent.alreadyConfirmed ? 200 : 201,
      message: consent.alreadyConfirmed
        ? "Borrower disbursement confirmation is already recorded."
        : "Borrower disbursement confirmation recorded.",
    });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
