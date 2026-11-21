import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../../lib/api/authentication";
import { requireRole } from "../../../../../lib/api/authorization";
import { apiSuccessResponse } from "../../../../../lib/api/responses";
import { validateRouteParams } from "../../../../../lib/api/validation";
import { prisma } from "../../../../../lib/prisma";
import { PersistedPredictionOutputSchema } from "../../../../../lib/contracts/risk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ evaluationId: string }> }): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    const { evaluationId } = validateRouteParams(await context.params, z.object({ evaluationId: z.uuid() }).strict());
    const record = await prisma.predictionRecord.findFirst({
      where: { id: evaluationId, featureSnapshot: { applicationVersion: { application: { borrowerProfileId: identity.borrowerProfile.id } } } },
      select: { id: true, predictionType: true, predictionOutput: true, createdAt: true, modelVersionId: true, featureSnapshotId: true },
    });
    if (!record) throw new ApiError("NOT_FOUND", "Evaluation not found.", 404);
    const prediction = PersistedPredictionOutputSchema.parse(record.predictionOutput);
    return apiSuccessResponse({ predictionRecordId: record.id, modelVersionId: record.modelVersionId, featureSnapshotId: record.featureSnapshotId, predictionType: record.predictionType, evaluatedAt: record.createdAt, prediction });
  } catch (error) { return apiErrorResponseFrom(error); }
}
