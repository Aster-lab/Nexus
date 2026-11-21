
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma";
import {
  createRepaymentScheduleTestContext,
  createRepaymentTestContext,
  OPENING_BALANCE_ACCOUNT_CODE,
  REPAYMENT_CLEARING_ACCOUNT_CODE,
  type RepaymentTestContextOperations,
} from "../fixtures/repayment.fixture";

async function getAccountStatuses() {
  const sourceAccount = await prisma.platformAccount.findUniqueOrThrow({
    where: { accountCode: OPENING_BALANCE_ACCOUNT_CODE },
    select: { id: true, status: true },
  });

  const clearingAccount = await prisma.platformAccount.findUniqueOrThrow({
    where: { accountCode: REPAYMENT_CLEARING_ACCOUNT_CODE },
    select: { id: true, status: true },
  });

  const clearingWallet = await prisma.wallet.findUniqueOrThrow({
    where: {
      ownerPlatformAccountId: clearingAccount.id,
    },
    select: { id: true, status: true },
  });

  return {
    sourceAccount,
    clearingAccount,
    clearingWallet,
  };
}

async function expectAccountStatusesRestored(
  original: Awaited<ReturnType<typeof getAccountStatuses>>,
) {
  const current = await getAccountStatuses();

  expect(current.sourceAccount.status).toBe(original.sourceAccount.status);
  expect(current.clearingAccount.status).toBe(original.clearingAccount.status);
  expect(current.clearingWallet.status).toBe(original.clearingWallet.status);
}

