import { describe, expect, it } from "vitest";
import { getAdminRepaymentAllocationsPath, getAdminRepaymentsPath } from "../../../src/lib/client/admin-repayments";

describe("WP9.6.4 administrator repayment client", () => {
  it("builds a repayment query using only supported status, loan, pagination, and sort fields", () => {
    expect(getAdminRepaymentsPath({ page: 2, limit: 10, status: "POSTED", loanId: "loan-1", sortBy: "receivedAt", sortOrder: "asc" }))
      .toBe("/api/admin/repayments?page=2&limit=10&sortBy=receivedAt&sortOrder=asc&status=POSTED&loanId=loan-1");
    expect(getAdminRepaymentsPath({ page: 1, limit: 20, status: "ALL", loanId: "", sortBy: "createdAt", sortOrder: "desc" }))
      .toBe("/api/admin/repayments?page=1&limit=20&sortBy=createdAt&sortOrder=desc");
  });

  it("builds a paginated path for one repayment's complete allocation history", () => {
    expect(getAdminRepaymentAllocationsPath("repayment/one", 2, 25))
      .toBe("/api/admin/repayments/repayment%2Fone/allocations?page=2&limit=25");
  });
});
