import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BorrowerLoanList } from "../../src/components/borrower/borrower-loan-list";
import { BorrowerLoanDetailsPage } from "../../src/components/borrower/borrower-loan-details";

describe("WP9.4.5 borrower loans UI", () => {
  it("LOAN-01 displays accessible loading states for loan list and details", () => {
    const list = renderToStaticMarkup(createElement(BorrowerLoanList));
    const details = renderToStaticMarkup(createElement(BorrowerLoanDetailsPage, { loanId: "loan-1" }));
    expect(list).toContain("Loading loans");
    expect(list).toContain('aria-busy="true"');
    expect(details).toContain("animate-pulse");
  });
});
