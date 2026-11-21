import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminFinancialActivity } from "../../src/components/admin/admin-financial-activity";

describe("WP9.7.6 administrator financial visibility", () => {
  it("shows read-only wallet and ledger sections with independent loading states", () => {
    const html = renderToStaticMarkup(createElement(AdminFinancialActivity));
    expect(html).toContain("Wallet balances");
    expect(html).toContain("Ledger transactions");
    expect(html).toContain("read-only");
    expect(html.match(/aria-busy="true"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain("Adjust balance");
  });
});
