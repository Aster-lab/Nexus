import { z } from "zod";
import { requireAdministrator } from "../../../../lib/api/administrator";
import { apiErrorResponseFrom } from "../../../../lib/api/errors";
import { apiSuccessResponse } from "../../../../lib/api/responses";
import { parseJsonBody } from "../../../../lib/api/validation";
import { activateRepaymentClearingInfrastructure, getRepaymentClearingReadiness } from "../../../../lib/services/administrator-repayment-clearing.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activationRequest = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdministrator(request);
    return apiSuccessResponse(await getRepaymentClearingReadiness());
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireAdministrator(request);
    const input = await parseJsonBody(request, activationRequest);
    const result = await activateRepaymentClearingInfrastructure({ actorUserId: identity.userId, reason: input.reason });
    return apiSuccessResponse(result, { message: "Repayment Clearing account and wallet are active." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
