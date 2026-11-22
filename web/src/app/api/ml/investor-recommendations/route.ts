import { Prisma } from "../../../../generated/prisma/client";
import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { requireInvestor } from "../../../../lib/api/investor";
import { apiSuccessResponse } from "../../../../lib/api/responses";
import { prisma } from "../../../../lib/prisma";
import { mlServiceEndpoint } from "../../../../lib/services/ml-service-url";
import {
  DynamicRecommendationRequestSchema,
  DynamicRecommendationResponseSchema,
  InvestorPreferenceContractSchema,
  PersistedPredictionOutputSchema,
} from "../../../../lib/contracts/risk";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SERVICE_TIMEOUT_MS = 10_000;
type LoanPurpose = z.infer<typeof DynamicRecommendationRequestSchema>["candidates"][number]["loan_purpose"];
const purposeCodes: readonly LoanPurpose[] = ["business", "education", "medical", "personal", "home", "other"];

function loanPurpose(snapshot: unknown): LoanPurpose | null {
  if (typeof snapshot !== "object" || snapshot === null) return null;
  const requested = (snapshot as { requested_loan?: unknown }).requested_loan;
  if (typeof requested !== "object" || requested === null) return null;
  const purpose = (requested as { purpose?: unknown }).purpose;
  if (typeof purpose !== "string") return null;
  const normalized = purpose.trim().toLowerCase();
  const exactPurpose = purposeCodes.find((code) => code === normalized);
  if (exactPurpose) return exactPurpose;
  if (normalized.includes("business")) return "business";
  if (normalized.includes("education")) return "education";
  if (normalized.includes("medical")) return "medical";
  if (normalized.includes("home")) return "home";
  if (normalized.includes("personal")) return "personal";
  return null;
}

