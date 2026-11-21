import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminRepaymentsPage } from "../../src/components/admin/admin-repayments";

describe("WP9.6.4 administrator repayment UI", () => {
  it("renders API-supported filters and accessible loading state", () => {
    const html = renderToStaticMarkup(createElement(AdminRepaymentsPage));
    expect(html).toContain("Repayment monitoring");
    expect(html).toContain("Repayment status");
    expect(html).toContain("Loan reference");
    expect(html).toContain("Loading repayment records");
  });
});
