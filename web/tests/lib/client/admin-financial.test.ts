import { describe, expect, it } from "vitest";
import { getAdminFinancialReconciliationPath, loadAdminFinancialReconciliation, type AdminFinancialFetcher } from "../../../src/lib/client/admin-financial";

describe("WP9.6.6 admin financial client", () => {
  it("targets the existing read-only reconciliation endpoint", () => {
    expect(getAdminFinancialReconciliationPath()).toBe("/api/admin/reconciliation");
  });

  it("returns backend reconciliation results without attempting to repair them", async () => {
    const report = { valid: false, issues: [{ code: "WALLET_LEDGER_MISMATCH", entityId: "wallet-1", message: "Mismatch" }], financial: { checked: { wallets: 2 } }, payouts: { clearing: { walletBalanceSatang: "100", ledgerBalanceSatang: "90", collectionsSatang: "100", completedPayoutsSatang: "10", otherPostedMovementSatang: "0" } } };
    const fetcher: AdminFinancialFetcher = async <T>() => ({ success: true, message: "Loaded", data: report as T });
    await expect(loadAdminFinancialReconciliation(fetcher)).resolves.toEqual(report);
  });
});
