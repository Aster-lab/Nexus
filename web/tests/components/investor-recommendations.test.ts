import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvestorRecommendationsPage, RangeFields } from "../../src/components/investor/investor-recommendations";

describe("WP9.8 investor recommendations UI", () => {
  it("explains rankings and provides an independently loaded preference form", () => {
    const html = renderToStaticMarkup(createElement(InvestorRecommendationsPage));
    expect(html).toContain("Investor preferences");
    expect(html).toContain("not default probability");
    expect(html).toContain("match score");
    expect(html).not.toContain("Preferred risk tiers");
    expect(html).toContain("aria-busy=\"true\"");
    expect(html).toContain("flex-col justify-between gap-4 sm:flex-row");
    expect(html).toContain("w-full sm:w-fit");
  });

  it("keeps preference range controls shrinkable within narrow cards", () => {
    const html = renderToStaticMarkup(createElement(RangeFields, { id: "range", label: "Interest range", value: { min: "5", max: "12" }, onChange: () => undefined }));
    expect(html).toContain("w-full min-w-0 max-w-full");
    expect(html).toContain("grid min-w-0 grid-cols-2");
  });
});
