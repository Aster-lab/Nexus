import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma";
import { submitRepayment } from "../../src/lib/services/repayment/repayment-submitrepayment";
import type { RepaymentReceipt } from "../../src/lib/services/repayment/repayment-receipt";
import {
  createRepaymentAllocationLifecycleContext,
  type RepaymentAllocationLifecycleContext,
} from "../fixtures/repayment-allocation.fixture";

type TestContext = RepaymentAllocationLifecycleContext;

type SubmissionWithReceipt = Awaited<ReturnType<typeof submitRepayment>>;

const contexts: TestContext[] = [];
const idempotencyKey = () => `receipt-test-${randomUUID()}`;

async function createContext(): Promise<TestContext> {
  const context = await createRepaymentAllocationLifecycleContext(1);
  contexts.push(context);
  return context;
}

async function getPayableInstallments(context: TestContext) {
  return prisma.installment.findMany({
    where: {
      scheduleVersion: { schedule: { loanId: context.loan.id } },
      dueDate: { lte: new Date() },
      status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
    },
    orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
  });
}

async function getFirstPayableInstallment(context: TestContext) {
  const first = (await getPayableInstallments(context))[0];
  if (!first) {
    throw new Error("Lifecycle fixture did not create a payable installment.");
  }
  return first;
}

async function getWalletBalances(context: TestContext) {
  const wallets = await prisma.wallet.findMany({
    where: {
      id: { in: [context.borrowerWalletId, context.clearingWalletId] },
    },
    select: { id: true, balanceSatang: true },
  });
  return Object.fromEntries(
    wallets.map((wallet) => [wallet.id, wallet.balanceSatang]),
  );
}

