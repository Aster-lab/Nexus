import { describe, expect, it } from "vitest";
import type { ApiPostOptions, ApiSuccessEnvelope } from "../../../src/lib/client/api-client";
import { postAdminOpeningBalance, type AdminOpeningBalancePoster } from "../../../src/lib/client/admin-opening-balance";

describe("administrator opening-balance client", () => {
  it("posts the exact THB satang amount, reason, and caller idempotency key", async () => {
    let call: { path: string; body: unknown; options?: ApiPostOptions } | null = null;
    const poster: AdminOpeningBalancePoster = async <T, TBody>(path: string, body: TBody, options?: ApiPostOptions): Promise<ApiSuccessEnvelope<T>> => {
      call = { path, body, options };
      return { success: true, message: "Posted", data: { id: "opening-1", walletId: "wallet-1", administratorUserId: "admin-1", amountSatang: "2000000", currency: "THB", reason: "Approved demo funding", ledgerTransactionId: "transaction-1", status: "POSTED", postedAt: "2026-01-01T00:00:00.000Z" } as T };
    };

    await postAdminOpeningBalance({ walletId: "wallet-1", amountSatang: "2000000", reason: "Approved demo funding" }, "opening-key-1", poster);
    expect(call).toMatchObject({
      path: "/api/admin/opening-balances",
      body: { walletId: "wallet-1", amountSatang: "2000000", reason: "Approved demo funding" },
      options: { idempotencyKey: "opening-key-1" },
    });
  });
});
