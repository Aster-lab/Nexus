import { describe, expect, it, vi } from "vitest";
import { ApiClientError, type ApiPostOptions, type ApiSuccessEnvelope } from "../../../src/lib/client/api-client";
import {
  createInvestorContributionIdempotencyKey,
  isInvestorContributionOutcomeUncertain,
  parseInvestorAmountToSatang,
  submitInvestorContribution,
  validateInvestorContributionAmount,
  type InvestorContributionPoster,
  type InvestorContributionResult,
} from "../../../src/lib/client/investor-investments";

const success: InvestorContributionResult = {
  contributionId: "contribution-1", investmentId: "investment-1", loanId: "loan-1", amountSatang: "125050",
  ledgerTransactionId: "ledger-1", ledgerStatus: "POSTED", createdAt: "2026-11-21T00:00:00.000Z",
};

describe("WP9.5 investor contribution client", () => {
  it("parses THB amounts into integer satang without floating point", () => {
    expect(parseInvestorAmountToSatang("1,250.50")).toBe("125050");
    expect(parseInvestorAmountToSatang("0.01")).toBe("1");
    expect(parseInvestorAmountToSatang("1.001")).toBeNull();
    expect(parseInvestorAmountToSatang("1,25")).toBeNull();
  });

  it("validates positive amount, wallet balance, and current opportunity capacity", () => {
    expect(validateInvestorContributionAmount("", "500000", "300000").code).toBe("REQUIRED");
    expect(validateInvestorContributionAmount("0", "500000", "300000").code).toBe("POSITIVE");
    expect(validateInvestorContributionAmount("1.001", "500000", "300000").code).toBe("PRECISION");
    expect(validateInvestorContributionAmount("100000000000000000000", "99999999999999999999", "99999999999999999999").code).toBe("AMOUNT_LIMIT");
    expect(validateInvestorContributionAmount("3000.01", "300000", "500000").code).toBe("ABOVE_WALLET");
    expect(validateInvestorContributionAmount("5000.01", "1000000", "500000").code).toBe("ABOVE_CAPACITY");
    expect(validateInvestorContributionAmount("1250.50", "200000", "300000")).toEqual({ code: null, amountSatang: "125050" });
  });

  it("sends the existing contribution contract and preserves its idempotency key", async () => {
    const poster = vi.fn<InvestorContributionPoster>(async <T, TBody>(path: string, body: TBody, _options?: ApiPostOptions): Promise<ApiSuccessEnvelope<T>> => ({ success: true, data: success as T, message: path + JSON.stringify(body) }));
    const result = await submitInvestorContribution({ loanId: "loan-1", amountSatang: "125050" }, "contribution-attempt-1", poster as unknown as InvestorContributionPoster);
    expect(poster).toHaveBeenCalledWith("/api/investor/investments", { loanId: "loan-1", amountSatang: "125050" }, { idempotencyKey: "contribution-attempt-1" });
    expect(result.data.ledgerStatus).toBe("POSTED");
    expect(createInvestorContributionIdempotencyKey()).toMatch(/^investment-[0-9a-f-]{36}$/i);
  });

  it("treats network, timeout, and server failures as uncertain but validation errors as definitive", () => {
    expect(isInvestorContributionOutcomeUncertain(new ApiClientError(0, "NETWORK_ERROR", "Network error"))).toBe(true);
    expect(isInvestorContributionOutcomeUncertain(new ApiClientError(503, "SERVICE_UNAVAILABLE", "Unavailable"))).toBe(true);
    expect(isInvestorContributionOutcomeUncertain(new ApiClientError(422, "INVESTMENT_REJECTED", "Rejected"))).toBe(false);
    expect(isInvestorContributionOutcomeUncertain(Object.assign(new Error("timeout"), { name: "AbortError" }))).toBe(true);
  });
});
