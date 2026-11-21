import { describe, expect, it } from "vitest";
import { getBorrowerWalletPath, loadBorrowerWallet } from "../../../src/lib/client/borrower-wallet";
import { getInvestorWalletPath, loadInvestorWallet } from "../../../src/lib/client/investor-wallet";
import type { ApiSuccessEnvelope } from "../../../src/lib/client/api-client";

describe("WP9.7 role wallet clients", () => {
  it("uses the borrower wallet API and returns persisted amounts as strings", async () => {
    expect(getBorrowerWalletPath({ page: 2, limit: 10, sortOrder: "asc" })).toBe("/api/borrower/wallet?page=2&limit=10&sortBy=createdAt&sortOrder=asc");
    const payload = { wallet: { id: "w1", balanceSatang: "2500", currency: "THB", status: "ACTIVE" }, transactions: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false } };
    const fetcher = async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => { expect(path).toContain("/api/borrower/wallet"); return { success: true, message: "Loaded", data: payload as T }; };
    await expect(loadBorrowerWallet({ page: 1, limit: 10, sortOrder: "desc" }, fetcher)).resolves.toEqual(payload);
  });
  it("uses the investor wallet API without accepting another investor identifier", async () => {
    expect(getInvestorWalletPath({ page: 1, limit: 20, sortOrder: "desc" })).toBe("/api/investor/wallet?page=1&limit=20&sortBy=createdAt&sortOrder=desc");
    const payload = { wallet: null, transactions: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false } };
    const fetcher = async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => { expect(path).toBe("/api/investor/wallet?page=1&limit=20&sortBy=createdAt&sortOrder=desc"); return { success: true, message: "Loaded", data: payload as T }; };
    await expect(loadInvestorWallet({ page: 1, limit: 20, sortOrder: "desc" }, fetcher)).resolves.toEqual(payload);
  });
});
