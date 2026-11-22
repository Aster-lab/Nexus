import { Prisma } from "../../../../generated/prisma/client";
import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { requireInvestor } from "../../../../lib/api/investor";
import { apiSuccessResponse } from "../../../../lib/api/responses";
import { prisma } from "../../../../lib/prisma";
import { normalizeInvestorPreference } from "../../../../lib/contracts/risk";
import { PREFERENCE_MATCH_ALGORITHM, PREFERENCE_MATCH_WEIGHTS, rankLoansByPreference, type PreferenceMatchCandidate } from "../../../../lib/services/investor-recommendation.service";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LOAN_PURPOSES = ["business", "education", "medical", "personal", "home", "other"] as const;
type LoanPurpose = typeof LOAN_PURPOSES[number];
type StoredPreference = NonNullable<ReturnType<typeof normalizeInvestorPreference>>;

function loanPurpose(snapshot: unknown): LoanPurpose | null {
  if (typeof snapshot !== "object" || snapshot === null) return null;
  const requested = (snapshot as { requested_loan?: unknown }).requested_loan;
  if (typeof requested !== "object" || requested === null) return null;
  const purpose = (requested as { purpose?: unknown }).purpose;
  if (typeof purpose !== "string") return null;
  const normalized = purpose.trim().toLowerCase();
  const matched = LOAN_PURPOSES.find((code) => code === normalized);
  if (matched) return matched;
  if (normalized.includes("business")) return "business";
  if (normalized.includes("education")) return "education";
  if (normalized.includes("medical")) return "medical";
  if (normalized.includes("home")) return "home";
  if (normalized.includes("personal")) return "personal";
  return null;
}

function safeEligibleLoan(loan: {
  status: string;
  principalSatang: bigint;
  fundedSatang: bigint;
  fundingDeadline: Date;
  escrowAccount: { status: string } | null;
}, now: Date): boolean {
  return loan.status === "FUNDING" && loan.fundingDeadline > now &&
    loan.fundedSatang < loan.principalSatang && loan.escrowAccount?.status === "OPEN" &&
    Number.isSafeInteger(Number(loan.principalSatang)) && Number.isSafeInteger(Number(loan.fundedSatang));
}

function publicCandidate(loan: {
  id: string;
  principalSatang: bigint;
  fundedSatang: bigint;
  annualInterestRate: { toString(): string };
  termMonths: number;
  fundingDeadline: Date;
  purpose: LoanPurpose;
}): PreferenceMatchCandidate {
  return {
    loanId: loan.id,
    annualInterestRate: Number(loan.annualInterestRate.toString()),
    termMonths: loan.termMonths,
    remainingFundingSatang: Number(loan.principalSatang - loan.fundedSatang),
    loanPurpose: loan.purpose,
    fundingDeadline: loan.fundingDeadline,
  };
}

function preferenceSnapshot(preferences: StoredPreference, capturedAt: string) {
  return { schema_version: "nexus_recommendation_preferences_snapshot.v2", captured_at: capturedAt, preferences };
}

function candidateSnapshot(candidates: Array<PreferenceMatchCandidate & { principalSatang: string; fundedSatang: string }>, capturedAt: string) {
  return {
    schema_version: "nexus_recommendation_candidates_snapshot.v3",
    captured_at: capturedAt,
    candidates: candidates.map((candidate) => ({
      loan_id: candidate.loanId,
      principal_satang: candidate.principalSatang,
      funded_satang: candidate.fundedSatang,
      annual_interest_rate: candidate.annualInterestRate,
      term_months: candidate.termMonths,
      remaining_funding_satang: candidate.remainingFundingSatang,
      loan_purpose: candidate.loanPurpose,
      funding_deadline: candidate.fundingDeadline.toISOString(),
    })),
  };
}

function persistedExplanation(featureScores: Record<string, number>) {
  return {
    schema_version: "nexus_recommendation_explanation.v2",
    algorithm: PREFERENCE_MATCH_ALGORITHM,
    weights: PREFERENCE_MATCH_WEIGHTS,
    feature_scores: featureScores,
  };
}

