import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BorrowerRiskEvaluation } from "../../src/components/borrower/borrower-risk-evaluation";

describe("WP9.8 borrower prediction presentation", () => {
  it("explains preliminary status and avoids implying approval or confidence", () => {
    const html = renderToStaticMarkup(createElement(BorrowerRiskEvaluation, { applicationId: "application-1", applicationStatus: "SUBMITTED", principalSatang: "100000", termMonths: 3 }));
    expect(html).toContain("Preliminary risk preview");
    expect(html).toContain("not an approval decision");
    expect(html).toContain("Confidence score is not provided");
    expect(html).toContain("w-full sm:w-fit");
  });
});
