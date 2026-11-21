import { describe, expect, it } from "vitest";
import { getBorrowerEvaluationPath, getBorrowerEvaluationRecordPath, getInvestorPreferencesPath, getInvestorRecommendationsPath, getMlRequestFailureDisposition } from "../../../src/lib/client/ml-features";

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
  it("allows retry only when the ML API confirms that no result was persisted", () => {
    expect(getMlRequestFailureDisposition("ML_SERVICE_TIMEOUT")).toBe("retryable");
    expect(getMlRequestFailureDisposition("ML_SERVICE_UNAVAILABLE")).toBe("retryable");
    expect(getMlRequestFailureDisposition("INVALID_ML_RESPONSE")).toBe("retryable");
    expect(getMlRequestFailureDisposition("NETWORK_ERROR")).toBe("uncertain");
    expect(getMlRequestFailureDisposition("ML_MODEL_UNAVAILABLE")).toBe("do-not-retry");
    expect(getMlRequestFailureDisposition("APPLICATION_NOT_ELIGIBLE")).toBe("do-not-retry");
  });
});
