import { apiErrorResponseFrom, ApiError } from "../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../lib/api/authentication";
import { requireRole } from "../../../../lib/api/authorization";
import { apiSuccessResponse } from "../../../../lib/api/responses";
import { getBorrowerDashboardSummary } from "../../../../lib/services/borrower-dashboard.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) {
      throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    }
    const summary = await getBorrowerDashboardSummary(identity.borrowerProfile.id);
    return apiSuccessResponse(summary, { message: "Borrower dashboard loaded." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
