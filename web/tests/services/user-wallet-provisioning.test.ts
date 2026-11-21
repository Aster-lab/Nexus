import { describe, expect, it, vi } from "vitest";
import { ensureUserWallet } from "../../src/lib/services/user-wallet-provisioning.service";

describe("ensureUserWallet", () => {
  it("creates an empty active THB wallet for a user without changing an existing one", async () => {
    const upsert = vi.fn().mockResolvedValue({
      id: "wallet-1",
      ownerUserId: "user-1",
      currency: "THB",
      balanceSatang: 0n,
      status: "ACTIVE",
    });
    const tx = { wallet: { upsert } } as never;

    await expect(ensureUserWallet(tx, "user-1")).resolves.toMatchObject({
      ownerUserId: "user-1",
      currency: "THB",
      balanceSatang: 0n,
      status: "ACTIVE",
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { ownerUserId: "user-1" },
      create: { ownerUserId: "user-1", currency: "THB", status: "ACTIVE" },
      update: {},
      select: { id: true, ownerUserId: true, currency: true, balanceSatang: true, status: true },
    });
  });
});
