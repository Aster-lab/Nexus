import { describe, expect, it, vi } from "vitest";
import type { ApiSuccessEnvelope } from "../../../src/lib/client/api-client";
import {
  BORROWER_DASHBOARD_PATHS,
  createInitialBorrowerDashboardData,
  formatSatang,
  invalidateBorrowerDashboardCache,
  loadBorrowerDashboard,
  notifyBorrowerDashboardMutationComplete,
  subscribeBorrowerDashboardRefresh,
  type DashboardFetcher,
} from "../../../src/lib/client/borrower-dashboard";

describe("WP9.4.1 borrower dashboard data", () => {
  it("reuses a fresh user-scoped dashboard and invalidates it after refresh", async () => {
    const fetcherMock = vi.fn(async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => {
      const data = path === BORROWER_DASHBOARD_PATHS.summary
        ? { activeLoanCount: 0, totalOutstandingBalanceSatang: "0", pendingApplicationCount: 0, availableOfferCount: 0, nextInstallment: null, upcomingInstallments: [], overdueInstallments: [], activeLoans: [] }
        : path === BORROWER_DASHBOARD_PATHS.wallet ? { wallet: null, transactions: [] } : [];
      return { success: true, data: data as T, message: "Loaded" };
    });
    const fetcher = fetcherMock as unknown as DashboardFetcher;
    const cacheKey = "borrower-dashboard-cache-test";

    await loadBorrowerDashboard(fetcher, undefined, undefined, cacheKey);
    await loadBorrowerDashboard(fetcher, undefined, undefined, cacheKey);
    expect(fetcherMock).toHaveBeenCalledTimes(Object.keys(BORROWER_DASHBOARD_PATHS).length);

    invalidateBorrowerDashboardCache(cacheKey);
    await loadBorrowerDashboard(fetcher, undefined, undefined, cacheKey);
    expect(fetcherMock).toHaveBeenCalledTimes(Object.keys(BORROWER_DASHBOARD_PATHS).length * 2);
  });

  it("loads recent applications, loans, and repayments from their read APIs", async () => {
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => {
      calls.push(path);
      const data = path === BORROWER_DASHBOARD_PATHS.summary
        ? {
          activeLoanCount: 0,
          totalOutstandingBalanceSatang: "0",
          pendingApplicationCount: 0,
          availableOfferCount: 0,
          nextInstallment: null,
          upcomingInstallments: [],
          overdueInstallments: [],
        }
        : path === BORROWER_DASHBOARD_PATHS.wallet
          ? { wallet: { id: "wallet-1", balanceSatang: "125000", currency: "THB", status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }, transactions: [], pagination: { page: 1, limit: 5, total: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false } }
          : [];
      return { success: true, data: data as T, message: "Loaded" };
    };

    const dashboard = await loadBorrowerDashboard(fetcher);

    expect(calls).toEqual(Object.values(BORROWER_DASHBOARD_PATHS));
    expect(dashboard.applications.status).toBe("success");
    expect(dashboard.loans.status).toBe("success");
    expect(dashboard.repayments.status).toBe("success");
    expect(dashboard.wallet.status).toBe("success");
  });

  it("keeps successful sections visible when one dashboard request fails", async () => {
    const fetcher = async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => {
      if (path === BORROWER_DASHBOARD_PATHS.repayments) throw new Error("network unavailable");
      if (path === BORROWER_DASHBOARD_PATHS.wallet) return { success: true, data: { wallet: null, transactions: [] } as T, message: "Loaded" };
      return { success: true, data: [{ id: "record-1" }] as unknown as T, message: "Loaded" };
    };

    const dashboard = await loadBorrowerDashboard(fetcher);

    expect(dashboard.applications).toMatchObject({ status: "success", data: [{ id: "record-1" }] });
    expect(dashboard.loans).toMatchObject({ status: "success", data: [{ id: "record-1" }] });
    expect(dashboard.repayments).toMatchObject({ status: "error" });
    expect(dashboard.wallet).toMatchObject({ status: "success" });
  });

  it("starts each dashboard panel in its own loading state", () => {
    const initial = createInitialBorrowerDashboardData();
    expect(initial.summary.status).toBe("loading");
    expect(initial.applications.status).toBe("loading");
    expect(initial.loans.status).toBe("loading");
    expect(initial.repayments.status).toBe("loading");
    expect(initial.wallet.status).toBe("loading");
  });

  it("publishes each completed section without waiting for the slowest request", async () => {
    const resolvers = new Map<string, (value: ApiSuccessEnvelope<unknown>) => void>();
    const updates: string[] = [];
    let summaryArrived!: () => void;
    const receivedSummary = new Promise<void>((resolve) => { summaryArrived = resolve; });
    const fetcher = <T>(path: string): Promise<ApiSuccessEnvelope<T>> => new Promise((resolve) => {
      resolvers.set(path, resolve as (value: ApiSuccessEnvelope<unknown>) => void);
    });

    const loading = loadBorrowerDashboard(fetcher, undefined, (key) => {
      updates.push(key);
      if (key === "summary") summaryArrived();
    });
    resolvers.get(BORROWER_DASHBOARD_PATHS.summary)?.({
      success: true,
      data: {
        activeLoanCount: 2,
        totalOutstandingBalanceSatang: "450000",
        pendingApplicationCount: 1,
        availableOfferCount: 1,
        nextInstallment: null,
        upcomingInstallments: [],
        overdueInstallments: [],
      },
      message: "Loaded",
    });

    await receivedSummary;
    expect(updates).toContain("summary");
    expect(updates).not.toContain("repayments");
    for (const path of Object.values(BORROWER_DASHBOARD_PATHS)) {
      const data = path === BORROWER_DASHBOARD_PATHS.wallet ? { wallet: null, transactions: [] } : [];
      resolvers.get(path)?.({ success: true, data: data as never, message: "Loaded" });
    }
    await loading;
  });

  it("refreshes the dashboard when a successful borrower mutation publishes the refresh event", () => {
    const target = new EventTarget();
    const refresh = vi.fn();
    const unsubscribe = subscribeBorrowerDashboardRefresh(refresh, target);

    notifyBorrowerDashboardMutationComplete(target);
    expect(refresh).toHaveBeenCalledTimes(1);

    unsubscribe();
    notifyBorrowerDashboardMutationComplete(target);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("formats satang exactly without converting the amount through floating point", () => {
    expect(formatSatang("125000")).toBe("฿1,250.00");
    expect(formatSatang("1")).toBe("฿0.01");
    expect(formatSatang("900719925474099312345")).toBe("฿9,007,199,254,740,993,123.45");
    expect(formatSatang("invalid")).toBe("—");
  });
});