describe("Repayment fixture context integration", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("FIX-11 creates a complete base repayment context", async () => {
    const context = await createRepaymentTestContext();

    try {
      expect(context.administratorUserId).toBeTruthy();
      expect(context.borrowerUser.id).toBeTruthy();
      expect(context.investorUser.id).toBeTruthy();
      expect(context.loan.id).toBeTruthy();
      expect(context.borrowerWalletId).toBeTruthy();
      expect(context.clearingAccountId).toBeTruthy();
      expect(context.clearingWalletId).toBeTruthy();
      expect(context.openingBalanceIdempotencyKey).toBeTruthy();
      expect(context.idempotencyKey).toBeTruthy();
    } finally {
      await context.cleanup();
    }
  });

  it("FIX-12 prepares an active, fully funded, disbursed loan", async () => {
    const context = await createRepaymentTestContext();

    try {
      const loan = await prisma.loan.findUniqueOrThrow({
        where: { id: context.loan.id },
      });

      expect(loan.status).toBe("ACTIVE");
      expect(loan.fundedSatang).toBe(loan.principalSatang);
      expect(loan.disbursedAt).toBeInstanceOf(Date);
    } finally {
      await context.cleanup();
    }
  });

  it("FIX-13 posts the configured borrower opening balance", async () => {
    const context = await createRepaymentTestContext();

    try {
      const transaction = await prisma.ledgerTransaction.findUnique({
        where: {
          idempotencyKey: context.openingBalanceIdempotencyKey,
        },
        include: {
          entries: true,
        },
      });

      expect(transaction).not.toBeNull();
      expect(transaction!.status).toBe("POSTED");

      const borrowerEntry = transaction!.entries.find(
        (entry) => entry.walletId === context.borrowerWalletId,
      );

      expect(borrowerEntry).toBeDefined();
      expect(borrowerEntry!.entryType).toBe("CREDIT");
      expect(borrowerEntry!.amountSatang).toBe(
        context.openingBalanceSatang,
      );

      const wallet = await prisma.wallet.findUniqueOrThrow({
        where: { id: context.borrowerWalletId },
      });

      expect(wallet.balanceSatang).toBe(context.openingBalanceSatang);
    } finally {
      await context.cleanup();
    }
  });

  it("FIX-14 creates the base context without a repayment schedule", async () => {
    const context = await createRepaymentTestContext();

    try {
      const scheduleCount = await prisma.repaymentSchedule.count({
        where: { loanId: context.loan.id },
      });

      const installmentCount = await prisma.installment.count({
        where: {
          scheduleVersion: {
            schedule: {
              loanId: context.loan.id,
            },
          },
        },
      });

      expect(scheduleCount).toBe(0);
      expect(installmentCount).toBe(0);
    } finally {
      await context.cleanup();
    }
  });

  it("FIX-15 creates a schedule-ready context with ordered installments", async () => {
    const context = await createRepaymentScheduleTestContext();

    try {
      expect(context.schedule).toBeDefined();
      expect(context.schedule.currentVersionId).toBeTruthy();

      expect(context.installments.length).toBe(context.loan.termMonths);

      const installmentNumbers = context.installments.map(
        (installment) => installment.installmentNumber,
      );

      expect(installmentNumbers).toEqual(
        Array.from(
          { length: context.loan.termMonths },
          (_, index) => index + 1,
        ),
      );

      for (const installment of context.installments) {
        expect(installment.scheduleVersionId).toBe(
          context.schedule.currentVersionId,
        );
      }
    } finally {
      await context.cleanup();
    }
  });

  it("FIX-16 restores account statuses when opening-balance posting fails", async () => {
    const originalStatuses = await getAccountStatuses();
    const setupError = new Error("Simulated opening-balance posting failure");

    const operations: RepaymentTestContextOperations = {
      postOpeningBalance: async () => {
        throw setupError;
      },
    };

    await expect(
      createRepaymentTestContext({ operations }),
    ).rejects.toBe(setupError);

    await expectAccountStatusesRestored(originalStatuses);
  });

  it("FIX-17 restores all shared account statuses after base context cleanup", async () => {
    const originalStatuses = await getAccountStatuses();
    const context = await createRepaymentTestContext();

    try {
      const duringSetup = await getAccountStatuses();

      expect(duringSetup.sourceAccount.status).toBe("ACTIVE");
      expect(duringSetup.clearingAccount.status).toBe("ACTIVE");
      expect(duringSetup.clearingWallet.status).toBe("ACTIVE");
    } finally {
      await context.cleanup();
    }

    await expectAccountStatusesRestored(originalStatuses);
  });

  it("FIX-18 supports a custom borrower opening balance", async () => {
    const customAmount = 25_000_000n;

    const context = await createRepaymentTestContext({
      openingBalanceSatang: customAmount,
    });

    try {
      expect(context.openingBalanceSatang).toBe(customAmount);

      const transaction = await prisma.ledgerTransaction.findUniqueOrThrow({
        where: {
          idempotencyKey: context.openingBalanceIdempotencyKey,
        },
        include: {
          entries: true,
        },
      });

      const borrowerEntry = transaction.entries.find(
        (entry) => entry.walletId === context.borrowerWalletId,
      );

      expect(borrowerEntry?.amountSatang).toBe(customAmount);

      const wallet = await prisma.wallet.findUniqueOrThrow({
        where: { id: context.borrowerWalletId },
      });

      expect(wallet.balanceSatang).toBe(customAmount);
    } finally {
      await context.cleanup();
    }
  });

  it("FIX-19 generates unique idempotency keys for separate contexts", async () => {
    const first = await createRepaymentTestContext();

    try {
      const second = await createRepaymentTestContext();

      try {
        expect(first.idempotencyKey).not.toBe(second.idempotencyKey);

        expect(first.openingBalanceIdempotencyKey).not.toBe(
          second.openingBalanceIdempotencyKey,
        );
      } finally {
        await second.cleanup();
      }
    } finally {
      await first.cleanup();
    }
  });

  it("FIX-20 creates opening-balance ledger activity without repayment or payout activity", async () => {
    const context = await createRepaymentTestContext();

    try {
      const transaction = await prisma.ledgerTransaction.findUniqueOrThrow({
        where: {
          idempotencyKey: context.openingBalanceIdempotencyKey,
        },
        include: {
          entries: true,
        },
      });

      expect(transaction.status).toBe("POSTED");
      expect(transaction.entries).toHaveLength(2);

      const borrowerEntry = transaction.entries.find(
        (entry) => entry.walletId === context.borrowerWalletId,
      );

      expect(borrowerEntry?.amountSatang).toBe(
        context.openingBalanceSatang,
      );

      const repaymentCount = await prisma.repayment.count({
        where: { loanId: context.loan.id },
      });

      expect(repaymentCount).toBe(0);

      const allocations = await prisma.payoutAllocation.findMany({
        where: {
          repayment: {
            loanId: context.loan.id,
          },
        },
        select: { id: true },
      });

      expect(allocations).toHaveLength(0);

      const payoutCount = await prisma.investorPayout.count({
        where: {
          payoutAllocationId: {
            in: allocations.map((allocation) => allocation.id),
          },
        },
      });

      expect(payoutCount).toBe(0);
    } finally {
      await context.cleanup();
    }
  });
});
