import { z } from "zod";
import { requireAdministrator } from "../../../../../lib/api/administrator";
import { apiErrorResponseFrom } from "../../../../../lib/api/errors";
import { apiSuccessResponse } from "../../../../../lib/api/responses";
import { parseJsonBody, validateRouteParams } from "../../../../../lib/api/validation";
import { administerPolicyVersion } from "../../../../../lib/services/administrator-policy-activation.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const paramsSchema = z.object({ policyVersionId: z.uuid() }).strict();
const bodySchema = z.object({ action: z.enum(["APPROVE", "ACTIVATE"]) }).strict();

export async function PATCH(request: Request, context: { params: Promise<{ policyVersionId: string }> }): Promise<Response> {
  try {
    const identity = await requireAdministrator(request);
    const { policyVersionId } = validateRouteParams(await context.params, paramsSchema);
    const input = await parseJsonBody(request, bodySchema);
    const result = await administerPolicyVersion({ policyVersionId, actorUserId: identity.userId, action: input.action });
    return apiSuccessResponse(result, { message: input.action === "APPROVE" ? "Policy version approved." : "Policy version activated." });
  } catch (error) { return apiErrorResponseFrom(error); }
}
