import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvestorInvestmentFormPage } from "../../src/components/investor/investor-investment-form";

describe("WP9.5 investor investment form", () => {
  it("INV-INVEST-01 shows an accessible loading state before wallet and opportunity are confirmed", () => {
    const html = renderToStaticMarkup(createElement(InvestorInvestmentFormPage, { loanId: "loan-1" }));
    expect(html).toContain("Loading investment information");
    expect(html).toContain('aria-busy="true"');
  });
});
