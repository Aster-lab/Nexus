import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../../src/components/auth/auth-provider";
import { BorrowerDashboard } from "../../src/components/borrower/borrower-dashboard";

describe("WP9.4.1 borrower dashboard UI", () => {
  it("DASH-05 shows accessible loading states while each dashboard resource is pending", () => {
    const markup = renderToStaticMarkup(createElement(
      AuthProvider,
      null,
      createElement(BorrowerDashboard),
    ));

    expect(markup).toContain("Loading account summary");
    expect(markup).toContain("Loading applications");
    expect(markup).toContain("Loading loans");
    expect(markup).toContain("Loading repayment history");
    expect(markup).toContain("Loading wallet activity");
    expect(markup).toContain('aria-busy="true"');
  });
});