function outstandingTotal(installment: {
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

async function submit(
  context: TestContext,
  amountSatang: bigint,
  key = idempotencyKey(),
): Promise<SubmissionWithReceipt> {
  return submitRepayment({
    loanId: context.loan.id,
    borrowerUserId: context.borrowerUser.id,
    amountSatang,
    idempotencyKey: key,
  });
}

function expectReceipt(result: SubmissionWithReceipt): RepaymentReceipt {
  expect(result.receipt).toBeDefined();
  if (!result.receipt) {
    throw new Error("Successful repayment submission returned no receipt.");
  }
  return result.receipt;
}

afterEach(async () => {
  for (const context of contexts.splice(0).reverse()) {
    await context.cleanup();
  }
});

describe("RCP — repayment receipt generation and verification", () => {
  it("RCP-01 returns a receipt only after a full installment repayment is POSTED", async () => {
    const context = await createContext();
    const first = await getFirstPayableInstallment(context);

    const result = await submit(context, outstandingTotal(first));
    const receipt = expectReceipt(result);
    const transaction = await prisma.ledgerTransaction.findUniqueOrThrow({
      where: { id: result.ledgerTransactionId },
      select: { status: true, postedAt: true },
    });

    expect(transaction.status).toBe("POSTED");
    expect(transaction.postedAt).toBeInstanceOf(Date);
    expect(receipt.status).toBe("POSTED");
    expect(receipt.totalReceivedSatang).toBe(result.totalSatang);
  });

  it("RCP-02 reports partial receipt components and the remaining installment balance", async () => {
    const context = await createContext();
    const first = await getFirstPayableInstallment(context);

    const amountSatang = first.interestDueSatang + 2_500n;
    expect(amountSatang).toBeLessThan(outstandingTotal(first));

    const result = await submit(context, amountSatang);
    const receipt = expectReceipt(result);
    const item = receipt.repayments[0];
    const persistedInstallment = await prisma.installment.findUniqueOrThrow({
      where: { id: first.id },
    });

    expect(item).toBeDefined();
    expect(item?.totalSatang).toBe(amountSatang);
    expect(item?.interestSatang).toBe(first.interestDueSatang);
    expect(item?.principalSatang).toBe(2_500n);
    expect(receipt.totalReceivedSatang).toBe(amountSatang);
    expect(item?.remainingBalanceSatang).toBe(
      persistedInstallment.principalDueSatang -
        persistedInstallment.paidPrincipalSatang +
        persistedInstallment.interestDueSatang -
        persistedInstallment.paidInterestSatang,
    );
  });

  it("RCP-03 includes every repayment row for a posting spanning multiple installments", async () => {
    const context = await createContext();
    const payable = await getPayableInstallments(context);
    expect(payable.length).toBeGreaterThanOrEqual(2);
    if (payable.length < 2) {
      throw new Error("Lifecycle fixture needs two payable installments.");
    }

    const amountSatang = outstandingTotal(payable[0]) + 1n;
    const result = await submit(context, amountSatang);
    const receipt = expectReceipt(result);

    expect(receipt.repayments).toHaveLength(2);
    expect(receipt.repayments.map((item) => item.installmentId)).toEqual([
      payable[0].id,
      payable[1].id,
    ]);
    expect(
      receipt.repayments.every(
        (item) => item.ledgerTransactionId === result.ledgerTransactionId,
      ),
    ).toBe(true);
    expect(
      receipt.repayments.reduce((sum, item) => sum + item.totalSatang, 0n),
    ).toBe(amountSatang);

    const persistedRepayments = await prisma.repayment.findMany({
      where: { ledgerTransactionId: result.ledgerTransactionId },
      orderBy: { installment: { installmentNumber: "asc" } },
      select: { id: true, installmentId: true, ledgerTransactionId: true },
    });
    expect(receipt.repayments.map((item) => item.repaymentId)).toEqual(
      persistedRepayments.map((repayment) => repayment.id),
    );
    expect(
      persistedRepayments.every(
        (repayment) =>
          repayment.ledgerTransactionId === result.ledgerTransactionId,
      ),
    ).toBe(true);
  });

  it("RCP-04 separates interest and principal for interest-first allocation", async () => {
    const context = await createContext();
    const first = await getFirstPayableInstallment(context);

    const amountSatang = first.interestDueSatang + 1_234n;
    const result = await submit(context, amountSatang);
    const receipt = expectReceipt(result);
    const item = receipt.repayments[0];

    expect(item).toBeDefined();
    expect(item?.interestSatang).toBe(first.interestDueSatang);
    expect(item?.principalSatang).toBe(1_234n);
    expect(item?.totalSatang).toBe(1_234n + first.interestDueSatang);
  });

  it("RCP-05 carries receipt identity, repayment references, loan, transaction, and timestamp", async () => {
    const context = await createContext();
    const first = await getFirstPayableInstallment(context);

    const result = await submit(context, outstandingTotal(first));
    const receipt = expectReceipt(result);
    const [transaction, persistedRepayments] = await Promise.all([
      prisma.ledgerTransaction.findUniqueOrThrow({
        where: { id: result.ledgerTransactionId },
        select: { status: true, postedAt: true },
      }),
      prisma.repayment.findMany({
        where: { ledgerTransactionId: result.ledgerTransactionId },
        orderBy: { installment: { installmentNumber: "asc" } },
        select: {
          id: true,
          loanId: true,
          ledgerTransactionId: true,
          receivedAt: true,
        },
      }),
    ]);

    expect(receipt.receiptId).toEqual(expect.any(String));
    expect(receipt.receiptId.trim().length).toBeGreaterThan(0);
    expect(receipt.loanId).toBe(context.loan.id);
    expect(receipt.ledgerTransactionId).toBe(result.ledgerTransactionId);
    expect(receipt.receiptTimestamp).toBeInstanceOf(Date);
    expect(transaction.status).toBe("POSTED");
    expect(transaction.postedAt).not.toBeNull();
    if (!transaction.postedAt) {
      throw new Error("Posted ledger transaction has no postedAt timestamp.");
    }
    expect(receipt.receiptTimestamp).toEqual(transaction.postedAt);
    expect(receipt.repaymentIds).toEqual(
      persistedRepayments.map((repayment) => repayment.id),
    );
    expect(
      persistedRepayments.every(
        (repayment) =>
          repayment.loanId === context.loan.id &&
          repayment.ledgerTransactionId === result.ledgerTransactionId,
      ),
    ).toBe(true);
  });

  it("RCP-06 returns no completed receipt when repayment posting fails", async () => {
    const context = await createContext();
    const payable = await getPayableInstallments(context);
    const payableSatang = payable.reduce(
      (sum, installment) => sum + outstandingTotal(installment),
      0n,
    );
    if (payableSatang <= 0n) {
      throw new Error("Lifecycle fixture did not create payable obligations.");
    }
    const key = idempotencyKey();
    const [repaymentsBefore, allocationsBefore, installmentsBefore, walletsBefore] =
      await Promise.all([
        prisma.repayment.findMany({
          where: { loanId: context.loan.id },
          orderBy: [{ installmentId: "asc" }, { id: "asc" }],
        }),
        prisma.payoutAllocation.findMany({
          where: { repayment: { loanId: context.loan.id } },
          orderBy: [{ repaymentId: "asc" }, { investmentId: "asc" }],
        }),
        prisma.installment.findMany({
          where: { scheduleVersion: { schedule: { loanId: context.loan.id } } },
          orderBy: { installmentNumber: "asc" },
        }),
        getWalletBalances(context),
      ]);

    await expect(
      submit(context, payableSatang + 1n, key),
    ).rejects.toThrow(/exceeds the currently payable outstanding amount/i);

    expect(
      await prisma.ledgerTransaction.findUnique({
        where: { idempotencyKey: key },
      }),
    ).toBeNull();
    const [repaymentsAfter, allocationsAfter, installmentsAfter] =
      await Promise.all([
        prisma.repayment.findMany({
          where: { loanId: context.loan.id },
          orderBy: [{ installmentId: "asc" }, { id: "asc" }],
        }),
        prisma.payoutAllocation.findMany({
          where: { repayment: { loanId: context.loan.id } },
          orderBy: [{ repaymentId: "asc" }, { investmentId: "asc" }],
        }),
        prisma.installment.findMany({
          where: { scheduleVersion: { schedule: { loanId: context.loan.id } } },
          orderBy: { installmentNumber: "asc" },
        }),
      ]);
    expect(repaymentsAfter).toEqual(repaymentsBefore);
    expect(allocationsAfter).toEqual(allocationsBefore);
    expect(installmentsAfter).toEqual(installmentsBefore);
    expect(await getWalletBalances(context)).toEqual(walletsBefore);
  });

  it("RCP-07 matches receipt values to committed repayment and installment records", async () => {
    const context = await createContext();
    const first = await getFirstPayableInstallment(context);

    const result = await submit(context, first.interestDueSatang + 3_210n);
    const receipt = expectReceipt(result);
    const persisted = await prisma.repayment.findMany({
      where: { ledgerTransactionId: result.ledgerTransactionId },
      include: { installment: true },
      orderBy: { installment: { installmentNumber: "asc" } },
    });

    const transaction = await prisma.ledgerTransaction.findUniqueOrThrow({
      where: { id: result.ledgerTransactionId },
      select: { status: true, postedAt: true },
    });
    expect(transaction.status).toBe("POSTED");
    expect(transaction.postedAt).toBeInstanceOf(Date);
    expect(receipt.totalReceivedSatang).toBe(
      persisted.reduce((sum, item) => sum + item.totalSatang, 0n),
    );
    expect(receipt.ledgerTransactionId).toBe(result.ledgerTransactionId);
    expect(receipt.loanId).toBe(context.loan.id);
    expect(receipt.repayments).toHaveLength(persisted.length);
    for (const [index, repayment] of persisted.entries()) {
      const receiptItem = receipt.repayments[index];
      expect(receiptItem?.repaymentId).toBe(repayment.id);
      expect(receiptItem?.installmentId).toBe(repayment.installmentId);
      expect(receiptItem?.installmentNumber).toBe(
        repayment.installment.installmentNumber,
      );
      expect(receiptItem?.principalSatang).toBe(repayment.principalSatang);
      expect(receiptItem?.interestSatang).toBe(repayment.interestSatang);
      expect(receiptItem?.totalSatang).toBe(repayment.totalSatang);
      expect(receiptItem?.remainingBalanceSatang).toBe(
        repayment.installment.principalDueSatang -
          repayment.installment.paidPrincipalSatang +
          repayment.installment.interestDueSatang -
          repayment.installment.paidInterestSatang,
      );
    }
  });
});
