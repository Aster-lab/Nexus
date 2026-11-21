import { describe, expect, it, vi } from "vitest";
import type { ApiSuccessEnvelope } from "../../../src/lib/client/api-client";
import {
  getInvestorAllocationsPath,
  loadInvestorAllocations,
  type InvestorAllocationRecord,
  type InvestorAllocationsFetcher,
} from "../../../src/lib/client/investor-allocations";

const allocation: InvestorAllocationRecord = {
  id: "allocation-1", principalSatang: "12000", interestSatang: "1000", recoverySatang: "0",
  allocationMethod: "PRO_RATA_LARGEST_REMAINDER", createdAt: "2026-11-15T00:00:00.000Z", investmentId: "investment-1", repaymentId: "repayment-1",
  repayment: { status: "POSTED", receivedAt: "2026-11-15T00:00:00.000Z", loanId: "loan-1", ledgerTransactionId: "repayment-ledger-1" },
  investorPayout: { id: "payout-1", status: "PENDING", principalSatang: "12000", interestSatang: "1000", ledgerTransactionId: null, completedAt: null },
};

describe("WP9.5 investor allocations client", () => {
  it("uses supported pagination and created-date sorting for the existing read-only endpoint", async () => {
    expect(getInvestorAllocationsPath({ page: 2, limit: 10, sortOrder: "asc" }))
      .toBe("/api/investor/allocations?page=2&limit=10&sortBy=createdAt&sortOrder=asc");
    const fetcher = vi.fn<InvestorAllocationsFetcher>(async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => ({
      success: true, data: (path.includes("?") ? [allocation] : []) as T, message: "Loaded",
      ...(path.includes("?") ? { pagination: { page: 2, limit: 10, total: 1, totalPages: 1, hasPreviousPage: true, hasNextPage: false } } : {}),
    }));
    const response = await loadInvestorAllocations({ page: 2, limit: 10, sortOrder: "asc" }, fetcher as unknown as InvestorAllocationsFetcher);
    expect(fetcher).toHaveBeenCalledWith(getInvestorAllocationsPath({ page: 2, limit: 10, sortOrder: "asc" }), undefined);
    expect(response.data[0]).toEqual(allocation);
  });
});
