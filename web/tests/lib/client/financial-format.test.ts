import { describe, expect, it } from "vitest";
import { formatSatang, formatFinancialStatus } from "../../../src/lib/client/financial-format";

describe("WP9.7 shared financial formatting", () => {
  it("formats integer satang without floating point rounding", () => {
    expect(formatSatang("123456789012345678901")).toBe("฿1,234,567,890,123,456,789.01");
    expect(formatSatang("0")).toBe("฿0.00");
    expect(formatSatang("-1")).toBe("-฿0.01");
  });
  it("returns a safe placeholder for malformed financial values and labels statuses consistently", () => {
    expect(formatSatang("1.01")).toBe("—");
    expect(formatFinancialStatus("PARTIALLY_PAID")).toBe("Partially Paid");
  });
});
