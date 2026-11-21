import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvestorRecommendationsPage } from "../../src/components/investor/investor-recommendations";

describe("WP9.8 investor recommendations UI", () => {
  it("explains rankings and provides an independently loaded preference form", () => {
    const html = renderToStaticMarkup(createElement(InvestorRecommendationsPage));
    expect(html).toContain("Investor preferences");
    expect(html).toContain("not default probability");
    expect(html).toContain("aria-busy=\"true\"");
    expect(html).toContain("flex-col justify-between gap-4 sm:flex-row");
    expect(html).toContain("w-full sm:w-fit");
  });
});
