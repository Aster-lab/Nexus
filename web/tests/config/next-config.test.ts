import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("Next.js security response headers", () => {
  it("sets baseline browser security headers for every route", async () => {
    const rules = await nextConfig.headers?.();
    const catchAll = rules?.find((rule) => rule.source === "/:path*");
    const headers = new Map(catchAll?.headers.map(({ key, value }) => [key.toLowerCase(), value]));

    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });
});
