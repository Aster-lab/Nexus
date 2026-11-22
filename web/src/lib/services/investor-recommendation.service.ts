export interface InvestorPreferenceMatch {
  interest_rate: { min: number; max: number };
  loan_duration: { min: number; max: number };
  investment_amount: { min: number; max: number };
  loan_purpose: string[];
}

export interface PreferenceMatchCandidate {
  loanId: string;
  annualInterestRate: number;
  termMonths: number;
  remainingFundingSatang: number;
  loanPurpose: string;
  fundingDeadline: Date;
}

export interface RankedPreferenceMatch {
  loanId: string;
  score: number;
  featureScores: {
    interest_rate: number;
    loan_duration: number;
    investment_amount: number;
    loan_purpose: number;
  };
}

export const PREFERENCE_MATCH_ALGORITHM = "weighted_preference_match.v1";
export const PREFERENCE_MATCH_WEIGHTS = {
  interest_rate: 0.25,
  loan_duration: 0.25,
  investment_amount: 0.25,
  loan_purpose: 0.25,
} as const;

function rangeFit(value: number, range: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return 0;
  if (value >= range.min && value <= range.max) return 1;
  const distance = value < range.min ? range.min - value : value - range.max;
  const span = range.max - range.min;
  const scale = span > 0 ? span : Math.max(Math.abs(range.min) * 0.1, 1);
  return Math.max(0, 1 - distance / scale);
}

export function rankLoansByPreference(
  preferences: InvestorPreferenceMatch,
  candidates: PreferenceMatchCandidate[],
): Array<RankedPreferenceMatch & { fundingDeadline: Date }> {
  return candidates.map((candidate) => {
    const featureScores = {
      interest_rate: rangeFit(candidate.annualInterestRate * 100, preferences.interest_rate),
      loan_duration: rangeFit(candidate.termMonths, preferences.loan_duration),
      investment_amount: rangeFit(candidate.remainingFundingSatang / 100, preferences.investment_amount),
      loan_purpose: preferences.loan_purpose.includes(candidate.loanPurpose) ? 1 : 0,
    };
    const weightedScore = Object.entries(PREFERENCE_MATCH_WEIGHTS).reduce(
      (score, [key, weight]) => score + featureScores[key as keyof typeof featureScores] * weight,
      0,
    );
    return {
      loanId: candidate.loanId,
      score: Math.round(weightedScore * 1_000_000) / 1_000_000,
      featureScores,
      fundingDeadline: candidate.fundingDeadline,
    };
  }).sort((left, right) =>
    right.score - left.score ||
    left.fundingDeadline.getTime() - right.fundingDeadline.getTime() ||
    left.loanId.localeCompare(right.loanId),
  );
}
