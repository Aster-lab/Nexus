import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminApplicationDetailPage, AdminApplicationsPage } from "../../src/components/admin/admin-applications";

describe("WP9.6.2 administrator application UI", () => {
  it("renders the server-filtered application queue and an accessible loading state", () => {
    const html = renderToStaticMarkup(createElement(AdminApplicationsPage));
    expect(html).toContain("Borrower applications");
    expect(html).toContain("Application status");
    expect(html).toContain("Submitted date");
    expect(html).toContain("Loading borrower applications");
  });

  it("starts detail review without exposing decision controls before the record loads", () => {
    const html = renderToStaticMarkup(createElement(AdminApplicationDetailPage, { applicationId: "application-1" }));
    expect(html).toContain("Loading application details");
    expect(html).not.toContain("Confirm approved");
  });
});
