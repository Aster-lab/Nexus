import { describe, expect, it } from "vitest";
import type { ApiPostOptions, ApiSuccessEnvelope } from "../../../src/lib/client/api-client";
import {
  canAdminProcessPayout,
  getAdminPendingPayoutAllocationsPath,
  getAdminPayoutsPath,
  processAdminPayout,
  type AdminPayoutPoster,
} from "../../../src/lib/client/admin-payouts";

describe("WP9.6.5 administrator payout client", () => {
  it("builds read paths from supported payout filters and pagination", () => {
    expect(getAdminPendingPayoutAllocationsPath({ page: 2, limit: 10, sortOrder: "asc" }))
      .toBe("/api/admin/payout-allocations?page=2&limit=10&sortBy=createdAt&sortOrder=asc");
    expect(getAdminPayoutsPath({ page: 1, limit: 20, status: "COMPLETED", investorProfileId: "investor-1", sortBy: "completedAt", sortOrder: "desc" }))
      .toBe("/api/admin/payouts?page=1&limit=20&sortBy=completedAt&sortOrder=desc&status=COMPLETED&investorProfileId=investor-1");
  });

  it("treats server eligibility as the only UI gate and preserves an idempotency key", async () => {
    expect(canAdminProcessPayout({ canProcess: true, code: null, message: "Ready" })).toBe(true);
    expect(canAdminProcessPayout({ canProcess: false, code: "INSUFFICIENT_CLEARING_BALANCE", message: "Clearing balance is too low" })).toBe(false);
    let call: { path: string; body: unknown; options?: ApiPostOptions } | null = null;
    const poster: AdminPayoutPoster = async <T, TBody>(path: string, body: TBody, options?: ApiPostOptions): Promise<ApiSuccessEnvelope<T>> => {
      call = { path, body, options };
      return { success: true, message: "Completed", data: { investorPayoutId: "payout-1", payoutAllocationId: "allocation-1", ledgerTransactionId: "ledger-1", amountSatang: "10000", status: "COMPLETED" } as T };
    };
    await processAdminPayout("allocation-1", "admin-payout-key-1", poster);
    expect(call).toMatchObject({ path: "/api/admin/payouts", body: { payoutAllocationId: "allocation-1" }, options: { idempotencyKey: "admin-payout-key-1" } });
  });
});
