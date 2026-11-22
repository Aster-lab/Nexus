import { describe, expect, it } from "vitest";
import { rankLoansByPreference, type PreferenceMatchCandidate, type InvestorPreferenceMatch } from "../../../src/lib/services/investor-recommendation.service";

const preferences: InvestorPreferenceMatch = {
  interest_rate: { min: 10, max: 14 },
  loan_duration: { min: 6, max: 12 },
  investment_amount: { min: 1000, max: 10_000 },
  loan_purpose: ["education"],
};

function candidate(overrides: Partial<PreferenceMatchCandidate> = {}): PreferenceMatchCandidate {
  return {
    loanId: "loan-match-1",
    annualInterestRate: 0.12,
    termMonths: 9,
    remainingFundingSatang: 500_000,
    loanPurpose: "education",
    fundingDeadline: new Date("2026-12-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("investor preference-only recommendation ranking", () => {
  it("gives a full preference match the maximum score without risk fields", () => {
    const [ranked] = rankLoansByPreference(preferences, [candidate()]);

    expect(ranked.score).toBe(1);
    expect(ranked.featureScores).toEqual({ interest_rate: 1, loan_duration: 1, investment_amount: 1, loan_purpose: 1 });
    expect(Object.keys(ranked.featureScores)).not.toContain("risk_tier");
  });

  it("reduces the score for mismatched ranges and purpose", () => {
    const [ranked] = rankLoansByPreference(preferences, [candidate({ annualInterestRate: 0.2, termMonths: 24, remainingFundingSatang: 20_000_000, loanPurpose: "medical" })]);

    expect(ranked.score).toBeLessThan(1);
    expect(ranked.featureScores.loan_purpose).toBe(0);
    expect(ranked.featureScores.interest_rate).toBeLessThan(1);
  });

  it("ranks stronger preference matches first and uses deadline as a stable tie-breaker", () => {
    const [best, next] = rankLoansByPreference(preferences, [
      candidate({ loanId: "later", fundingDeadline: new Date("2026-12-03T00:00:00.000Z") }),
      candidate({ loanId: "near", fundingDeadline: new Date("2026-11-30T00:00:00.000Z") }),
      candidate({ loanId: "weak", loanPurpose: "medical" }),
    ]);

    expect([best.loanId, next.loanId]).toEqual(["near", "later"]);
  });
});
