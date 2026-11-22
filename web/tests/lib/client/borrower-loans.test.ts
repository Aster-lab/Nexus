import { describe, expect, it, vi } from "vitest";
import type { ApiSuccessEnvelope } from "../../../src/lib/client/api-client";
import { confirmBorrowerDisbursement, getBorrowerLoanPath, getBorrowerLoansPath, getBorrowerSchedulePath, hasBorrowerLoans, loadBorrowerLoan, loadBorrowerLoans, loadBorrowerSchedule, type BorrowerLoanFetcher } from "../../../src/lib/client/borrower-loans";

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

  it("posts explicit borrower confirmation to the owned loan consent route", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { loanId: "loan-1", confirmedAt: "2026-11-22T00:00:00.000Z", alreadyConfirmed: false },
      message: "Borrower disbursement confirmation recorded.",
    }), { status: 201, headers: { "content-type": "application/json" } }));

    const response = await confirmBorrowerDisbursement("loan-1", fetcher);

    expect(response.data.alreadyConfirmed).toBe(false);
    expect(fetcher).toHaveBeenCalledWith("/api/borrower/loans/loan-1/disbursement-consent", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ confirmDisbursement: true }),
    }));
  });
});
