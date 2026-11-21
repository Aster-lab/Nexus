import { apiErrorResponseFrom } from "../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../lib/api/authentication";
import { apiSuccessResponse } from "../../../../lib/api/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    return apiSuccessResponse({
      id: identity.userId,
      email: identity.email,
      roles: identity.roles,
      borrowerProfile: identity.borrowerProfile,
      investorProfile: identity.investorProfile,
    });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
