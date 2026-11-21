import { z } from "zod";
import { requireAdministrator } from "../../../../../../lib/api/administrator";
import { apiErrorResponseFrom } from "../../../../../../lib/api/errors";
import { apiSuccessResponse } from "../../../../../../lib/api/responses";
import { parseJsonBody, validateRouteParams } from "../../../../../../lib/api/validation";
import { issueAdministratorLoanOffer } from "../../../../../../lib/services/administrator-loan-offer.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ applicationId: z.uuid() }).strict();
const bodySchema = z.object({
  principalSatang: z.string().regex(/^(0|[1-9][0-9]{0,17})$/),
  termMonths: z.number().int().positive().safe(),
  reason: z.string().trim().min(1).max(1000),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
): Promise<Response> {
  try {
    const identity = await requireAdministrator(request);
    const { applicationId } = validateRouteParams(await context.params, paramsSchema);
    const body = await parseJsonBody(request, bodySchema);
    const offer = await issueAdministratorLoanOffer({
      applicationId,
      actorUserId: identity.userId,
      principalSatang: BigInt(body.principalSatang),
      termMonths: body.termMonths,
      reason: body.reason,
    });
    return apiSuccessResponse(offer, { status: 201, message: "Loan offer issued." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
