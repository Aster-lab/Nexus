import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BorrowerRepaymentForm } from "../../src/components/borrower/borrower-repayment-form";

describe("WP9.4.6 borrower repayment UI", () => {
  it("REP-FE-01 exposes an accessible initial loading state", () => {
    const markup = renderToStaticMarkup(createElement(BorrowerRepaymentForm, { loanId: "loan-1" }));
    expect(markup).toContain("animate-pulse");
    expect(markup).toContain("Loading repayment information");
    expect(markup).toContain('aria-busy="true"');
  });
});
