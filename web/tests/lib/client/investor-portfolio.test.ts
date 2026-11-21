import { describe, expect, it, vi } from "vitest";
import type { ApiSuccessEnvelope } from "../../../src/lib/client/api-client";
import {
  getInvestorInvestmentPath,
  getInvestorInvestmentsPath,
  loadInvestorInvestment,
  loadInvestorInvestments,
  type InvestorInvestmentRecord,
  type InvestorPortfolioFetcher,
} from "../../../src/lib/client/investor-portfolio";

const record: InvestorInvestmentRecord = {
  id: "investment-1", status: "ACTIVE", createdAt: "2026-11-01T00:00:00.000Z", totalContributedSatang: "250000",
  contributionCount: 1, hasMoreContributions: false, allocationCount: 1, hasMoreAllocations: false,
  contributionPagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false },
  allocationPagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false },
  loan: { id: "loan-1", status: "ACTIVE", principalSatang: "1000000", annualInterestRate: "0.12", termMonths: 12 },
  contributions: [{ id: "contribution-1", amountSatang: "250000", createdAt: "2026-11-01T00:00:00.000Z", ledgerTransaction: { id: "ledger-1", status: "POSTED" } }],
  payoutAllocation: [{ id: "allocation-1", principalSatang: "12000", interestSatang: "1000", recoverySatang: "0", repaymentId: "repayment-1", investorPayout: { id: "payout-1", status: "PENDING", principalSatang: "12000", interestSatang: "1000", ledgerTransactionId: null, completedAt: null } }],
};

describe("WP9.5 investor portfolio client", () => {
  it("uses only the investment API's supported pagination and created-date sorting", async () => {
    expect(getInvestorInvestmentsPath({ page: 2, limit: 10, sortOrder: "asc" }))
      .toBe("/api/investor/investments?page=2&limit=10&sortBy=createdAt&sortOrder=asc");
    const fetcher = vi.fn<InvestorPortfolioFetcher>(async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => ({
      success: true, data: (path.includes("sortBy=") ? [record] : record) as T, message: "Loaded",
      ...(path.includes("sortBy=") ? { pagination: { page: 2, limit: 10, total: 1, totalPages: 1, hasPreviousPage: true, hasNextPage: false } } : {}),
    }));
    const list = await loadInvestorInvestments({ page: 2, limit: 10, sortOrder: "asc" }, fetcher as unknown as InvestorPortfolioFetcher);
    const detail = await loadInvestorInvestment("investment/one", fetcher as unknown as InvestorPortfolioFetcher);
    expect(fetcher).toHaveBeenNthCalledWith(1, getInvestorInvestmentsPath({ page: 2, limit: 10, sortOrder: "asc" }), undefined);
    expect(getInvestorInvestmentPath("investment/one")).toBe("/api/investor/investments/investment%2Fone");
    const history = { contributionPage: 2, allocationPage: 3, contributionLimit: 5, allocationLimit: 20 };
    const detailPage = await loadInvestorInvestment("investment/one", fetcher as unknown as InvestorPortfolioFetcher, undefined, history);
    expect(getInvestorInvestmentPath("investment/one", history)).toBe("/api/investor/investments/investment%2Fone?contributionPage=2&contributionLimit=5&allocationPage=3&allocationLimit=20");
    expect(fetcher).toHaveBeenNthCalledWith(3, getInvestorInvestmentPath("investment/one", history), undefined);
    expect(list.data[0].totalContributedSatang).toBe("250000");
    expect(detail.data.payoutAllocation[0].investorPayout?.status).toBe("PENDING");
    expect(detailPage.data.contributionPagination.page).toBe(1);
  });
});
