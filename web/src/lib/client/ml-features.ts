import { apiGet, apiPost, apiRequest } from "./api-client";

export interface InvestorPreferences {
  schema_version: "nexus_investor_preference.v2";
  interest_rate: { min: number; max: number };
  loan_duration: { min: number; max: number };
  investment_amount: { min: number; max: number };
  loan_purpose: Array<"business" | "education" | "medical" | "personal" | "home" | "other">;
}
export type InvestorPreferencesDraft = Omit<InvestorPreferences, "schema_version" | "interest_rate" | "loan_duration" | "investment_amount"> & {
  interest_rate: { min: string; max: string };
  loan_duration: { min: string; max: string };
  investment_amount: { min: string; max: string };
};

export function buildInvestorPreferencesPayload(draft: InvestorPreferencesDraft): InvestorPreferences {
  return {
    schema_version: "nexus_investor_preference.v2",
    loan_purpose: [...draft.loan_purpose],
    interest_rate: { min: Number(draft.interest_rate.min), max: Number(draft.interest_rate.max) },
    loan_duration: { min: Number(draft.loan_duration.min), max: Number(draft.loan_duration.max) },
    investment_amount: { min: Number(draft.investment_amount.min), max: Number(draft.investment_amount.max) },
  };
}
export interface BorrowerEvaluation {
  predictionRecordId: string;
  featureSnapshotId: string;
  modelVersionId: string;
  predictionType: "PRELIMINARY" | "OFFICIAL" | "DIAGNOSTIC";
  evaluatedAt: string;
  prediction: {
    schema_version: "nexus_prediction_output.v1";
    default_probability: number;
    tier: { tier_code: string; tier_name: string; risk_level: string; action_code: string; rate_markup: number; ui_badge_color: string };
    spatial_metrics: { macro_cluster: number; quantization_distance: number };
  };
}
export interface RecommendationRun {
  recommendationRunId: string;
  modelVersionId: string | null;
  inputVersion: string;
  createdAt: string;
  latencyMs: number;
  isStale: boolean;
  recommendations: Array<{
    recommendationId?: string;
    loanId: string;
    score: string;
    rankingPosition: number;
    explanation: { schema_version: string; algorithm: string; feature_scores: { interest_rate: number; loan_duration: number; investment_amount: number; loan_purpose: number } };
    loan: { id: string; status: string; principalSatang: string; fundedSatang: string; remainingFundingSatang: string; annualInterestRate: string; termMonths: number; loanPurpose?: string; fundingDeadline?: string };
  }>;
}

export interface InvestorPreferencesResponse { preferences: InvestorPreferences | null; updatedAt: string | null }

export type MlRequestFailureDisposition = "retryable" | "uncertain" | "do-not-retry";
export function getMlRequestFailureDisposition(code: string): MlRequestFailureDisposition {
  if (["ML_SERVICE_TIMEOUT", "ML_SERVICE_UNAVAILABLE", "INVALID_ML_RESPONSE"].includes(code)) return "retryable";
  if (code === "NETWORK_ERROR") return "uncertain";
  return "do-not-retry";
}

export function getBorrowerEvaluationPath(): string { return "/api/ml/borrower-evaluation"; }
export function getBorrowerEvaluationRecordPath(evaluationId: string): string { return `${getBorrowerEvaluationPath()}/${encodeURIComponent(evaluationId)}`; }
export function getInvestorPreferencesPath(): string { return "/api/investor/preferences"; }
export function getInvestorRecommendationsPath(runId?: string): string {
  return runId ? `/api/ml/investor-recommendations?${new URLSearchParams({ runId })}` : "/api/ml/investor-recommendations";
}

export async function requestBorrowerEvaluation(applicationId: string): Promise<BorrowerEvaluation> {
  return (await apiPost<BorrowerEvaluation, { applicationId: string }>(getBorrowerEvaluationPath(), { applicationId })).data;
}
export async function loadBorrowerEvaluation(evaluationId: string): Promise<BorrowerEvaluation> {
  return (await apiGet<BorrowerEvaluation>(getBorrowerEvaluationRecordPath(evaluationId))).data;
}
export async function loadInvestorPreferences(): Promise<InvestorPreferencesResponse> {
  return (await apiGet<InvestorPreferencesResponse>(getInvestorPreferencesPath())).data;
}
export async function saveInvestorPreferences(preferences: InvestorPreferences): Promise<InvestorPreferencesResponse> {
  return (await apiRequest<InvestorPreferencesResponse>(getInvestorPreferencesPath(), { method: "PUT", body: JSON.stringify(preferences) })).data;
}
export async function requestInvestorRecommendations(): Promise<RecommendationRun> {
  return (await apiRequest<RecommendationRun>(getInvestorRecommendationsPath(), { method: "POST" })).data;
}
export async function loadInvestorRecommendations(runId?: string): Promise<RecommendationRun> {
  return (await apiGet<RecommendationRun>(getInvestorRecommendationsPath(runId))).data;
}

