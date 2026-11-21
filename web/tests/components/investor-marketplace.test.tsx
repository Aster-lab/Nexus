import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvestorMarketplaceListPage, InvestorMarketplaceDetailPage } from "../../src/components/investor/investor-marketplace";
import type { InvestorMarketplaceOpportunity } from "../../src/lib/client/investor-marketplace";

const opportunity: InvestorMarketplaceOpportunity = {
  id: "loan-1", status: "FUNDING", principalSatang: "5000000", fundedSatang: "1500000",
  remainingFundingSatang: "3500000", annualInterestRate: "0.12", termMonths: 12,
  fundingDeadline: "2026-12-01T00:00:00.000Z", createdAt: "2026-11-01T00:00:00.000Z",
};

describe("WP9.5 investor marketplace", () => {
  it("INV-MKT-01/06 presents loading state for the opportunity list", () => {
    const html = renderToStaticMarkup(createElement(InvestorMarketplaceListPage));
    expect(html).toContain("Loading investment opportunities");
    expect(html).toContain('aria-busy="true"');
  });

  it("INV-MKT-02 handles an empty marketplace", () => {
    const html = renderToStaticMarkup(createElement(InvestorMarketplaceListPage, { initialOpportunities: [], initialStatus: "success" }));
    expect(html).toContain("No opportunities are available right now");
  });

  it("INV-MKT-06 gives a retryable error when the marketplace cannot load", () => {
    const html = renderToStaticMarkup(createElement(InvestorMarketplaceListPage, { initialStatus: "error", initialError: "Marketplace request failed." }));
    expect(html).toContain("Marketplace request failed.");
    expect(html).toContain("Retry");
  });

  it("INV-MKT-03/05 displays public loan terms and backend eligibility only", () => {
    const html = renderToStaticMarkup(createElement(InvestorMarketplaceDetailPage, { loanId: "loan-1", initialOpportunity: opportunity }));
    expect(html).toContain("฿50,000.00");
    expect(html).toContain("฿35,000.00");
    expect(html).toContain("12% p.a.");
    expect(html).toContain("12 months");
    expect(html).toContain("No borrower identity");
    expect(html).not.toContain("borrowerEmail");
  });

  it("INV-MKT-05 handles an opportunity that is no longer available", () => {
    const html = renderToStaticMarkup(createElement(InvestorMarketplaceDetailPage, { loanId: "loan-1", initialError: "The requested marketplace loan was not found." }));
    expect(html).toContain("Opportunity unavailable");
    expect(html).toContain("Refresh eligibility");
  });
});
