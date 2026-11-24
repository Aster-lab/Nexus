import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { prisma } from "../../src/lib/prisma";
import {
  activateRepaymentTestAccounts,
  RepaymentFixtureOperations,
} from "../fixtures/repayment.fixture";

describe("Repayment fixture account setup", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it("activates the opening-balance account, clearing account, and clearing wallet", async () => {
    const state = await activateRepaymentTestAccounts();
    cleanup = state.cleanup;

    const sourceAccount = await prisma.platformAccount.findUniqueOrThrow({
      where: { accountCode: "1300" },
    });

    const clearingAccount = await prisma.platformAccount.findUniqueOrThrow({
      where: { accountCode: "2300" },
    });

    const clearingWallet = await prisma.wallet.findUniqueOrThrow({
      where: { id: state.clearingWalletId },
    });

    expect(sourceAccount.status).toBe("ACTIVE");
    expect(clearingAccount.status).toBe("ACTIVE");
    expect(clearingWallet.status).toBe("ACTIVE");
  });

  it("restores all original statuses after cleanup", async () => {
    const originalSource = await prisma.platformAccount.findUniqueOrThrow({
      where: { accountCode: "1300" },
      select: { status: true },
    });

    const originalClearing = await prisma.platformAccount.findUniqueOrThrow({
      where: { accountCode: "2300" },
      select: { status: true },
    });

    const originalWallet = await prisma.wallet.findUniqueOrThrow({
      where: { ownerPlatformAccountId: (
        await prisma.platformAccount.findUniqueOrThrow({
          where: { accountCode: "2300" },
          select: { id: true },
        })
      ).id },
      select: { status: true },
    });

    const state = await activateRepaymentTestAccounts();
    cleanup = state.cleanup;

    await state.cleanup();
    cleanup = undefined;

    const sourceAfter = await prisma.platformAccount.findUniqueOrThrow({
      where: { accountCode: "1300" },
    });

    const clearingAfter = await prisma.platformAccount.findUniqueOrThrow({
      where: { accountCode: "2300" },
    });

    const walletAfter = await prisma.wallet.findUniqueOrThrow({
      where: { id: state.clearingWalletId },
    });

    expect(sourceAfter.status).toBe(originalSource.status);
    expect(clearingAfter.status).toBe(originalClearing.status);
    expect(walletAfter.status).toBe(originalWallet.status);
  });

  it("allows cleanup to be called more than once", async () => {
    const state = await activateRepaymentTestAccounts();
    cleanup = state.cleanup;

    await expect(state.cleanup()).resolves.toBeUndefined();
    await expect(state.cleanup()).resolves.toBeUndefined();

    cleanup = undefined;
  });

  it("does not change the repayment-clearing wallet balance", async () => {
    const account = await prisma.platformAccount.findUniqueOrThrow({
      where: { accountCode: "2300" },
      select: { id: true },
    });

    const walletBefore = await prisma.wallet.findUniqueOrThrow({
      where: { ownerPlatformAccountId: account.id },
      select: {
        id: true,
        balanceSatang: true,
      },
    });

    const state = await activateRepaymentTestAccounts();
    cleanup = state.cleanup;

    await state.cleanup();
    cleanup = undefined;

    const walletAfter = await prisma.wallet.findUniqueOrThrow({
      where: { id: walletBefore.id },
      select: { balanceSatang: true },
    });

    expect(walletAfter.balanceSatang).toBe(walletBefore.balanceSatang);
  });

  it("does not create ledger transactions during activation or cleanup", async () => {
    const transactionsBefore = await prisma.ledgerTransaction.count();
    const entriesBefore = await prisma.ledgerEntry.count();

    const state = await activateRepaymentTestAccounts();
    cleanup = state.cleanup;

    await state.cleanup();
    cleanup = undefined;

    const transactionsAfter = await prisma.ledgerTransaction.count();
    const entriesAfter = await prisma.ledgerEntry.count();

    expect(transactionsAfter).toBe(transactionsBefore);
    expect(entriesAfter).toBe(entriesBefore);
    });

    it("preserves the clearing wallet balance after repeated cleanup", async () => {
    const state = await activateRepaymentTestAccounts();
    cleanup = state.cleanup;

    const balanceBefore = await prisma.wallet.findUniqueOrThrow({
        where: { id: state.clearingWalletId },
        select: { balanceSatang: true },
    });

    await state.cleanup();
    await state.cleanup();
    cleanup = undefined;

    const balanceAfter = await prisma.wallet.findUniqueOrThrow({
        where: { id: state.clearingWalletId },
        select: { balanceSatang: true },
    });

    expect(balanceAfter.balanceSatang).toBe(balanceBefore.balanceSatang);
    });

  it("restores previously activated accounts when a later activation fails", async () => {
    const source = await prisma.platformAccount.findUniqueOrThrow({
      where: { accountCode: "1300" },
      select: { id: true, status: true },
    });

    const clearing = await prisma.platformAccount.findUniqueOrThrow({
      where: { accountCode: "2300" },
      select: { id: true, status: true },
    });

    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { ownerPlatformAccountId: clearing.id },
      select: { id: true, status: true, balanceSatang: true },
    });

    const activationError = new Error("Simulated activation failure");

    let activationFailed = false;

    const operations: RepaymentFixtureOperations = {
      updatePlatformAccountStatus: async (id, status) => {
        if (
          id === clearing.id &&
          status === "ACTIVE" &&
          !activationFailed
        ) {
          activationFailed = true;
          throw activationError;
        }

        await prisma.platformAccount.update({
          where: { id },
          data: { status },
        });
      },

      updateWalletStatus: async (id, status) => {
        await prisma.wallet.update({
          where: { id },
          data: { status },
        });
      },
    };

    await expect(
      activateRepaymentTestAccounts(operations),
    ).rejects.toBe(activationError);

    const sourceAfter = await prisma.platformAccount.findUniqueOrThrow({
      where: { id: source.id },
      select: { status: true },
    });

    const clearingAfter = await prisma.platformAccount.findUniqueOrThrow({
      where: { id: clearing.id },
      select: { status: true },
    });

    const walletAfter = await prisma.wallet.findUniqueOrThrow({
      where: { id: wallet.id },
      select: { status: true, balanceSatang: true },
    });

    expect(sourceAfter.status).toBe(source.status);
    expect(clearingAfter.status).toBe(clearing.status);
    expect(walletAfter.status).toBe(wallet.status);
    expect(walletAfter.balanceSatang).toBe(wallet.balanceSatang);
  });

  it("attempts every restoration even when one restoration fails", async () => {
    const clearing = await prisma.platformAccount.findUniqueOrThrow({
      where: { accountCode: "2300" },
      select: { id: true, status: true },
    });

    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { ownerPlatformAccountId: clearing.id },
      select: { id: true, status: true },
    });

    let walletUpdates = 0;
    let clearingUpdates = 0;
    let sourceUpdates = 0;

    const operations: RepaymentFixtureOperations = {
      updatePlatformAccountStatus: async (id, status) => {
        if (id === clearing.id) clearingUpdates++;
        else sourceUpdates++;

        await prisma.platformAccount.update({
          where: { id },
          data: { status },
        });
      },

      updateWalletStatus: async (id, status) => {
        walletUpdates++;

        if (
          id === wallet.id &&walletUpdates === 2
        ) {
          throw new Error("Simulated wallet restoration failure");
        }

        await prisma.wallet.update({
          where: { id },
          data: { status },
        });
      },
    };

    const state = await activateRepaymentTestAccounts(operations);
    cleanup = state.cleanup;

    await expect(state.cleanup()).rejects.toThrow(
      "Failed to restore one or more repayment fixture account states",
    );

    expect(walletUpdates).toBe(2);
    expect(clearingUpdates).toBe(2);
    expect(sourceUpdates).toBe(2);

    await state.cleanup();
    cleanup = undefined;
    expect(walletUpdates).toBe(3);
  });

  it("successfully retries cleanup after a restoration failure", async () => {
    const clearing = await prisma.platformAccount.findUniqueOrThrow({
      where: { accountCode: "2300" },
      select: { id: true, status: true },
    });

    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { ownerPlatformAccountId: clearing.id },
      select: { id: true, status: true },
    });

   let walletUpdates = 0;

  const operations: RepaymentFixtureOperations = {
    updatePlatformAccountStatus: async (id, status) => {
      await prisma.platformAccount.update({
        where: { id },
        data: { status },
      });
    },

    updateWalletStatus: async (id, status) => {
      walletUpdates++;

      if (id === wallet.id && walletUpdates === 2) {
        throw new Error("Temporary restoration failure");
      }

      await prisma.wallet.update({
        where: { id },
        data: { status },
      });
    },
  };

    const state = await activateRepaymentTestAccounts(operations);
    cleanup = state.cleanup;

    await expect(state.cleanup()).rejects.toThrow(
      "Failed to restore one or more repayment fixture account states",
    );

    await expect(state.cleanup()).resolves.toBeUndefined();

    const sourceAfter = await prisma.platformAccount.findUniqueOrThrow({
      where: { accountCode: "1300" },
      select: { status: true },
    });

    const clearingAfter = await prisma.platformAccount.findUniqueOrThrow({
      where: { id: clearing.id },
      select: { status: true },
    });

    const walletAfter = await prisma.wallet.findUniqueOrThrow({
      where: { id: wallet.id },
      select: { status: true },
    });

    const sourceOriginal = await prisma.platformAccount.findUniqueOrThrow({
      where: { accountCode: "1300" },
      select: { status: true },
    });

    expect(walletUpdates).toBe(3);
    expect(clearingAfter.status).toBe(clearing.status);
    expect(walletAfter.status).toBe(wallet.status);
    expect(sourceAfter.status).toBe(sourceOriginal.status);

    cleanup = undefined;
  });
});
