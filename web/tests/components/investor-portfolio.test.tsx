import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvestorPortfolioPage, InvestorInvestmentDetailsPage } from "../../src/components/investor/investor-portfolio";
import type { InvestorInvestmentRecord } from "../../src/lib/client/investor-portfolio";

const investment: InvestorInvestmentRecord = {
  id: "investment-1", status: "ACTIVE", createdAt: "2026-11-01T00:00:00.000Z", totalContributedSatang: "250000",
  contributionCount: 1, hasMoreContributions: false, allocationCount: 1, hasMoreAllocations: false,
  contributionPagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false },
  allocationPagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false },
  loan: { id: "loan-1", status: "ACTIVE", principalSatang: "1000000", annualInterestRate: "0.12", termMonths: 12 },
  contributions: [{ id: "contribution-1", amountSatang: "250000", createdAt: "2026-11-01T00:00:00.000Z", ledgerTransaction: { id: "ledger-1", status: "POSTED" } }],
  payoutAllocation: [{ id: "allocation-1", principalSatang: "12000", interestSatang: "1000", recoverySatang: "0", repaymentId: "repayment-1", investorPayout: { id: "payout-1", status: "PENDING", principalSatang: "12000", interestSatang: "1000", ledgerTransactionId: null, completedAt: null } }],
};

describe("WP9.5 investor portfolio UI", () => {
  it("INV-PORT-01/07 presents an accessible list loading state", () => {
    const html = renderToStaticMarkup(createElement(InvestorPortfolioPage));
    expect(html).toContain("Loading investments");
    expect(html).toContain('aria-busy="true"');
  });

  it("INV-PORT-02 handles an empty portfolio", () => {
    const html = renderToStaticMarkup(createElement(InvestorPortfolioPage, { initialInvestments: [], initialStatus: "success" }));
    expect(html).toContain("No investments yet");
  });

  it("INV-PORT-03/05/06 distinguishes invested principal, allocation, and unpaid payout", () => {
    const html = renderToStaticMarkup(createElement(InvestorInvestmentDetailsPage, { investmentId: investment.id, initialInvestment: investment }));
    expect(html).toContain("฿2,500.00");
    expect(html).toContain("฿120.00");
    expect(html).toContain("฿10.00");
    expect(html).toContain("Not credited to your wallet");
    expect(html).toContain("Loan status");
  });
});
