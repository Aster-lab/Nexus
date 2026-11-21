import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminAuditLogsPage } from "../../src/components/admin/admin-audit-logs";

describe("WP9.6.8 administrator audit log viewer", () => {
  it("renders read-only filters and loading state", () => {
    const html = renderToStaticMarkup(createElement(AdminAuditLogsPage));
    expect(html).toContain("Audit logs");
    expect(html).toContain("Action");
    expect(html).toContain("Target type");
    expect(html).toContain("aria-busy=\"true\"");
    expect(html).not.toContain("Delete");
    expect(html).not.toContain("Edit");
  });
});
