import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemoEnvironmentBanner } from "../../src/components/shared/demo-environment-banner";

describe("demo environment banner", () => {
  it("clearly labels demo activity as simulated", () => {
    const html = renderToStaticMarkup(createElement(DemoEnvironmentBanner));

    expect(html).toContain('role="note"');
    expect(html).toContain("Demo environment");
    expect(html).toContain("simulated");
  });
});
