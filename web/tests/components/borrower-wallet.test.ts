import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BorrowerWalletPage } from "../../src/components/borrower/borrower-wallet";

describe("WP9.7.2 borrower wallet UI", () => {
  it("distinguishes simulated wallet balance from loan obligations and shows loading state", () => {
    const html = renderToStaticMarkup(createElement(BorrowerWalletPage));
    expect(html).toContain("Simulated wallet");
    expect(html).toContain("separate from outstanding loan obligations");
    expect(html).toContain("aria-busy=\"true\"");
  });
});
