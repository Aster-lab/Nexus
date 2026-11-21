import type { Prisma } from "../../generated/prisma/client";

/** Ensures a user-owned simulated wallet exists without creating ledger activity or funds. */
export async function ensureUserWallet(tx: Prisma.TransactionClient, userId: string) {
  return tx.wallet.upsert({
    where: { ownerUserId: userId },
    create: {
      ownerUserId: userId,
      currency: "THB",
      status: "ACTIVE",
    },
    update: {},
    select: {
      id: true,
      ownerUserId: true,
      currency: true,
      balanceSatang: true,
      status: true,
    },
  });
}
