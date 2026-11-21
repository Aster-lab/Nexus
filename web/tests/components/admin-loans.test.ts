import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminLoanDetailPage, AdminLoansPage } from "../../src/components/admin/admin-loans";

describe("WP9.6.3 administrator loan UI", () => {
  it("renders supported status filters and an accessible loading list", () => {
    const html = renderToStaticMarkup(createElement(AdminLoansPage));
    expect(html).toContain("Loan operations");
    expect(html).toContain("FUNDING");
    expect(html).toContain("ACTIVE");
    expect(html).toContain("Loading administrator loans");
  });

  it("loads loan detail before exposing financial actions", () => {
    const html = renderToStaticMarkup(createElement(AdminLoanDetailPage, { loanId: "loan-1" }));
    expect(html).toContain("Loading loan details");
    expect(html).not.toContain("Confirm disbursement");
  });
});
