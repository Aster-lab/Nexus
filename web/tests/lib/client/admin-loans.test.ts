import { describe, expect, it } from "vitest";
import {
  canAdminDisburseLoan,
  getAdminLoanFundingPath,
  getAdminLoanPath,
  getAdminLoansPath,
} from "../../../src/lib/client/admin-loans";

describe("WP9.6.3 administrator loan client", () => {
  it("builds paths using only supported loan, funding, and status filters", () => {
    expect(getAdminLoansPath({ page: 1, limit: 10, status: "FUNDED", sortBy: "fundingDeadline", sortOrder: "asc" }))
      .toBe("/api/admin/loans?page=1&limit=10&sortBy=fundingDeadline&sortOrder=asc&status=FUNDED");
    expect(getAdminLoanPath("loan/1")).toBe("/api/admin/loans/loan%2F1");
    expect(getAdminLoanFundingPath("loan/1")).toBe("/api/admin/loans/loan%2F1/funding");
  });

  it("offers the disbursement control only for loans reported FUNDED", () => {
    expect(canAdminDisburseLoan("FUNDED")).toBe(true);
    expect(canAdminDisburseLoan("FUNDING")).toBe(false);
    expect(canAdminDisburseLoan("ACTIVE")).toBe(false);
    expect(canAdminDisburseLoan("REPAID")).toBe(false);
  });
});
