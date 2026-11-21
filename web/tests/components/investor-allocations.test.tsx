import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvestorAllocationHistoryPage } from "../../src/components/investor/investor-allocations";
import type { InvestorAllocationRecord } from "../../src/lib/client/investor-allocations";

const allocation: InvestorAllocationRecord = {
  id: "allocation-1", principalSatang: "12000", interestSatang: "1000", recoverySatang: "0",
  allocationMethod: "PRO_RATA_LARGEST_REMAINDER", createdAt: "2026-11-15T00:00:00.000Z", investmentId: "investment-1", repaymentId: "repayment-1",
  repayment: { status: "POSTED", receivedAt: "2026-11-15T00:00:00.000Z", loanId: "loan-1", ledgerTransactionId: "repayment-ledger-1" },
  investorPayout: { id: "payout-1", status: "PENDING", principalSatang: "12000", interestSatang: "1000", ledgerTransactionId: null, completedAt: null },
};

describe("WP9.5 investor allocation history", () => {
  it("INV-ALLOC-01/08 exposes accessible loading state", () => {
    const html = renderToStaticMarkup(createElement(InvestorAllocationHistoryPage));
    expect(html).toContain("Loading repayment allocations");
    expect(html).toContain('aria-busy="true"');
  });

  it("INV-ALLOC-02 shows a useful empty state", () => {
    const html = renderToStaticMarkup(createElement(InvestorAllocationHistoryPage, { initialAllocations: [], initialStatus: "success" }));
    expect(html).toContain("No repayment allocations yet");
  });

  it("INV-ALLOC-08 shows a retry action when the allocation API fails", () => {
    const html = renderToStaticMarkup(createElement(InvestorAllocationHistoryPage, { initialStatus: "error", initialError: "Allocation history could not load." }));
    expect(html).toContain("Allocation history could not load.");
    expect(html).toContain("Retry");
  });

  it("INV-ALLOC-03/04/05/06 displays persisted allocation portions without treating them as a wallet credit", () => {
    const html = renderToStaticMarkup(createElement(InvestorAllocationHistoryPage, { initialAllocations: [allocation], initialStatus: "success" }));
    expect(html).toContain("฿120.00");
    expect(html).toContain("฿10.00");
    expect(html).toContain("Pro Rata Largest Remainder");
    expect(html).toContain("Not credited to wallet");
    expect(html).not.toContain("฿130.00");
  });
});
