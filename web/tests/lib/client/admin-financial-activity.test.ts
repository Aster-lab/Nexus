import { describe, expect, it } from "vitest";
import { getAdminLedgerTransactionsPath, getAdminWalletsPath } from "../../../src/lib/client/admin-financial-activity";

describe("WP9.7.6 admin financial activity client", () => {
  it("uses supported wallet status, currency, owner and pagination filters", () => {
    expect(getAdminWalletsPath({ page: 2, limit: 10, status: "ACTIVE", currency: "THB", ownerUserId: "user-1", ownerPlatformAccountId: "", sortBy: "balanceSatang", sortOrder: "desc" })).toBe("/api/admin/wallets?page=2&limit=10&sortBy=balanceSatang&sortOrder=desc&status=ACTIVE&currency=THB&ownerUserId=user-1");
  });
  it("uses supported ledger transaction filters and ordering", () => {
    expect(getAdminLedgerTransactionsPath({ page: 1, limit: 20, status: "POSTED", transactionType: "INVESTOR_PAYOUT", referenceType: "PAYOUT_ALLOCATION", referenceId: "ref-1", sortBy: "postedAt", sortOrder: "desc" })).toBe("/api/admin/ledger-transactions?page=1&limit=20&sortBy=postedAt&sortOrder=desc&status=POSTED&transactionType=INVESTOR_PAYOUT&referenceType=PAYOUT_ALLOCATION&referenceId=ref-1");
  });
});
