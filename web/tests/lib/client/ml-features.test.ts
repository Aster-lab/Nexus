import { describe, expect, it } from "vitest";
import { buildInvestorPreferencesPayload, getBorrowerEvaluationPath, getBorrowerEvaluationRecordPath, getInvestorPreferencesPath, getInvestorRecommendationsPath, getMlRequestFailureDisposition } from "../../../src/lib/client/ml-features";
import { InvestorPreferenceContractSchema, normalizeInvestorPreference } from "../../../src/lib/contracts/risk";

describe("WP9.8 machine-learning API client", () => {
  it("submits borrower evaluation using only the saved application reference", () => {
    expect(getBorrowerEvaluationPath()).toBe("/api/ml/borrower-evaluation");
    expect(getBorrowerEvaluationRecordPath("evaluation / 1")).toBe("/api/ml/borrower-evaluation/evaluation%20%2F%201");
  });
  it("uses existing investor preferences and recommendation run APIs", () => {
    expect(getInvestorPreferencesPath()).toBe("/api/investor/preferences");
    expect(getInvestorRecommendationsPath()).toBe("/api/ml/investor-recommendations");
    expect(getInvestorRecommendationsPath("run-1")).toBe("/api/ml/investor-recommendations?runId=run-1");
  });
  it("builds strict-schema preference ranges without UI-only validation fields", () => {
    const payload = buildInvestorPreferencesPayload({
      loan_purpose: ["education"],
      interest_rate: { min: "5", max: "12" },
      loan_duration: { min: "3", max: "24" },
      investment_amount: { min: "1000", max: "50000" },
    });

    expect(Object.keys(payload.interest_rate)).toEqual(["min", "max"]);
    expect(payload.schema_version).toBe("nexus_investor_preference.v2");
    expect("risk_tier" in payload).toBe(false);
    expect(InvestorPreferenceContractSchema.parse(payload)).toEqual(payload);
  });
  it("drops legacy model-dependent risk tiers when normalizing saved preferences", () => {
    expect(normalizeInvestorPreference({ schema_version: "nexus_investor_preference.v1", risk_tier: ["TIER_A"], interest_rate: { min: 5, max: 12 }, loan_duration: { min: 3, max: 24 }, investment_amount: { min: 1000, max: 50000 }, loan_purpose: ["education"] })).toEqual({ schema_version: "nexus_investor_preference.v2", interest_rate: { min: 5, max: 12 }, loan_duration: { min: 3, max: 24 }, investment_amount: { min: 1000, max: 50000 }, loan_purpose: ["education"] });
  });
  it("allows retry only when the ML API confirms that no result was persisted", () => {
    expect(getMlRequestFailureDisposition("ML_SERVICE_TIMEOUT")).toBe("retryable");
    expect(getMlRequestFailureDisposition("ML_SERVICE_UNAVAILABLE")).toBe("retryable");
    expect(getMlRequestFailureDisposition("INVALID_ML_RESPONSE")).toBe("retryable");
    expect(getMlRequestFailureDisposition("NETWORK_ERROR")).toBe("uncertain");
    expect(getMlRequestFailureDisposition("ML_MODEL_UNAVAILABLE")).toBe("do-not-retry");
    expect(getMlRequestFailureDisposition("APPLICATION_NOT_ELIGIBLE")).toBe("do-not-retry");
  });
});
