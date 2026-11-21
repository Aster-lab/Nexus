import { z } from "zod";
import { apiErrorResponseFrom, ApiError } from "../../../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../../../lib/api/authentication";
import { requireRole } from "../../../../../../lib/api/authorization";
import { apiSuccessResponse } from "../../../../../../lib/api/responses";
import { validateRouteParams } from "../../../../../../lib/api/validation";
import { acceptBorrowerLoanOffer } from "../../../../../../lib/services/borrower-offer-acceptance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ offerId: z.uuid() }).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ offerId: string }> },
): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    const { offerId } = validateRouteParams(await context.params, paramsSchema);
    const result = await acceptBorrowerLoanOffer({
      actorUserId: identity.userId,
      borrowerProfileId: identity.borrowerProfile.id,
      offerId,
    });
    return apiSuccessResponse(result, { status: 201, message: "Loan offer accepted." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
