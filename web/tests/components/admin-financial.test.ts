import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminFinancialPage } from "../../src/components/admin/admin-financial";

describe("WP9.6.6 administrator financial overview", () => {
  it("makes the reconciliation read-only and shows loading states", () => {
    const html = renderToStaticMarkup(createElement(AdminFinancialPage));
    expect(html).toContain("Financial overview &amp; reconciliation");
    expect(html).toContain("Read-only reconciliation");
    expect(html).toContain("aria-busy=\"true\"");
    expect(html).not.toContain("Repair");
    expect(html).not.toContain("Reconcile now");
  });
});
