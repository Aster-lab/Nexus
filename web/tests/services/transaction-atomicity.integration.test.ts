import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma";
import {
  postWalletTransfer,
  withSerializableTransactionRetry,
} from "../../src/lib/services/ledger-posting.service";
import { submitRepayment } from "../../src/lib/services/repayment/repayment-submitrepayment";
import type { SubmitRepaymentTestOptions } from "../../src/lib/services/repayment/repayment-submitrepayment";
import { generateRepaymentSchedule } from "../../src/lib/services/repayment.service";
import { compensateLedgerTransaction } from "../../src/lib/services/compensating-transaction.service";
import { reconcileFinancialState } from "../../src/lib/services/financial-reconciliation.service";
import { createRepaymentTestContext } from "../fixtures/repayment.fixture";

import type { RepaymentTestContext } from "../fixtures/repayment.fixture";

const contexts: RepaymentTestContext[] = [];
const idempotencyKey = () => `txn-test-${randomUUID()}`;

type InstallmentState = Awaited<
  ReturnType<typeof prisma.installment.findMany>
>;

function outstanding(installment: {
  principalDueSatang: bigint;
  interestDueSatang: bigint;
  paidPrincipalSatang: bigint;
  paidInterestSatang: bigint;
}) {
  return (
    installment.principalDueSatang -
    installment.paidPrincipalSatang +
    installment.interestDueSatang -
    installment.paidInterestSatang
  );
}

async function createContext(monthsAgo = 3): Promise<RepaymentTestContext> {
  const context = await createRepaymentTestContext();
  try {
    const disbursedAt = new Date();
    disbursedAt.setMonth(disbursedAt.getMonth() - monthsAgo);
    await prisma.loan.update({
      where: { id: context.loan.id },
      data: { status: "ACTIVE", disbursedAt },
    });
    await generateRepaymentSchedule({
      loanId: context.loan.id,
      actorUserId: context.administratorUserId,
    });
    contexts.push(context);
    return context;
  } catch (error) {
    await context.cleanup();
    throw error;
  }
}

async function getCurrentInstallments(loanId: string): Promise<InstallmentState> {
  return prisma.installment.findMany({
    where: { scheduleVersion: { schedule: { loanId } } },
    orderBy: { installmentNumber: "asc" },
  });
}

async function getPayableInstallments(loanId: string) {
  const now = new Date();
  return (await getCurrentInstallments(loanId)).filter(
    (installment) =>
      installment.dueDate <= now &&
      ["PENDING", "PARTIALLY_PAID", "OVERDUE"].includes(installment.status) &&
      outstanding(installment) > 0n,
  );
}

async function walletBalances(context: RepaymentTestContext) {
  const wallets = await prisma.wallet.findMany({
    where: {
      id: { in: [context.borrowerWalletId, context.clearingWalletId] },
    },
    orderBy: { id: "asc" },
    select: { id: true, balanceSatang: true },
  });
  return wallets;
}

async function atomicState(
  context: RepaymentTestContext,
  key: string,
) {
  const [installments, repayments, allocations, transactions, wallets] =
    await Promise.all([
      getCurrentInstallments(context.loan.id),
      prisma.repayment.findMany({
        where: { loanId: context.loan.id },
        orderBy: [{ installmentId: "asc" }, { id: "asc" }],
      }),
      prisma.payoutAllocation.findMany({
        where: { repayment: { loanId: context.loan.id } },
        orderBy: [{ repaymentId: "asc" }, { investmentId: "asc" }],
      }),
      prisma.ledgerTransaction.findMany({
        where: { referenceType: "LOAN", referenceId: context.loan.id },
        orderBy: { id: "asc" },
      }),
      walletBalances(context),
    ]);
  const keyedTransaction = await prisma.ledgerTransaction.findUnique({
    where: { idempotencyKey: key },
  });
  return { installments, repayments, allocations, transactions, wallets, keyedTransaction };
}

async function submit(
  context: RepaymentTestContext,
  amountSatang: bigint,
  key: string,
  options: SubmitRepaymentTestOptions = {},
) {
  return submitRepayment(
    {
      loanId: context.loan.id,
      borrowerUserId: context.borrowerUser.id,
      amountSatang,
      idempotencyKey: key,
    },
    options,
  );
}

afterEach(async () => {
  for (const context of contexts.splice(0).reverse()) {
    await context.cleanup();
  }
});

