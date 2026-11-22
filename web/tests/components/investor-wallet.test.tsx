import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvestorWalletPage } from "../../src/components/investor/investor-wallet";
describe("WP9.7 investor wallet activity", () => {
  it("shows wallet and posted activity loading states", () => {
    const loading = renderToStaticMarkup(createElement(InvestorWalletPage, {}));
    expect(loading).toContain("Loading investor wallet");
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Simulated wallet");
  });

  it("does not expose a top-up form before wallet ownership is loaded", () => {
    const html = renderToStaticMarkup(createElement(InvestorWalletPage, {}));
    expect(html).not.toContain("Add simulated funds");
    expect(html).not.toContain("Withdraw");
  });
});
