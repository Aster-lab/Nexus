import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BorrowerOfferList } from "../../src/components/borrower/borrower-offer-list";
import { BorrowerOfferDetailsPage } from "../../src/components/borrower/borrower-offer-details";

describe("WP9.4.4 borrower offers UI", () => {
  it("OFF-01 exposes accessible loading states for offer list and details", () => {
    const list = renderToStaticMarkup(createElement(BorrowerOfferList));
    const details = renderToStaticMarkup(createElement(BorrowerOfferDetailsPage, { offerId: "offer-1" }));
    expect(list).toContain("Loading loan offers");
    expect(details).toContain("animate-pulse");
    expect(list).toContain('aria-busy="true"');
  });
});
