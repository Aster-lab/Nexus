import { describe, expect, it, vi } from "vitest";
import type { ApiSuccessEnvelope } from "../../../src/lib/client/api-client";
import { getBorrowerLoanPath, getBorrowerLoansPath, getBorrowerSchedulePath, hasBorrowerLoans, loadBorrowerLoan, loadBorrowerLoans, loadBorrowerSchedule, type BorrowerLoanFetcher } from "../../../src/lib/client/borrower-loans";

describe("WP9.4.5 borrower loans client", () => {
  it("distinguishes an empty loan list from paginated loan results", () => {
    expect(hasBorrowerLoans([], { page: 1, limit: 10, total: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false })).toBe(false);
    expect(hasBorrowerLoans([], { page: 2, limit: 10, total: 12, totalPages: 2, hasPreviousPage: true, hasNextPage: false })).toBe(true);
  });

  it("uses paginated loan list, loan detail, and schedule API routes", async () => {
    expect(getBorrowerLoansPath({ page: 2, limit: 10, sortOrder: "asc" }))
      .toBe("/api/borrower/loans?page=2&limit=10&sortBy=createdAt&sortOrder=asc");
    expect(getBorrowerLoanPath("loan/1")).toBe("/api/borrower/loans/loan%2F1");
    expect(getBorrowerSchedulePath("loan/1")).toBe("/api/borrower/loans/loan%2F1/schedule");
    const fetcher = vi.fn<BorrowerLoanFetcher>(async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => ({
      success: true,
      data: (path.includes("/schedule") ? { installments: [{ totalDueSatang: "12000", status: "PENDING" }] } : []) as T,
      message: "Loaded",
    }));
    await loadBorrowerLoans({ page: 2, limit: 10, sortOrder: "asc" }, fetcher as unknown as BorrowerLoanFetcher);
    await loadBorrowerLoan("loan/1", fetcher as unknown as BorrowerLoanFetcher);
    const schedule = await loadBorrowerSchedule("loan/1", fetcher as unknown as BorrowerLoanFetcher);
    expect(schedule.data.installments[0]).toMatchObject({ totalDueSatang: "12000", status: "PENDING" });
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      "/api/borrower/loans?page=2&limit=10&sortBy=createdAt&sortOrder=asc",
      "/api/borrower/loans/loan%2F1",
      "/api/borrower/loans/loan%2F1/schedule",
    ]);
  });
});
