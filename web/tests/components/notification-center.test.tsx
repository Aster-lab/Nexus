import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotificationCenter } from "../../src/components/shared/notification-center";

describe("WP11 notification center", () => {
  it("renders an accessible notification control without inventing an unread count", () => {
    const html = renderToStaticMarkup(createElement(NotificationCenter, { roles: ["BORROWER"] }));
    expect(html).toContain('aria-label="Notifications"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("0 unread");
  });
});
