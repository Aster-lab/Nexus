import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WalletTopUpForm } from "../../src/components/shared/wallet-top-up-form";

describe("simulated wallet top-up form", () => {
  it("explains the simulated nature and per-request THB cap", () => {
    const html = renderToStaticMarkup(createElement(WalletTopUpForm, { role: "BORROWER", onPosted: () => undefined }));
    expect(html).toContain("Add simulated funds");
    expect(html).toContain("No real bank deposit or payment is made");
    expect(html).toContain("฿50,000");
    expect(html).toContain("Review top-up");
  });
});
