import { ApiClientError, apiPost, type ApiPostOptions, type ApiSuccessEnvelope } from "./api-client";

export interface InvestorContributionResult {
  contributionId: string;
  investmentId: string;
  loanId: string;
  amountSatang: string;
  ledgerTransactionId: string;
  ledgerStatus: string;
  createdAt: string;
}

export type InvestorContributionPoster = <T, TBody>(path: string, body: TBody, options?: ApiPostOptions) => Promise<ApiSuccessEnvelope<T>>;

export type InvestorContributionValidationCode = "REQUIRED" | "FORMAT" | "PRECISION" | "POSITIVE" | "AMOUNT_LIMIT" | "ABOVE_WALLET" | "ABOVE_CAPACITY" | "LIMIT_UNAVAILABLE";

export function parseInvestorAmountToSatang(value: string): string | null {
  const normalized = value.trim();
  const valid = normalized.includes(",")
    ? /^(?:0|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(normalized)
    : /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized);
  if (!valid) return null;
  const [whole, fraction = ""] = normalized.replaceAll(",", "").split(".");
  try { return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))).toString(); }
  catch { return null; }
}

export function validateInvestorContributionAmount(
  value: string,
  walletBalanceSatang: string,
  remainingFundingSatang: string,
): { code: InvestorContributionValidationCode | null; amountSatang?: string } {
  if (!value.trim()) return { code: "REQUIRED" };
  if (/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{3,})$/.test(value.trim())) return { code: "PRECISION" };
  const amountSatang = parseInvestorAmountToSatang(value);
  if (amountSatang === null) return { code: "FORMAT" };
  if (BigInt(amountSatang) <= 0n) return { code: "POSITIVE" };
  if (amountSatang.length > 20) return { code: "AMOUNT_LIMIT" };
  if (!/^(0|[1-9]\d*)$/.test(walletBalanceSatang) || !/^(0|[1-9]\d*)$/.test(remainingFundingSatang)) return { code: "LIMIT_UNAVAILABLE" };
  if (BigInt(amountSatang) > BigInt(walletBalanceSatang)) return { code: "ABOVE_WALLET" };
  if (BigInt(amountSatang) > BigInt(remainingFundingSatang)) return { code: "ABOVE_CAPACITY" };
  return { code: null, amountSatang };
}

export function createInvestorContributionIdempotencyKey(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error("Secure request keys are unavailable in this browser.");
  return `investment-${globalThis.crypto.randomUUID()}`;
}

export async function submitInvestorContribution(
  body: { loanId: string; amountSatang: string },
  idempotencyKey: string,
  poster: InvestorContributionPoster = apiPost,
  options: Omit<ApiPostOptions, "idempotencyKey"> = {},
): Promise<ApiSuccessEnvelope<InvestorContributionResult>> {
  return poster<InvestorContributionResult, typeof body>("/api/investor/investments", body, { ...options, idempotencyKey });
}

export function isInvestorContributionOutcomeUncertain(error: unknown): boolean {
  if (error instanceof ApiClientError) return error.status === 0 || error.status === 408 || error.status >= 500;
  if (error instanceof Error && error.name === "AbortError") return true;
  return true;
}
