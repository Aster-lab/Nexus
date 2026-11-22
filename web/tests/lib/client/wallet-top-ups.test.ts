import { describe, expect, it } from "vitest";
import { getWalletTopUpPath, parseWalletTopUpAmount } from "../../../src/lib/client/wallet-top-ups";

describe("simulated wallet top-up client", () => {
  it("uses only the role-specific wallet top-up APIs", () => {
    expect(getWalletTopUpPath("BORROWER")).toBe("/api/borrower/wallet/top-ups");
    expect(getWalletTopUpPath("INVESTOR")).toBe("/api/investor/wallet/top-ups");
  });

  it("parses THB to satang with two decimal places and the per-top-up cap", () => {
    expect(parseWalletTopUpAmount("50000")).toBe(5_000_000n);
    expect(parseWalletTopUpAmount("12.34")).toBe(1234n);
    expect(parseWalletTopUpAmount("0.01")).toBe(1n);
    expect(parseWalletTopUpAmount("50000.01")).toBeNull();
    expect(parseWalletTopUpAmount("1.001")).toBeNull();
    expect(parseWalletTopUpAmount("-1")).toBeNull();
  });
});
