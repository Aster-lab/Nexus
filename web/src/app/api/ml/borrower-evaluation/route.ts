import { Prisma } from "../../../../generated/prisma/client";
import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../lib/api/authentication";
import { requireRole } from "../../../../lib/api/authorization";
import { apiSuccessResponse } from "../../../../lib/api/responses";
import { parseJsonBody } from "../../../../lib/api/validation";
import { prisma } from "../../../../lib/prisma";
import { mlServiceEndpoint } from "../../../../lib/services/ml-service-url";
import {
  FeatureSnapshotContractSchema,
  PersistedPredictionOutputSchema,
  PredictionBatchResponseSchema,
  PERSISTED_PREDICTION_OUTPUT_SCHEMA_VERSION,
  RISK_FEATURE_SCHEMA_VERSION,
} from "../../../../lib/contracts/risk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const TIMEOUT_MS = 10_000;
const requestSchema = z.object({ applicationId: z.uuid() }).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    const { applicationId } = await parseJsonBody(request, requestSchema);
    const application = await prisma.loanApplication.findFirst({
      where: { id: applicationId, borrowerProfileId: identity.borrowerProfile.id },
      select: { id: true, status: true, currentVersionId: true },
    });
    if (!application) throw new ApiError("NOT_FOUND", "Application not found.", 404);
    if (!application.currentVersionId || !["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(application.status)) {
      throw new ApiError("APPLICATION_NOT_ELIGIBLE", "The application is not eligible for evaluation.", 409);
    }
    const [snapshot, modelVersion] = await Promise.all([
      prisma.featureSnapshot.findFirst({ where: { applicationVersionId: application.currentVersionId, featureSchemaVersion: RISK_FEATURE_SCHEMA_VERSION }, orderBy: { createdAt: "desc" } }),
      prisma.modelVersion.findFirst({ where: { status: "APPROVED", isActive: true, featureSchemaVersion: RISK_FEATURE_SCHEMA_VERSION }, orderBy: { registeredAt: "desc" }, select: { id: true } }),
    ]);
    if (!snapshot) throw new ApiError("FEATURE_SNAPSHOT_NOT_FOUND", "A validated feature snapshot is not available for this application version.", 409);
    if (!modelVersion) throw new ApiError("ML_MODEL_UNAVAILABLE", "No approved compatible risk model is active.", 503);
    const validatedSnapshot = FeatureSnapshotContractSchema.safeParse({
      schema_version: snapshot.featureSchemaVersion,
      feature_generation_version: snapshot.featureGenerationVersion,
      source_application_version_id: snapshot.applicationVersionId,
      created_at: snapshot.createdAt.toISOString(),
      feature_values: snapshot.featureValues,
      feature_units: snapshot.featureUnits,
      source_mapping: snapshot.sourceMapping,
    });
    if (!validatedSnapshot.success) throw new ApiError("FEATURE_SNAPSHOT_INVALID", "The stored feature snapshot does not match the approved risk contract.", 409);

    const serviceUrl = process.env.ML_SERVICE_URL;
    const serviceToken = process.env.ML_SERVICE_TOKEN;
    if (!serviceUrl || !serviceToken || serviceToken.length < 32) {
      throw new ApiError("ML_SERVICE_UNAVAILABLE", "The evaluation service is not configured.", 503);
    }
    let response: Response;
    try {
      response = await fetch(mlServiceEndpoint("predict", serviceUrl), {
        method: "POST",
        headers: { "content-type": "application/json", "X-ML-Service-Token": serviceToken },
        body: JSON.stringify({ schema_version: RISK_FEATURE_SCHEMA_VERSION, features: validatedSnapshot.data.feature_values }),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new ApiError("ML_SERVICE_TIMEOUT", "The evaluation service timed out.", 504);
      }
      throw new ApiError("ML_SERVICE_UNAVAILABLE", "The evaluation service is unavailable.", 503);
    }
    if (!response.ok) throw new ApiError("ML_SERVICE_UNAVAILABLE", "The evaluation service could not complete the request.", 503);
    const batch = PredictionBatchResponseSchema.safeParse(await response.json().catch(() => null));
    if (!batch.success || batch.data.status !== "success" || batch.data.processed_count !== 1 || batch.data.data.length !== 1 || batch.data.data[0].index !== 0 || batch.data.errors.length !== 0) {
      throw new ApiError("INVALID_ML_RESPONSE", "The evaluation service returned an invalid response.", 502);
    }
    const prediction = PersistedPredictionOutputSchema.parse({ ...batch.data.data[0].prediction, schema_version: PERSISTED_PREDICTION_OUTPUT_SCHEMA_VERSION });
    const record = await prisma.predictionRecord.create({
      data: {
        featureSnapshotId: snapshot.id,
        modelVersionId: modelVersion.id,
        predictionType: "PRELIMINARY",
        predictionOutput: prediction as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, predictionType: true, createdAt: true },
    });
    return apiSuccessResponse({ predictionRecordId: record.id, featureSnapshotId: snapshot.id, modelVersionId: modelVersion.id, predictionType: record.predictionType, evaluatedAt: record.createdAt, prediction }, { status: 201, message: "Borrower evaluation completed." });
  } catch (error) { return apiErrorResponseFrom(error); }
}
