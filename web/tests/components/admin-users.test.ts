import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminUsersPage } from "../../src/components/admin/admin-users";

describe("WP9.6.7 administrator user management", () => {
  it("shows list filters and avoids unsupported search, role mutation, and user detail navigation", () => {
    const html = renderToStaticMarkup(createElement(AdminUsersPage));
    expect(html).toContain("Account status");
    expect(html).toContain("Filter by role");
    expect(html).toContain("aria-busy=\"true\"");
    expect(html).not.toContain("Search users");
    expect(html).not.toContain("Change role");
  });
});
