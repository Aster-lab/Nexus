import { z } from "zod";
import { apiErrorResponseFrom } from "../../../../../../lib/api/errors";
import { requireAdministrator } from "../../../../../../lib/api/administrator";
import { apiSuccessResponse } from "../../../../../../lib/api/responses";
import { validateRouteParams, parseJsonBody } from "../../../../../../lib/api/validation";
import { decideLoanApplication } from "../../../../../../lib/services/administrator-application-review.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const params = z.object({ applicationId: z.uuid() }).strict();
const bodySchema = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), reason: z.string().trim().min(1).max(1000), notes: z.string().trim().max(4000).optional() }).strict();

export async function POST(request: Request, context: { params: Promise<{ applicationId: string }> }): Promise<Response> {
  try {
    const identity = await requireAdministrator(request);
    const { applicationId } = validateRouteParams(await context.params, params);
    const body = await parseJsonBody(request, bodySchema);
    const result = await decideLoanApplication({ applicationId, actorUserId: identity.userId, ...body });
    return apiSuccessResponse(result, { message: "Application decision recorded." });
  } catch (error) { return apiErrorResponseFrom(error); }
}
