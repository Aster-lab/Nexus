import { authenticateApiRequest } from "../../../../../lib/api/authentication";
import { apiErrorResponseFrom } from "../../../../../lib/api/errors";
import { apiSuccessResponse } from "../../../../../lib/api/responses";
import { parseJsonBody } from "../../../../../lib/api/validation";
import { SelfServiceRoleEnrollmentSchema } from "../../../../../lib/contracts/role-enrollment";
import { enrollSelfServiceRole } from "../../../../../lib/services/self-service-role-enrollment.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    const input = await parseJsonBody(request, SelfServiceRoleEnrollmentSchema);
    const result = await enrollSelfServiceRole(identity.userId, input);
    return apiSuccessResponse(result, { status: 201, message: "Workspace enabled successfully." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
