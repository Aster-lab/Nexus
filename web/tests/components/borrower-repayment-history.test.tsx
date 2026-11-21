import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BorrowerRepaymentHistoryPage } from "../../src/components/borrower/borrower-repayment-history";
import { BorrowerReceiptPage } from "../../src/components/borrower/borrower-receipt-page";

describe("WP9.4.7 repayment history and receipt UI", () => {
  it("REC-FE-01/08 shows accessible loading states", () => {
    const history = renderToStaticMarkup(createElement(BorrowerRepaymentHistoryPage));
    const receipt = renderToStaticMarkup(createElement(BorrowerReceiptPage, { repaymentId: "repayment-1" }));
    expect(history).toContain("Loading repayment history");
    expect(receipt).toContain("animate-pulse");
    expect(history).toContain('aria-busy="true"');
  });
});
