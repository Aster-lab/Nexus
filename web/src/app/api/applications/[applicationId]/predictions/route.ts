import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  ModelVersionStatus,
  PredictionType,
  Prisma,
  RiskAssessmentStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  FeatureSnapshotContractSchema,
  PERSISTED_PREDICTION_OUTPUT_SCHEMA_VERSION,
  PredictionBatchResponseSchema,
  PredictionPersistenceRequestSchema,
  PersistedPredictionOutputSchema,
  RISK_FEATURE_SCHEMA_VERSION,
} from "@/lib/contracts/risk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 32 * 1024;
const ML_TIMEOUT_MS = 10_000;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function tokenMatches(candidate: string | null, configured: string | undefined) {
  if (!candidate || !configured || configured.length < 32) return false;
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const configuredDigest = createHash("sha256").update(configured).digest();
  return timingSafeEqual(candidateDigest, configuredDigest);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string }> },
) {
  const token = process.env.ML_SERVICE_TOKEN;
  const persistenceToken = process.env.PREDICTION_PERSIST_TOKEN;
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer ([^\s]+)$/)?.[1] ?? null;
  if (!token || token.length < 32 || !persistenceToken || persistenceToken.length < 32) {
    return json({ error: "PREDICTION_SERVICE_NOT_CONFIGURED" }, 503);
  }
  if (!tokenMatches(bearer, persistenceToken)) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    return json({ error: "REQUEST_TOO_LARGE" }, 413);
  }

  let rawBody = "";
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "INVALID_REQUEST_BODY" }, 400);
    const chunks: Uint8Array[] = [];
    let bytesRead = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return json({ error: "REQUEST_TOO_LARGE" }, 413);
      }
      chunks.push(value);
    }
    rawBody = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
    );
  } catch {
    return json({ error: "INVALID_REQUEST_BODY" }, 400);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }
  const parsedRequest = PredictionPersistenceRequestSchema.safeParse(parsedBody);
  if (!parsedRequest.success) {
    return json({ error: "INVALID_PREDICTION_REQUEST" }, 422);
  }
  const input = parsedRequest.data;
  const { applicationId } = await context.params;

  try {
    const [application, modelVersion] = await Promise.all([
      prisma.loanApplication.findUnique({
        where: { id: applicationId },
        select: { id: true, status: true, currentVersionId: true },
      }),
      prisma.modelVersion.findUnique({
        where: { id: input.model_version_id },
        select: {
          id: true,
          status: true,
          isActive: true,
          featureSchemaVersion: true,
        },
      }),
    ]);

    if (!application || application.currentVersionId !== input.application_version_id) {
      return json({ error: "APPLICATION_VERSION_NOT_FOUND" }, 404);
    }
    if (
      !modelVersion ||
      modelVersion.status !== ModelVersionStatus.APPROVED ||
      !modelVersion.isActive ||
      modelVersion.featureSchemaVersion !== RISK_FEATURE_SCHEMA_VERSION
    ) {
      return json({ error: "MODEL_VERSION_NOT_ACTIVE_OR_COMPATIBLE" }, 409);
    }
    if (
      input.prediction_type === "OFFICIAL" &&
      !["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(application.status)
    ) {
      return json({ error: "APPLICATION_NOT_ELIGIBLE_FOR_OFFICIAL_ASSESSMENT" }, 409);
    }

    const createdAt = new Date().toISOString();
    const featureSnapshot = FeatureSnapshotContractSchema.safeParse({
      schema_version: RISK_FEATURE_SCHEMA_VERSION,
      feature_generation_version: input.feature_generation_version,
      source_application_version_id: input.application_version_id,
      created_at: createdAt,
      feature_values: input.feature_values,
      feature_units: input.feature_units,
      source_mapping: input.source_mapping,
    });
    if (!featureSnapshot.success) {
      return json({ error: "FEATURE_SNAPSHOT_INVALID" }, 422);
    }

    const mlUrl = process.env.ML_SERVICE_URL;
    if (!mlUrl) return json({ error: "PREDICTION_SERVICE_NOT_CONFIGURED" }, 503);

    let mlResponse: Response;
    try {
      mlResponse = await fetch(new URL("/predict", mlUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ML-Service-Token": token,
        },
        body: JSON.stringify({
          schema_version: RISK_FEATURE_SCHEMA_VERSION,
          features: featureSnapshot.data.feature_values,
        }),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(ML_TIMEOUT_MS),
      });
    } catch {
      return json({ error: "PREDICTION_SERVICE_UNAVAILABLE" }, 502);
    }
    if (!mlResponse.ok) return json({ error: "PREDICTION_SERVICE_FAILED" }, 502);

    const responseJson: unknown = await mlResponse.json().catch(() => null);
    const mlResult = PredictionBatchResponseSchema.safeParse(responseJson);
    if (
      !mlResult.success ||
      mlResult.data.status !== "success" ||
      mlResult.data.processed_count !== 1 ||
      mlResult.data.data.length !== 1 ||
      mlResult.data.data[0].index !== 0 ||
      mlResult.data.errors.length !== 0
    ) {
      return json({ error: "INVALID_PREDICTION_RESPONSE" }, 502);
    }

    const persistedOutput = PersistedPredictionOutputSchema.safeParse({
      ...mlResult.data.data[0].prediction,
      schema_version: PERSISTED_PREDICTION_OUTPUT_SCHEMA_VERSION,
    });
    if (!persistedOutput.success) {
      return json({ error: "INVALID_PREDICTION_OUTPUT" }, 502);
    }

    const saved = await prisma.$transaction(async (tx) => {
      const snapshot = await tx.featureSnapshot.create({
        data: {
          applicationVersionId: input.application_version_id,
          featureSchemaVersion: RISK_FEATURE_SCHEMA_VERSION,
          featureGenerationVersion: input.feature_generation_version,
          featureValues: featureSnapshot.data.feature_values as unknown as Prisma.InputJsonValue,
          featureUnits: featureSnapshot.data.feature_units as unknown as Prisma.InputJsonValue,
          sourceMapping: featureSnapshot.data.source_mapping as unknown as Prisma.InputJsonValue,
        },
      });
      const record = await tx.predictionRecord.create({
        data: {
          featureSnapshotId: snapshot.id,
          modelVersionId: modelVersion.id,
          predictionType: PredictionType[input.prediction_type],
          predictionOutput: persistedOutput.data as unknown as Prisma.InputJsonValue,
        },
      });

      if (input.prediction_type === "OFFICIAL") {
        await tx.riskAssessment.updateMany({
          where: {
            applicationId: application.id,
            applicationVersionId: input.application_version_id,
            assessmentStatus: RiskAssessmentStatus.CURRENT,
          },
          data: { assessmentStatus: RiskAssessmentStatus.SUPERSEDED },
        });
        await tx.riskAssessment.create({
          data: {
            applicationId: application.id,
            applicationVersionId: input.application_version_id,
            predictionRecordId: record.id,
            defaultProbability: persistedOutput.data.default_probability,
            riskGrade: persistedOutput.data.tier.tier_code,
            assessmentStatus: RiskAssessmentStatus.CURRENT,
          },
        });
      }
      return { snapshot, record };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return json({
      prediction_record_id: saved.record.id,
      feature_snapshot_id: saved.snapshot.id,
      prediction_type: saved.record.predictionType,
      prediction: persistedOutput.data,
    }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")) {
      return json({ error: "PREDICTION_WRITE_CONFLICT" }, 409);
    }
    return json({ error: "PREDICTION_PERSISTENCE_FAILED" }, 500);
  }
}
