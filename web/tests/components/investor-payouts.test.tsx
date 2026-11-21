import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvestorPayoutHistoryPage, InvestorPayoutDetailsPage } from "../../src/components/investor/investor-payouts";
import type { InvestorPayoutRecord } from "../../src/lib/client/investor-payouts";

const payout: InvestorPayoutRecord = {
  id: "payout-1", status: "COMPLETED", principalSatang: "12000", interestSatang: "1000",
  ledgerTransactionId: "payout-ledger-1", completedAt: "2026-11-15T00:00:00.000Z", createdAt: "2026-11-15T00:00:00.000Z",
  payoutAllocation: { id: "allocation-1", repaymentId: "repayment-1", investmentId: "investment-1" },
};
const payoutDetail = { ...payout, walletId: "wallet-1", payoutAllocationId: "allocation-1", payoutAllocation: { repaymentId: "repayment-1", investmentId: "investment-1", repayment: { loanId: "loan-1", ledgerTransactionId: "repayment-ledger-1" } } };

describe("WP9.5 investor payout UI", () => {
  it("INV-PAYOUT-01/02 displays accessible history loading and empty states", () => {
    const loading = renderToStaticMarkup(createElement(InvestorPayoutHistoryPage));
    const empty = renderToStaticMarkup(createElement(InvestorPayoutHistoryPage, { initialPayouts: [], initialStatus: "success" }));
    expect(loading).toContain("Loading payout history");
    expect(loading).toContain('aria-busy="true"');
    expect(empty).toContain("No payouts yet");
  });

  it("INV-PAYOUT-03/04/05/08 renders actual status without investor retry controls", () => {
    const completed = renderToStaticMarkup(createElement(InvestorPayoutHistoryPage, { initialPayouts: [payout], initialStatus: "success" }));
    const failed = renderToStaticMarkup(createElement(InvestorPayoutHistoryPage, { initialPayouts: [{ ...payout, status: "FAILED", ledgerTransactionId: null, completedAt: null }], initialStatus: "success" }));
    expect(completed).toContain("Credited to simulated wallet");
    expect(failed).toContain("Administrator retry");
    expect(failed).not.toContain("Retry payout");
    expect(completed).not.toContain("Request payout");
  });

  it("INV-PAYOUT-06 shows payout, investment, repayment, and loan references", () => {
    const html = renderToStaticMarkup(createElement(InvestorPayoutDetailsPage, { payoutId: payout.id, initialPayout: payoutDetail }));
    expect(html).toContain("payout-ledger-1");
    expect(html).toContain("investment-1");
    expect(html).toContain("repayment-1");
    expect(html).toContain("loan-1");
    expect(html).toContain("฿120.00");
    expect(html).toContain("฿10.00");
  });
});
