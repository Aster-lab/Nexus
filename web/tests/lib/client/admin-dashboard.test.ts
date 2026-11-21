import { describe, expect, it } from "vitest";
import type { ApiSuccessEnvelope } from "../../../src/lib/client/api-client";
import {
  getAdminDashboardPath,
  loadAdminDashboardApplications,
  loadAdminDashboardLoans,
  loadAdminDashboardUsers,
  loadAdminRecentAuditLogs,
  loadAdminRecentRepayments,
  type AdminDashboardFetcher,
} from "../../../src/lib/client/admin-dashboard";

function response<T>(data: T, total = Array.isArray(data) ? data.length : 1): ApiSuccessEnvelope<T> {
  return {
    success: true,
    message: "Loaded",
    data,
    pagination: {
      page: 1,
      limit: 5,
      total,
      totalPages: Math.ceil(total / 5),
      hasPreviousPage: false,
      hasNextPage: total > 5,
    },
  };
}

describe("WP9.6 administrator dashboard client", () => {
  it("builds paths only from supported admin API filters and sorting", () => {
    expect(getAdminDashboardPath("applications", { status: "SUBMITTED", limit: 1 }))
      .toBe("/api/admin/applications?status=SUBMITTED&limit=1");
    expect(getAdminDashboardPath("audit-logs", { limit: 5, sortBy: "createdAt", sortOrder: "desc" }))
      .toBe("/api/admin/audit-logs?limit=5&sortBy=createdAt&sortOrder=desc");
  });

  it("uses backend pagination totals for user, application, and loan summaries", async () => {
    const calls: string[] = [];
    const fetcher: AdminDashboardFetcher = async <T>(path: string) => {
      calls.push(path);
      const total = path.includes("role=BORROWER") ? 8
        : path.includes("role=INVESTOR") ? 4
        : path.includes("/users?") ? 15
        : path.includes("UNDER_REVIEW") ? 3
        : path.includes("INFORMATION_REQUESTED") ? 2
        : path.includes("SUBMITTED") ? 1
        : path.includes("ACTIVE") ? 6
        : 0;
      return response([] as T, total);
    };

    await expect(loadAdminDashboardUsers(fetcher)).resolves.toEqual({ total: 15, borrowers: 8, investors: 4 });
    await expect(loadAdminDashboardApplications(fetcher)).resolves.toEqual({ total: 6 });
    await expect(loadAdminDashboardLoans(fetcher)).resolves.toEqual({ active: 6 });
    expect(calls).toHaveLength(7);
  });

  it("loads recent repayment and audit rows from their admin read endpoints", async () => {
    const repayment = { id: "repayment-1", loanId: "loan-1", totalSatang: "10000" };
    const audit = { id: "audit-1", action: "ADMIN_DECISION", outcome: "SUCCESS" };
    const fetcher: AdminDashboardFetcher = async <T>(path: string) => response(
      (path.includes("repayments") ? [repayment] : [audit]) as T,
    );

    await expect(loadAdminRecentRepayments(fetcher)).resolves.toEqual([repayment]);
    await expect(loadAdminRecentAuditLogs(fetcher)).resolves.toEqual([audit]);
  });

  it("forwards an abort signal so abandoned dashboard requests can be cancelled", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const fetcher: AdminDashboardFetcher = async <T>(_path: string, options?: { signal?: AbortSignal }) => {
      receivedSignal = options?.signal;
      return response([] as T, 0);
    };

    await loadAdminDashboardLoans(fetcher, controller.signal);

    expect(receivedSignal).toBe(controller.signal);
  });
});
