import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminPayoutsPage } from "../../src/components/admin/admin-payouts";

describe("WP9.6.5 administrator payout UI", () => {
  it("provides separate pending allocation and payout history panels", () => {
    const html = renderToStaticMarkup(createElement(AdminPayoutsPage));
    expect(html).toContain("Investor payout operations");
    expect(html).toContain("Pending allocations");
    expect(html).toContain("Payout history");
    expect(html).toContain("Loading unpaid allocations");
    expect(html).toContain("Loading payout history");
  });
});
