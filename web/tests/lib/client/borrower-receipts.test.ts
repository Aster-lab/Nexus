import { describe, expect, it, vi } from "vitest";
import type { ApiSuccessEnvelope } from "../../../src/lib/client/api-client";
import { canOpenBorrowerReceipt, getBorrowerReceiptPath, loadBorrowerReceipt } from "../../../src/lib/client/borrower-receipts";
import type { RepaymentFetcher } from "../../../src/lib/client/borrower-repayments";

describe("WP9.4.7 borrower receipt client", () => {
  it("loads the existing receipt retrieval endpoint without changing its response data", async () => {
    expect(getBorrowerReceiptPath("repayment/1")).toBe("/api/borrower/repayments/repayment%2F1/receipt");
    const receipt = { receiptId: "ledger-1", status: "POSTED", totalReceivedSatang: "125000", repayments: [] };
    const fetcher = vi.fn<RepaymentFetcher>(async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => ({ success: true, data: receipt as T, message: "Loaded" }));
    const result = await loadBorrowerReceipt("repayment/1", fetcher as unknown as RepaymentFetcher);
    expect(fetcher).toHaveBeenCalledWith("/api/borrower/repayments/repayment%2F1/receipt");
    expect(result.data).toEqual(receipt);
  });

  it("offers receipt access only for a POSTED repayment and POSTED ledger transaction", () => {
    expect(canOpenBorrowerReceipt({ status: "POSTED", ledgerTransaction: { status: "POSTED", postedAt: "2026-11-21T10:00:00Z" } })).toBe(true);
    expect(canOpenBorrowerReceipt({ status: "POSTED", ledgerTransaction: { status: "DRAFT", postedAt: null } })).toBe(false);
    expect(canOpenBorrowerReceipt({ status: "FAILED", ledgerTransaction: { status: "POSTED", postedAt: "2026-11-21T10:00:00Z" } })).toBe(false);
  });
});
