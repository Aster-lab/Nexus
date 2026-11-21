import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("../../src/components/auth/auth-provider", () => ({ useAuth: () => ({ identity: { email: "admin@example.test" } }) }));
import { AdminDashboardPage } from "../../src/components/admin/admin-dashboard";

describe("WP9.6.1 administrator dashboard UI", () => {
  it("shows independent operational sections with accessible loading states", () => {
    const html = renderToStaticMarkup(createElement(AdminDashboardPage));
    expect(html).toContain("Administrator dashboard");
    expect(html).toContain("Welcome back, admin@example.test");
    expect(html).toContain("Pending applications");
    expect(html).toContain("Active loans");
    expect(html).toContain("Pending investor payouts");
    expect(html).toContain("Recent repayments");
    expect(html).toContain("Recent administrative activity");
    expect(html.match(/aria-busy="true"/g)?.length).toBeGreaterThanOrEqual(5);
  });
});