describe("TXN — transaction atomicity and reconciliation", () => {
  it("TXN-01 rolls back all repayment effects when ledger posting fails", async () => {
    const context = await createContext();
    const amount = outstanding((await getPayableInstallments(context.loan.id))[0]);
    const key = idempotencyKey();
    const before = await atomicState(context, key);

    await expect(
      submit(context, amount, key, {
        postTransfer: async (tx, input) => {
          await postWalletTransfer(tx, input);
          throw new Error("TXN-01 injected ledger posting failure");
        },
      }),
    ).rejects.toThrow("TXN-01 injected ledger posting failure");

    expect(await atomicState(context, key)).toEqual(before);
  });

  it("TXN-02 rolls back the posted ledger and wallet changes when repayment persistence fails", async () => {
    const context = await createContext();
    const amount = outstanding((await getPayableInstallments(context.loan.id))[0]);
    const key = idempotencyKey();
    const before = await atomicState(context, key);

    await expect(
      submit(context, amount, key, {
        afterRepaymentCreated: async () => {
          throw new Error("TXN-02 injected repayment persistence failure");
        },
      }),
    ).rejects.toThrow("TXN-02 injected repayment persistence failure");

    expect(await atomicState(context, key)).toEqual(before);
  });

  it("TXN-03 rolls back ledger, repayment, installment, and wallet changes when allocation persistence fails", async () => {
    const context = await createContext();
    const amount = outstanding((await getPayableInstallments(context.loan.id))[0]);
    const key = idempotencyKey();
    const before = await atomicState(context, key);

    await expect(
      submit(context, amount, key, { allocationMethod: "X".repeat(51) }),
    ).rejects.toThrow();

    expect(await atomicState(context, key)).toEqual(before);
  });

  it("TXN-04 creates a compensating posting and leaves the original posted entries immutable", async () => {
    const context = await createContext();
    const amountSatang = 1n;
    const originalKey = idempotencyKey();
    const balancesBeforeOriginal = await walletBalances(context);
    const original = await withSerializableTransactionRetry((tx) =>
      postWalletTransfer(tx, {
        transactionType: "TXN_TEST_TRANSFER",
        referenceType: "LOAN",
        referenceId: context.loan.id,
        description: "TXN-04 original test transfer",
        idempotencyKey: originalKey,
        debitWalletId: context.borrowerWalletId,
        creditWalletId: context.clearingWalletId,
        amountSatang,
      }),
    );
    const originalBefore = await prisma.ledgerTransaction.findUniqueOrThrow({
      where: { id: original.ledgerTransactionId },
      include: { entries: true },
    });
    const compensation = await compensateLedgerTransaction({
      actorUserId: context.administratorUserId,
      originalLedgerTransactionId: original.ledgerTransactionId,
      idempotencyKey: idempotencyKey(),
      reason: "Correct the TXN-04 test transfer",
    });

    const [originalAfter, compensatingTransaction, balancesAfter] =
      await Promise.all([
        prisma.ledgerTransaction.findUniqueOrThrow({
          where: { id: original.ledgerTransactionId },
          include: { entries: true },
        }),
        prisma.ledgerTransaction.findUniqueOrThrow({
          where: { id: compensation.compensatingLedgerTransactionId },
          include: { entries: true },
        }),
        walletBalances(context),
      ]);

    expect(originalAfter).toEqual(originalBefore);
    expect(compensatingTransaction.status).toBe("POSTED");
    expect(compensatingTransaction.reversedTransactionId).toBe(
      original.ledgerTransactionId,
    );
    expect(compensatingTransaction.referenceType).toBe("LEDGER_TRANSACTION");
    expect(compensatingTransaction.referenceId).toBe(original.ledgerTransactionId);
    expect(compensation.totalSatang).toBe(amountSatang);
    expect(compensatingTransaction.entries).toHaveLength(originalBefore.entries.length);
    for (const originalEntry of originalBefore.entries) {
      const reverseEntry = compensatingTransaction.entries.find(
        (entry) =>
          entry.walletId === originalEntry.walletId &&
          entry.platformAccountId === originalEntry.platformAccountId,
      );
      expect(reverseEntry).toBeDefined();
      expect(reverseEntry!.amountSatang).toBe(originalEntry.amountSatang);
      expect(reverseEntry!.currency).toBe(originalEntry.currency);
      expect(reverseEntry!.entryType).toBe(
        originalEntry.entryType === "DEBIT" ? "CREDIT" : "DEBIT",
      );
    }
    expect(balancesAfter).toEqual(balancesBeforeOriginal);
  });

  it("TXN-05 reports balanced posted ledger transactions and reconciled wallet projections", async () => {
    const context = await createContext();
    const amount = outstanding((await getPayableInstallments(context.loan.id))[0]);
    await submit(context, amount, idempotencyKey());

    const report = await reconcileFinancialState({
      actorUserId: context.administratorUserId,
      loanIds: [context.loan.id],
      walletIds: [context.borrowerWalletId, context.clearingWalletId],
    });

    expect(report.valid).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.checked.postedTransactions).toBeGreaterThan(0);
    expect(report.checked.wallets).toBe(2);
  });

  it("TXN-06 reconciles repayment components, installment paid totals, and investor allocations", async () => {
    const context = await createContext();
    const amount = outstanding((await getPayableInstallments(context.loan.id))[0]);
    const result = await submit(context, amount, idempotencyKey());
    const repayments = await prisma.repayment.findMany({
      where: { ledgerTransactionId: result.ledgerTransactionId },
      include: { installment: true, payoutAllocations: true },
    });

    expect(repayments.length).toBeGreaterThan(0);
    for (const repayment of repayments) {
      expect(repayment.totalSatang).toBe(
        repayment.principalSatang + repayment.interestSatang + repayment.feeSatang,
      );
      expect(repayment.installment.paidPrincipalSatang).toBe(
        (await prisma.repayment.aggregate({
          where: { installmentId: repayment.installmentId, status: "POSTED" },
          _sum: { principalSatang: true },
        }))._sum.principalSatang,
      );
      expect(repayment.installment.paidInterestSatang).toBe(
        (await prisma.repayment.aggregate({
          where: { installmentId: repayment.installmentId, status: "POSTED" },
          _sum: { interestSatang: true },
        }))._sum.interestSatang,
      );
      expect(
        repayment.payoutAllocations.reduce((sum, item) => sum + item.principalSatang, 0n),
      ).toBe(repayment.principalSatang);
      expect(
        repayment.payoutAllocations.reduce((sum, item) => sum + item.interestSatang, 0n),
      ).toBe(repayment.interestSatang);
    }

    const report = await reconcileFinancialState({
      actorUserId: context.administratorUserId,
      loanIds: [context.loan.id],
    });
    expect(report.valid).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("TXN-07 reconciles the complete financial state after a full schedule repayment", async () => {
    const context = await createContext(36);
    const installmentsBefore = await getCurrentInstallments(context.loan.id);
    const amountSatang = installmentsBefore.reduce(
      (sum, installment) => sum + outstanding(installment),
      0n,
    );
    const walletsBefore = await walletBalances(context);
    const result = await submit(context, amountSatang, idempotencyKey());
    const [transaction, repayments, installmentsAfter, walletsAfter, report] =
      await Promise.all([
        prisma.ledgerTransaction.findUniqueOrThrow({
          where: { id: result.ledgerTransactionId },
          include: { entries: true },
        }),
        prisma.repayment.findMany({
          where: { ledgerTransactionId: result.ledgerTransactionId },
          include: { payoutAllocations: true },
        }),
        getCurrentInstallments(context.loan.id),
        walletBalances(context),
        reconcileFinancialState({
          actorUserId: context.administratorUserId,
          loanIds: [context.loan.id],
          walletIds: [context.borrowerWalletId, context.clearingWalletId],
        }),
      ]);

    const debitTotal = transaction.entries
      .filter((entry) => entry.entryType === "DEBIT")
      .reduce((sum, entry) => sum + entry.amountSatang, 0n);
    const creditTotal = transaction.entries
      .filter((entry) => entry.entryType === "CREDIT")
      .reduce((sum, entry) => sum + entry.amountSatang, 0n);
    expect(transaction.status).toBe("POSTED");
    expect(debitTotal).toBe(creditTotal);
    expect(debitTotal).toBe(amountSatang);
    expect(repayments.reduce((sum, row) => sum + row.totalSatang, 0n)).toBe(amountSatang);
    expect(
      repayments.reduce(
        (sum, row) =>
          sum + row.payoutAllocations.reduce((allocationSum, allocation) => allocationSum + allocation.principalSatang, 0n),
        0n,
      ),
    ).toBe(repayments.reduce((sum, row) => sum + row.principalSatang, 0n));
    expect(
      repayments.reduce(
        (sum, row) =>
          sum + row.payoutAllocations.reduce((allocationSum, allocation) => allocationSum + allocation.interestSatang, 0n),
        0n,
      ),
    ).toBe(repayments.reduce((sum, row) => sum + row.interestSatang, 0n));
    expect(installmentsAfter.every((row) => row.status === "PAID")).toBe(true);
    expect(walletsAfter.find((wallet) => wallet.id === context.borrowerWalletId)?.balanceSatang)
      .toBe(walletsBefore.find((wallet) => wallet.id === context.borrowerWalletId)!.balanceSatang - amountSatang);
    expect(walletsAfter.find((wallet) => wallet.id === context.clearingWalletId)?.balanceSatang)
      .toBe(walletsBefore.find((wallet) => wallet.id === context.clearingWalletId)!.balanceSatang + amountSatang);
    expect(result.totalSatang).toBe(amountSatang);
    expect(report.valid).toBe(true);
    expect(report.issues).toEqual([]);
  }, 60_000);
});
