import { describe, expect, it, vi } from "vitest";
import type { ApiSuccessEnvelope } from "../../../src/lib/client/api-client";
import {
  getInvestorPayoutPath,
  getInvestorPayoutsPath,
  loadInvestorPayout,
  loadInvestorPayouts,
  type InvestorPayoutRecord,
  type InvestorPayoutFetcher,
} from "../../../src/lib/client/investor-payouts";

const payout: InvestorPayoutRecord = {
  id: "payout-1", status: "COMPLETED", principalSatang: "12000", interestSatang: "1000",
  ledgerTransactionId: "payout-ledger-1", completedAt: "2026-11-15T00:00:00.000Z", createdAt: "2026-11-15T00:00:00.000Z",
  payoutAllocation: { id: "allocation-1", repaymentId: "repayment-1", investmentId: "investment-1" },
};

describe("WP9.5 investor payouts client", () => {
  it("uses existing paginated list/detail APIs and supported created-date sorting", async () => {
    expect(getInvestorPayoutsPath({ page: 2, limit: 10, sortOrder: "asc" }))
      .toBe("/api/investor/payouts?page=2&limit=10&sortBy=createdAt&sortOrder=asc");
    const fetcher = vi.fn<InvestorPayoutFetcher>(async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => ({
      success: true, data: (path.includes("?") ? [payout] : { ...payout, payoutAllocation: { repaymentId: "repayment-1", investmentId: "investment-1", repayment: { loanId: "loan-1", ledgerTransactionId: "repayment-ledger-1" } } }) as T, message: "Loaded",
      ...(path.includes("?") ? { pagination: { page: 2, limit: 10, total: 1, totalPages: 1, hasPreviousPage: true, hasNextPage: false } } : {}),
    }));
    const list = await loadInvestorPayouts({ page: 2, limit: 10, sortOrder: "asc" }, fetcher as unknown as InvestorPayoutFetcher);
    const detail = await loadInvestorPayout("payout-1", fetcher as unknown as InvestorPayoutFetcher);
    expect(fetcher).toHaveBeenNthCalledWith(1, getInvestorPayoutsPath({ page: 2, limit: 10, sortOrder: "asc" }), undefined);
    expect(getInvestorPayoutPath("payout/one")).toBe("/api/investor/payouts/payout%2Fone");
    expect(list.data[0].ledgerTransactionId).toBe("payout-ledger-1");
    expect(detail.data.payoutAllocation.repayment.loanId).toBe("loan-1");
  });
});
