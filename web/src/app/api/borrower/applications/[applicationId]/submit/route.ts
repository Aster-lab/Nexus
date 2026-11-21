import { apiErrorResponseFrom, ApiError } from "../../../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../../../lib/api/authentication";
import { requireRole } from "../../../../../../lib/api/authorization";
import { apiSuccessResponse } from "../../../../../../lib/api/responses";
import { validateRouteParams } from "../../../../../../lib/api/validation";
import { submitBorrowerApplication } from "../../../../../../lib/services/borrower-application.service";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ applicationId: z.uuid() }).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    const { applicationId } = validateRouteParams(await context.params, paramsSchema);
    const application = await submitBorrowerApplication({
      borrowerProfileId: identity.borrowerProfile.id,
      applicationId,
    });
    return apiSuccessResponse(application, { message: "Application submitted successfully." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