function safeEligibleLoan(loan: {
  id: string;
  status: string;
  principalSatang: bigint;
  fundedSatang: bigint;
  annualInterestRate: { toString(): string };
  termMonths: number;
  fundingDeadline: Date;
  escrowAccount: { status: string } | null;
}, now: Date): boolean {
  return loan.status === "FUNDING" && loan.fundingDeadline > now &&
    loan.fundedSatang < loan.principalSatang && loan.escrowAccount?.status === "OPEN";
}

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireInvestor(request);
    const params = new URL(request.url).searchParams;
    for (const key of params.keys()) if (key !== "runId") throw new ApiError("VALIDATION_ERROR", `Unsupported query parameter: ${key}`, 400);
    if (params.getAll("runId").length > 1) throw new ApiError("VALIDATION_ERROR", "runId must appear once.", 400);
    const runId = params.get("runId");
    if (runId && !z.uuid().safeParse(runId).success) throw new ApiError("VALIDATION_ERROR", "Invalid recommendation run ID.", 400);
    const run = await prisma.recommendationRun.findFirst({
      where: { investorProfileId: identity.investorProfile.id, ...(runId ? { id: runId } : {}) },
      orderBy: { createdAt: "desc" },
      select: { id: true, modelVersionId: true, inputVersion: true, createdAt: true, latencyMs: true, results: { orderBy: { rankingPosition: "asc" }, select: { id: true, loanId: true, matchScore: true, rankingPosition: true, explanation: true, loan: { select: { id: true, status: true, principalSatang: true, fundedSatang: true, annualInterestRate: true, termMonths: true, fundingDeadline: true, escrowAccount: { select: { status: true } } } } } } },
    });
    if (!run) throw new ApiError("NOT_FOUND", "Recommendation run not found.", 404);
    const now = new Date();
    const eligible = run.results.filter((item) => safeEligibleLoan(item.loan, now));
    return apiSuccessResponse({
      recommendationRunId: run.id,
      modelVersionId: run.modelVersionId,
      inputVersion: run.inputVersion,
      createdAt: run.createdAt,
      latencyMs: run.latencyMs,
      isStale: eligible.length !== run.results.length,
      recommendations: eligible.map((item) => ({
        recommendationId: item.id,
        loanId: item.loanId,
        score: item.matchScore.toString(),
        rankingPosition: item.rankingPosition,
        explanation: item.explanation,
        loan: { id: item.loan.id, status: item.loan.status, principalSatang: item.loan.principalSatang.toString(), fundedSatang: item.loan.fundedSatang.toString(), remainingFundingSatang: (item.loan.principalSatang - item.loan.fundedSatang).toString(), annualInterestRate: item.loan.annualInterestRate.toString(), termMonths: item.loan.termMonths, fundingDeadline: item.loan.fundingDeadline },
      })),
    });
  } catch (error) { return apiErrorResponseFrom(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireInvestor(request);
    const preferenceRow = await prisma.investorPreference.findUnique({ where: { investorProfileId: identity.investorProfile.id }, select: { preferenceData: true, updatedAt: true } });
    if (!preferenceRow) throw new ApiError("INVESTOR_PREFERENCES_REQUIRED", "Set investor preferences before requesting recommendations.", 409);
    const preference = InvestorPreferenceContractSchema.safeParse(preferenceRow.preferenceData);
    if (!preference.success) throw new ApiError("INVESTOR_PREFERENCES_INVALID", "Stored investor preferences are invalid.", 409);
    const model = await prisma.modelVersion.findFirst({ where: { status: "APPROVED", isActive: true, featureSchemaVersion: "nexus_risk_features.v1" }, orderBy: { registeredAt: "desc" }, select: { id: true } });
    if (!model) throw new ApiError("ML_MODEL_UNAVAILABLE", "No approved compatible risk model is active.", 503);
    const now = new Date();
    const riskRows = await prisma.loan.findMany({
      where: {
        status: "FUNDING",
        fundingDeadline: { gt: now },
        escrowAccount: { is: { status: "OPEN" } },
        application: { riskAssessments: { some: { assessmentStatus: "CURRENT", predictionRecord: { modelVersionId: model.id } } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 200,
      select: {
        id: true, principalSatang: true, fundedSatang: true, annualInterestRate: true, termMonths: true, status: true, fundingDeadline: true,
        escrowAccount: { select: { status: true } },
        application: { select: { borrowerProfileId: true, currentVersionId: true, currentVersion: { select: { submittedData: true } }, riskAssessments: { where: { assessmentStatus: "CURRENT", predictionRecord: { modelVersionId: model.id } }, select: { applicationVersionId: true, predictionRecord: { select: { predictionOutput: true } } } } } },
      },
    });
    const candidates: z.infer<typeof DynamicRecommendationRequestSchema>["candidates"] = [];
    for (const loan of riskRows) {
      if (!safeEligibleLoan(loan, now) || !loan.application.currentVersionId) continue;
      const assessment = loan.application.riskAssessments.find((row) => row.applicationVersionId === loan.application.currentVersionId);
      if (!assessment || !loan.application.currentVersion) continue;
      const prediction = PersistedPredictionOutputSchema.safeParse(assessment.predictionRecord.predictionOutput);
      const purpose = loanPurpose(loan.application.currentVersion.submittedData);
      const principal = Number(loan.principalSatang);
      const funded = Number(loan.fundedSatang);
      if (!prediction.success || !purpose || !Number.isSafeInteger(principal) || !Number.isSafeInteger(funded)) continue;
      candidates.push({
        loan_id: loan.id,
        principal_satang: principal,
        funded_satang: funded,
        annual_interest_rate: Number(loan.annualInterestRate.toString()),
        term_months: loan.termMonths,
        loan_purpose: purpose,
        risk_tier: prediction.data.tier.tier_code as "TIER_A" | "TIER_B" | "TIER_C" | "TIER_D",
      });
    }
    const input = DynamicRecommendationRequestSchema.parse({ schema_version: "nexus_investor_recommendation_request.v1", preferences: preference.data, candidates });
    const serviceUrl = process.env.ML_SERVICE_URL;
    const serviceToken = process.env.ML_SERVICE_TOKEN;
    if (!serviceUrl || !serviceToken || serviceToken.length < 32) throw new ApiError("ML_SERVICE_UNAVAILABLE", "The recommendation service is not configured.", 503);
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(mlServiceEndpoint("recommendations", serviceUrl), { method: "POST", headers: { "content-type": "application/json", "X-ML-Service-Token": serviceToken }, body: JSON.stringify(input), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS) });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new ApiError("ML_SERVICE_TIMEOUT", "The recommendation service timed out.", 504);
      throw new ApiError("ML_SERVICE_UNAVAILABLE", "The recommendation service is unavailable.", 503);
    }
    if (!response.ok) throw new ApiError("ML_SERVICE_UNAVAILABLE", "The recommendation service could not complete the request.", 503);
    const result = DynamicRecommendationResponseSchema.safeParse(await response.json().catch(() => null));
    if (!result.success) throw new ApiError("INVALID_ML_RESPONSE", "The recommendation service returned an invalid response.", 502);
    const candidateById = new Map(candidates.map((candidate) => [candidate.loan_id, candidate]));
    const filtered = result.data.recommendations.filter((item) => candidateById.has(item.loan_id));
    const latencyMs = Math.max(0, Date.now() - startedAt);
    const persisted = await prisma.$transaction(async (tx) => {
      const stillEligible = await tx.loan.findMany({ where: { id: { in: filtered.map((item) => item.loan_id) }, status: "FUNDING", fundingDeadline: { gt: new Date() }, escrowAccount: { is: { status: "OPEN" } } }, select: { id: true, principalSatang: true, fundedSatang: true } });
      const liveIds = new Set(stillEligible.filter((loan) => loan.fundedSatang < loan.principalSatang).map((loan) => loan.id));
      const liveRecommendations = filtered.filter((item) => liveIds.has(item.loan_id));
      const capturedAt = new Date().toISOString();
      const run = await tx.recommendationRun.create({
        data: {
          investorProfileId: identity.investorProfile.id,
          modelVersionId: model.id,
          inputVersion: input.schema_version,
          latencyMs,
          preferenceSnapshot: { schema_version: "nexus_recommendation_preferences_snapshot.v1", captured_at: capturedAt, preferences: preference.data } as unknown as Prisma.InputJsonValue,
          candidateSetSnapshot: { schema_version: "nexus_recommendation_candidates_snapshot.v2", captured_at: capturedAt, candidates: input.candidates } as unknown as Prisma.InputJsonValue,
        },
        select: { id: true, createdAt: true, modelVersionId: true },
      });
      if (liveRecommendations.length) {
        await tx.recommendationResult.createMany({ data: liveRecommendations.map((item, index) => ({
          recommendationRunId: run.id,
          loanId: item.loan_id,
          matchScore: new Prisma.Decimal(item.score.toString()),
          rankingPosition: index + 1,
          explanation: { schema_version: "nexus_recommendation_explanation.v1", algorithm: "content_based_cosine_similarity", feature_scores: item.feature_scores } as unknown as Prisma.InputJsonValue,
        })) });
      }
      return { run, recommendations: liveRecommendations };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
    return apiSuccessResponse({
      recommendationRunId: persisted.run.id,
      modelVersionId: persisted.run.modelVersionId,
      inputVersion: input.schema_version,
      createdAt: persisted.run.createdAt,
      latencyMs,
      recommendations: persisted.recommendations.map((item, index) => {
        const loan = candidates.find((candidate) => candidate.loan_id === item.loan_id)!;
        return { loanId: item.loan_id, score: item.score.toString(), rankingPosition: index + 1, explanation: { schema_version: "nexus_recommendation_explanation.v1", algorithm: "content_based_cosine_similarity", feature_scores: item.feature_scores }, loan: { id: loan.loan_id, principalSatang: String(loan.principal_satang), fundedSatang: String(loan.funded_satang), remainingFundingSatang: String(loan.principal_satang - loan.funded_satang), annualInterestRate: String(loan.annual_interest_rate), termMonths: loan.term_months, loanPurpose: loan.loan_purpose, riskTier: loan.risk_tier } };
      }),
    }, { status: 201, message: "Investor recommendations refreshed." });
  } catch (error) { return apiErrorResponseFrom(error); }
}