function normalizeStoredExplanation(explanation: Prisma.JsonValue | null) {
  if (typeof explanation !== "object" || explanation === null || Array.isArray(explanation)) return explanation;
  const value = explanation as Record<string, Prisma.JsonValue>;
  const scores = typeof value.feature_scores === "object" && value.feature_scores !== null && !Array.isArray(value.feature_scores)
    ? value.feature_scores as Record<string, Prisma.JsonValue>
    : {};
  const score = (key: string, fallback?: string) => {
    const raw = scores[key] ?? (fallback ? scores[fallback] : undefined);
    return typeof raw === "number" ? raw : 0;
  };
  return persistedExplanation({
    interest_rate: score("interest_rate"),
    loan_duration: score("loan_duration"),
    investment_amount: score("investment_amount", "loan_amount"),
    loan_purpose: score("loan_purpose"),
  });
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
        explanation: normalizeStoredExplanation(item.explanation),
        loan: { id: item.loan.id, status: item.loan.status, principalSatang: item.loan.principalSatang.toString(), fundedSatang: item.loan.fundedSatang.toString(), remainingFundingSatang: (item.loan.principalSatang - item.loan.fundedSatang).toString(), annualInterestRate: item.loan.annualInterestRate.toString(), termMonths: item.loan.termMonths, fundingDeadline: item.loan.fundingDeadline },
      })),
    });
  } catch (error) { return apiErrorResponseFrom(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireInvestor(request);
    const preferenceRow = await prisma.investorPreference.findUnique({ where: { investorProfileId: identity.investorProfile.id }, select: { preferenceData: true } });
    if (!preferenceRow) throw new ApiError("INVESTOR_PREFERENCES_REQUIRED", "Set investor preferences before requesting recommendations.", 409);
    const preferences = normalizeInvestorPreference(preferenceRow.preferenceData);
    if (!preferences) throw new ApiError("INVESTOR_PREFERENCES_INVALID", "Stored investor preferences are invalid.", 409);

    const startedAt = Date.now();
    const now = new Date();
    const loans = await prisma.loan.findMany({
      where: { status: "FUNDING", fundingDeadline: { gt: now }, escrowAccount: { is: { status: "OPEN" } } },
      orderBy: [{ fundingDeadline: "asc" }, { id: "asc" }],
      take: 200,
      select: {
        id: true, principalSatang: true, fundedSatang: true, annualInterestRate: true, termMonths: true, status: true, fundingDeadline: true,
        escrowAccount: { select: { status: true } },
        acceptedOffer: { select: { applicationVersion: { select: { submittedData: true } } } },
      },
    });
    const candidates = loans.flatMap((loan) => {
      if (!safeEligibleLoan(loan, now)) return [];
      const purpose = loanPurpose(loan.acceptedOffer.applicationVersion.submittedData);
      if (!purpose) return [];
      return [{
        ...publicCandidate({ ...loan, purpose }),
        principalSatang: loan.principalSatang.toString(),
        fundedSatang: loan.fundedSatang.toString(),
      }];
    });
    const ranked = rankLoansByPreference(preferences, candidates);
    const latencyMs = Math.max(0, Date.now() - startedAt);

    const persisted = await prisma.$transaction(async (tx) => {
      const currentRows = ranked.length ? await tx.loan.findMany({
        where: { id: { in: ranked.map(({ loanId }) => loanId) }, status: "FUNDING", fundingDeadline: { gt: new Date() }, escrowAccount: { is: { status: "OPEN" } } },
        select: {
          id: true, principalSatang: true, fundedSatang: true, annualInterestRate: true, termMonths: true, status: true, fundingDeadline: true,
          escrowAccount: { select: { status: true } },
          acceptedOffer: { select: { applicationVersion: { select: { submittedData: true } } } },
        },
      }) : [];
      const currentCandidates = currentRows.flatMap((loan) => {
        if (!safeEligibleLoan(loan, new Date())) return [];
        const purpose = loanPurpose(loan.acceptedOffer.applicationVersion.submittedData);
        if (!purpose) return [];
        return [{ ...publicCandidate({ ...loan, purpose }), principalSatang: loan.principalSatang.toString(), fundedSatang: loan.fundedSatang.toString() }];
      });
      const currentRanked = rankLoansByPreference(preferences, currentCandidates);
      const candidateById = new Map(currentCandidates.map((candidate) => [candidate.loanId, candidate]));
      const capturedAt = new Date().toISOString();
      const run = await tx.recommendationRun.create({
        data: {
          investorProfileId: identity.investorProfile.id,
          modelVersionId: null,
          inputVersion: "nexus_investor_preference_match.v1",
          latencyMs,
          preferenceSnapshot: preferenceSnapshot(preferences, capturedAt) as unknown as Prisma.InputJsonValue,
          candidateSetSnapshot: candidateSnapshot(currentCandidates, capturedAt) as unknown as Prisma.InputJsonValue,
        },
        select: { id: true, createdAt: true, modelVersionId: true },
      });
      if (currentRanked.length) {
        await tx.recommendationResult.createMany({ data: currentRanked.map((item, index) => ({
          recommendationRunId: run.id,
          loanId: item.loanId,
          matchScore: new Prisma.Decimal(item.score.toString()),
          rankingPosition: index + 1,
          explanation: persistedExplanation(item.featureScores) as unknown as Prisma.InputJsonValue,
        })) });
      }
      return { run, ranked: currentRanked, candidateById };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });

    return apiSuccessResponse({
      recommendationRunId: persisted.run.id,
      modelVersionId: persisted.run.modelVersionId,
      inputVersion: "nexus_investor_preference_match.v1",
      createdAt: persisted.run.createdAt,
      latencyMs,
      isStale: false,
      recommendations: persisted.ranked.map((item, index) => {
        const candidate = persisted.candidateById.get(item.loanId)!;
        return {
          loanId: item.loanId,
          score: item.score.toString(),
          rankingPosition: index + 1,
          explanation: persistedExplanation(item.featureScores),
          loan: {
            id: candidate.loanId,
            status: "FUNDING",
            principalSatang: candidate.principalSatang,
            fundedSatang: candidate.fundedSatang,
            remainingFundingSatang: String(candidate.remainingFundingSatang),
            annualInterestRate: String(candidate.annualInterestRate),
            termMonths: candidate.termMonths,
            loanPurpose: candidate.loanPurpose,
            fundingDeadline: candidate.fundingDeadline,
          },
        };
      }),
    }, { status: 201, message: "Investor recommendations refreshed." });
  } catch (error) { return apiErrorResponseFrom(error); }
}
