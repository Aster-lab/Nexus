import { describe, expect, it, vi } from "vitest";
import type { ApiSuccessEnvelope } from "../../../src/lib/client/api-client";
import {
  getInvestorMarketplaceDetailPath,
  getInvestorMarketplacePath,
  loadInvestorMarketplace,
  loadInvestorMarketplaceDetail,
  type InvestorMarketplaceOpportunity,
  type InvestorMarketplaceFetcher,
} from "../../../src/lib/client/investor-marketplace";

const opportunity: InvestorMarketplaceOpportunity = {
  id: "loan-1", status: "FUNDING", principalSatang: "5000000", fundedSatang: "1500000",
  remainingFundingSatang: "3500000", annualInterestRate: "0.12", termMonths: 12,
  fundingDeadline: "2026-12-01T00:00:00.000Z", createdAt: "2026-11-01T00:00:00.000Z",
};

describe("WP9.5 investment marketplace client", () => {
  it("requests only supported pagination and sorting parameters", async () => {
    expect(getInvestorMarketplacePath({ page: 2, limit: 10, sortBy: "fundingDeadline", sortOrder: "asc" }))
      .toBe("/api/investor/marketplace?page=2&limit=10&sortBy=fundingDeadline&sortOrder=asc");
    const fetcher = vi.fn<InvestorMarketplaceFetcher>(async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => ({
      success: true, data: (path.includes("marketplace?") ? [opportunity] : opportunity) as T, message: "Loaded",
      ...(path.includes("marketplace?") ? { pagination: { page: 2, limit: 10, total: 1, totalPages: 1, hasPreviousPage: true, hasNextPage: false } } : {}),
    }));

    const list = await loadInvestorMarketplace({ page: 2, limit: 10, sortBy: "fundingDeadline", sortOrder: "asc" }, fetcher as unknown as InvestorMarketplaceFetcher);
    const detail = await loadInvestorMarketplaceDetail("loan/one", fetcher as unknown as InvestorMarketplaceFetcher);

    expect(fetcher).toHaveBeenNthCalledWith(1, getInvestorMarketplacePath({ page: 2, limit: 10, sortBy: "fundingDeadline", sortOrder: "asc" }), undefined);
    expect(getInvestorMarketplaceDetailPath("loan/one")).toBe("/api/investor/marketplace/loan%2Fone");
    expect(list.data[0]).toEqual(opportunity);
    expect(detail.data).toEqual(opportunity);
  });

  it("does not add unsupported marketplace filters", () => {
    const path = getInvestorMarketplacePath({ page: 1, limit: 20, sortBy: "createdAt", sortOrder: "desc" });
    expect(path).not.toContain("termMonths");
    expect(path).not.toContain("status=");
    expect(path).not.toContain("minRate");
  });
});
