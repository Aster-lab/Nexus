import { describe, expect, it, vi } from "vitest";
import type { ApiSuccessEnvelope } from "../../../src/lib/client/api-client";
import {
  INVESTOR_DASHBOARD_PATHS,
  loadInvestorDashboard,
  notifyInvestorDashboardMutationComplete,
  subscribeInvestorDashboardRefresh,
  type InvestorDashboardFetcher,
  type InvestorDashboardPortfolio,
} from "../../../src/lib/client/investor-dashboard";

describe("WP9.5 investor dashboard client", () => {
  it("loads portfolio, investment, payout, and wallet APIs scoped to the investor", async () => {
    const paths: string[] = [];
    const fetcher = vi.fn<InvestorDashboardFetcher>(async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => {
      paths.push(path);
      const data = path.includes("portfolio")
        ? { investorProfileId: "profile-1", investmentCounts: { active: 2, completed: 1 }, totalInvestedPrincipalSatang: "300000", principalReceivedSatang: "25000", interestReceivedSatang: "4000", outstandingPrincipalSatang: "275000", wallet: { balanceSatang: "80000", currency: "THB", status: "ACTIVE" } }
        : path.includes("/wallet?") ? { wallet: { id: "wallet-1", balanceSatang: "80000", currency: "THB", status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }, transactions: [{ ledgerEntryId: "entry-1", ledgerTransactionId: "txn-1", transactionType: "OPENING_BALANCE", referenceType: "OPENING_BALANCE", referenceId: "opening-1", description: "Initial balance", direction: "CREDIT", amountSatang: "80000", currency: "THB", status: "POSTED", postedAt: "2026-01-01T00:00:00.000Z" }] }
          : [];
      return { success: true, data: data as T, message: "Loaded", ...(path.includes("portfolio") ? {} : { pagination: { page: 1, limit: 5, total: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false } }) };
    });

    const result = await loadInvestorDashboard(fetcher as unknown as InvestorDashboardFetcher);

    expect(paths).toEqual(expect.arrayContaining([
      INVESTOR_DASHBOARD_PATHS.portfolio,
      INVESTOR_DASHBOARD_PATHS.investments,
      INVESTOR_DASHBOARD_PATHS.payouts,
      INVESTOR_DASHBOARD_PATHS.wallet,
    ]));
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(result.portfolio).toMatchObject({ status: "success", data: { totalInvestedPrincipalSatang: "300000", wallet: { balanceSatang: "80000" } } });
    expect(result.investments).toMatchObject({ status: "success", data: [] });
    expect(result.payouts).toMatchObject({ status: "success", data: [] });
    expect(result.wallet).toMatchObject({ status: "success", data: { wallet: { balanceSatang: "80000" }, transactions: [{ transactionType: "OPENING_BALANCE" }] } });
  });

  it("keeps the other dashboard sections usable when one endpoint fails", async () => {
    const portfolio: InvestorDashboardPortfolio = {
      investorProfileId: "profile-1",
      investmentCounts: { active: 0, completed: 0 },
      totalInvestedPrincipalSatang: "0",
      principalReceivedSatang: "0",
      interestReceivedSatang: "0",
      outstandingPrincipalSatang: "0",
      wallet: null,
    };
    const fetcher = vi.fn<InvestorDashboardFetcher>(async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => {
      if (path === INVESTOR_DASHBOARD_PATHS.investments) throw new Error("temporary failure");
      return { success: true, data: (path === INVESTOR_DASHBOARD_PATHS.portfolio ? portfolio : []) as T, message: "Loaded" };
    });

    const result = await loadInvestorDashboard(fetcher as unknown as InvestorDashboardFetcher);

    expect(result.portfolio.status).toBe("success");
    expect(result.investments).toMatchObject({ status: "error" });
    expect(result.payouts).toMatchObject({ status: "success", data: [] });
  });

  it("INV-DASH-08 notifies the dashboard to refresh after an investment mutation", () => {
    const target = new EventTarget();
    const refresh = vi.fn();
    const unsubscribe = subscribeInvestorDashboardRefresh(refresh, target);
    notifyInvestorDashboardMutationComplete(target);
    unsubscribe();
    notifyInvestorDashboardMutationComplete(target);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
