import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma";
import {
  assertInvestorWalletCurrency,
  assertPayoutAmountPositive,
  assertPayoutClearingBalance,
  assertPayoutRepaymentPosted,
  postInvestorPayout,
  type PostInvestorPayoutTestOptions,
} from "../../src/lib/services/investor-payout.service";
import { reconcileInvestorPayouts } from "../../src/lib/services/investor-payout-reconciliation.service";
import {
  postWalletTransfer,
  withSerializableTransactionRetry,
} from "../../src/lib/services/ledger-posting.service";
import { submitRepayment } from "../../src/lib/services/repayment/repayment-submitrepayment";
import { createRepaymentAllocationLifecycleContext } from "../fixtures/repayment-allocation.fixture";

type LifecycleContext = Awaited<ReturnType<typeof createRepaymentAllocationLifecycleContext>>;
type AllocationRow = Awaited<ReturnType<typeof prisma.payoutAllocation.findMany>>[number];

const contexts: LifecycleContext[] = [];
const payoutKey = () => `wp7-payout-${randomUUID()}`;

function outstanding(installment: {
  principalDueSatang: bigint;
  interestDueSatang: bigint;
  paidPrincipalSatang: bigint;
  paidInterestSatang: bigint;
}) {
  return installment.principalDueSatang - installment.paidPrincipalSatang +
    installment.interestDueSatang - installment.paidInterestSatang;
}

async function createContext(investorCount: 1 | 2 = 1) {
  const context = await createRepaymentAllocationLifecycleContext(investorCount);
  contexts.push(context);
  return context;
}

async function getDueInstallments(context: LifecycleContext) {
  return prisma.installment.findMany({
    where: {
      scheduleVersion: { schedule: { loanId: context.loan.id } },
      dueDate: { lte: new Date() },
      status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
    },
    orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
  });
}

async function repay(context: LifecycleContext, amountSatang: bigint) {
  return submitRepayment({
    loanId: context.loan.id,
    borrowerUserId: context.borrowerUser.id,
    amountSatang,
    idempotencyKey: payoutKey(),
  });
}

async function allocationsForTransaction(ledgerTransactionId: string) {
  return prisma.payoutAllocation.findMany({
    where: { repayment: { ledgerTransactionId } },
    include: {
      repayment: { include: { ledgerTransaction: true } },
      investment: {
        include: { investorProfile: { select: { id: true, userId: true } } },
      },
      investorPayout: true,
    },
    orderBy: { investmentId: "asc" },
  });
}

async function createPayoutScenario(
  investorCount: 1 | 2 = 1,
  repayments = 1,
  amountForInstallment?: (installment: Awaited<ReturnType<typeof getDueInstallments>>[number]) => bigint,
) {
  const context = await createContext(investorCount);
  const installments = await getDueInstallments(context);
  if (installments.length < repayments) {
    throw new Error(`Expected ${repayments} due installments; found ${installments.length}.`);
  }
  const allocations: (Awaited<ReturnType<typeof allocationsForTransaction>>[number])[] = [];
  for (const installment of installments.slice(0, repayments)) {
    const result = await repay(
      context,
      amountForInstallment?.(installment) ?? outstanding(installment),
    );
    allocations.push(...await allocationsForTransaction(result.ledgerTransactionId));
  }
  return { context, allocations };
}

async function walletForAllocation(allocation: AllocationRow) {
  const investment = await prisma.investment.findUniqueOrThrow({
    where: { id: allocation.investmentId },
    select: { investorProfile: { select: { id: true, userId: true } } },
  });
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { ownerUserId: investment.investorProfile.userId },
  });
  return { investorProfileId: investment.investorProfile.id, wallet };
}

async function payout(
  context: LifecycleContext,
  allocation: AllocationRow,
  idempotencyKey = payoutKey(),
  actorUserId = context.administratorUserId,
  options: PostInvestorPayoutTestOptions = {},
) {
  return postInvestorPayout({
    actorUserId,
    payoutAllocationId: allocation.id,
    idempotencyKey,
  }, options);
}

async function walletSnapshot() {
  return prisma.wallet.findMany({
    orderBy: { id: "asc" },
    select: { id: true, balanceSatang: true },
  });
}

function expectValidPayoutReconciliation(report: Awaited<ReturnType<typeof reconcileInvestorPayouts>>) {
  const details = report.issues
    .map((issue) => `${issue.code} [${issue.entityId}]: ${issue.message}`)
    .join("\n");
  expect(report.valid, details || "No reconciliation issues were returned.").toBe(true);
}

async function payoutState(allocationId: string, walletIds: string[], key?: string) {
  const [payoutRow, wallets, transaction] = await Promise.all([
    prisma.investorPayout.findUnique({ where: { payoutAllocationId: allocationId } }),
    prisma.wallet.findMany({
      where: { id: { in: walletIds } },
      orderBy: { id: "asc" },
      select: { id: true, status: true, currency: true, balanceSatang: true },
    }),
    key ? prisma.ledgerTransaction.findUnique({ where: { idempotencyKey: key } }) : null,
  ]);
  return { payout: payoutRow, wallets, transaction };
}

async function expectRollback(
  context: LifecycleContext,
  allocation: AllocationRow,
  walletIds: string[],
  key: string,
  options: PostInvestorPayoutTestOptions,
) {
  const before = await payoutState(allocation.id, walletIds);
  const allocationBefore = await prisma.payoutAllocation.findUniqueOrThrow({ where: { id: allocation.id } });
  const auditCountBefore = await prisma.auditLog.count({ where: { action: "INVESTOR_PAYOUT_COMPLETED", outcome: "SUCCESS" } });
  await expect(payout(context, allocation, key, context.administratorUserId, options)).rejects.toThrow();
  expect(await payoutState(allocation.id, walletIds, key)).toEqual({
    ...before,
    transaction: null,
  });
  expect(await prisma.payoutAllocation.findUniqueOrThrow({ where: { id: allocation.id } })).toEqual(allocationBefore);
  expect(await prisma.auditLog.count({ where: { action: "INVESTOR_PAYOUT_COMPLETED", outcome: "SUCCESS" } })).toBe(auditCountBefore);
}

async function createAdminSinkWallet(context: LifecycleContext) {
  const existing = await prisma.wallet.findUnique({
    where: { ownerUserId: context.administratorUserId },
  });
  return existing ?? prisma.wallet.create({
    data: {
      ownerUserId: context.administratorUserId,
      currency: "THB",
      balanceSatang: 0n,
      status: "ACTIVE",
    },
  });
}

async function clearingTransfer(
  context: LifecycleContext,
  debitWalletId: string,
  creditWalletId: string,
  amountSatang: bigint,
  label: string,
) {
  if (amountSatang <= 0n) return;
  await withSerializableTransactionRetry((tx) => postWalletTransfer(tx, {
    transactionType: "WP7_TEST_CLEARING_ADJUSTMENT",
    referenceType: "TEST",
    referenceId: context.loan.id,
    description: label,
    idempotencyKey: payoutKey(),
    debitWalletId,
    creditWalletId,
    amountSatang,
  }));
}

afterEach(async () => {
  for (const context of contexts.splice(0).reverse()) await context.cleanup();
});

describe("PAY — investor payout processing", () => {
  it("PAY-01 posts a valid pending allocation to its investor", async () => {
    const { context, allocations } = await createPayoutScenario();
    const allocation = allocations[0];
    const { investorProfileId, wallet } = await walletForAllocation(allocation);
    const amount = allocation.principalSatang + allocation.interestSatang;
    const beforeWallets = await walletSnapshot();
    const beforeAllocation = await prisma.payoutAllocation.findUniqueOrThrow({ where: { id: allocation.id } });

    const result = await payout(context, allocation);
    const saved = await prisma.investorPayout.findUniqueOrThrow({
      where: { id: result.investorPayoutId },
      include: { ledgerTransaction: { include: { entries: true } } },
    });
    const afterWallets = await walletSnapshot();
    const walletMapBefore = new Map(beforeWallets.map((row) => [row.id, row.balanceSatang]));
    const deltas = new Map(afterWallets.map((row) => [row.id, row.balanceSatang - (walletMapBefore.get(row.id) ?? row.balanceSatang)]));
    expect(result.status).toBe("COMPLETED");
    expect(result.amountSatang).toBe(amount);
    expect(saved.investorProfileId).toBe(investorProfileId);
    expect(saved.walletId).toBe(wallet.id);
    expect(saved.payoutAllocationId).toBe(allocation.id);
    expect(saved.principalSatang).toBe(allocation.principalSatang);
    expect(saved.interestSatang).toBe(allocation.interestSatang);
    expect(saved.ledgerTransaction?.status).toBe("POSTED");
    expect(saved.ledgerTransaction?.entries).toHaveLength(2);
    expect(saved.ledgerTransaction?.referenceType).toBe("PAYOUT_ALLOCATION");
    expect(saved.ledgerTransaction?.referenceId).toBe(allocation.id);
    expect(saved.ledgerTransaction?.entries).toContainEqual(expect.objectContaining({
      walletId: context.clearingWalletId,
      entryType: "DEBIT",
      amountSatang: amount,
      currency: "THB",
    }));
    expect(saved.ledgerTransaction?.entries).toContainEqual(expect.objectContaining({
      walletId: wallet.id,
      entryType: "CREDIT",
      amountSatang: amount,
      currency: "THB",
    }));
    expect(deltas.get(wallet.id)).toBe(amount);
    expect(deltas.get(context.clearingWalletId)).toBe(-amount);
    for (const [id, delta] of deltas) {
      if (id !== wallet.id && id !== context.clearingWalletId) expect(delta).toBe(0n);
    }
    expect(await prisma.payoutAllocation.findUniqueOrThrow({ where: { id: allocation.id } })).toEqual(beforeAllocation);
  });

  it("PAY-02 rejects a different-key payout for an allocation already paid", async () => {
    const { context, allocations } = await createPayoutScenario();
    const allocation = allocations[0];
    await payout(context, allocation);
    const before = await payoutState(allocation.id, [context.clearingWalletId, (await walletForAllocation(allocation)).wallet.id]);
    await expect(payout(context, allocation)).rejects.toThrow(/already.*payout|already.*paid|duplicate/i);
    expect(await payoutState(allocation.id, [context.clearingWalletId, (await walletForAllocation(allocation)).wallet.id])).toEqual(before);
  });

  it("PAY-03 rejects a repayment or repayment ledger that is not POSTED", () => {
    expect(() => assertPayoutRepaymentPosted("REVERSED", "POSTED")).toThrow(/POSTED/i);
    expect(() => assertPayoutRepaymentPosted("POSTED", "DRAFT")).toThrow(/POSTED/i);
  });

  it("PAY-04 rejects a CLOSED investor wallet", async () => {
    const { context, allocations } = await createPayoutScenario();
    const allocation = allocations[0];
    const { wallet } = await walletForAllocation(allocation);
    const before = await payoutState(allocation.id, [context.clearingWalletId, wallet.id]);
    try {
      await prisma.wallet.update({ where: { id: wallet.id }, data: { status: "CLOSED" } });
      await expect(payout(context, allocation)).rejects.toThrow(/investor wallet.*active|CLOSED/i);
      expect((await payoutState(allocation.id, [context.clearingWalletId, wallet.id])).payout).toBeNull();
    } finally {
      await prisma.wallet.update({ where: { id: wallet.id }, data: { status: wallet.status } });
    }
    expect(await payoutState(allocation.id, [context.clearingWalletId, wallet.id])).toEqual(before);
  });

  it("PAY-05 rejects an investor wallet with a non-THB currency", async () => {
    const { context, allocations } = await createPayoutScenario();
    const allocation = allocations[0];
    const { wallet } = await walletForAllocation(allocation);
    const before = await payoutState(allocation.id, [context.clearingWalletId, wallet.id]);
    expect(() => assertInvestorWalletCurrency("USD")).toThrow(/currency.*THB/i);
    expect(await prisma.investorPayout.findUnique({ where: { payoutAllocationId: allocation.id } })).toBeNull();
    expect(await payoutState(allocation.id, [context.clearingWalletId, wallet.id])).toEqual(before);
  });

  it("PAY-06 rejects a CLOSED clearing wallet and an insufficient clearing balance", async () => {
    const { context, allocations } = await createPayoutScenario();
    const allocation = allocations[0];
    const clearing = await prisma.wallet.findUniqueOrThrow({ where: { id: context.clearingWalletId } });
    try {
      await prisma.wallet.update({ where: { id: clearing.id }, data: { status: "CLOSED" } });
      await expect(payout(context, allocation)).rejects.toThrow(/clearing wallet.*active|correctly configured/i);
    } finally {
      await prisma.wallet.update({ where: { id: clearing.id }, data: { status: clearing.status } });
    }
    const amount = allocation.principalSatang + allocation.interestSatang;
    expect(() => assertPayoutClearingBalance(amount, amount - 1n)).toThrow(/insufficient.*clearing/i);
    expect(await prisma.investorPayout.findUnique({ where: { payoutAllocationId: allocation.id } })).toBeNull();
  });

  it("PAY-07 transfers a principal-only allocation", async () => {
    const context = await createContext();
    const [installment] = await getDueInstallments(context);
    const interestOnly = installment.interestDueSatang - installment.paidInterestSatang;
    await repay(context, interestOnly);
    const remaining = await prisma.installment.findUniqueOrThrow({ where: { id: installment.id } });
    const principalOnly = remaining.principalDueSatang - remaining.paidPrincipalSatang;
    const principalRepayment = await repay(context, principalOnly);
    const [allocation] = await allocationsForTransaction(principalRepayment.ledgerTransactionId);
    expect(allocation.principalSatang).toBe(principalOnly);
    expect(allocation.interestSatang).toBe(0n);
    const { wallet } = await walletForAllocation(allocation);
    const before = wallet.balanceSatang;
    await payout(context, allocation);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balanceSatang).toBe(before + principalOnly);
    await expect(prisma.notification.findFirst({ where: { userId: allocation.investment.investorProfile.userId, category: "PAYOUT", actionPath: "/investor/payouts" } }))
      .resolves.toMatchObject({ status: "UNREAD", title: "Investor payout completed" });
  });

  it("PAY-08 transfers an interest-only allocation", async () => {
    const context = await createContext();
    const [installment] = await getDueInstallments(context);
    const interest = installment.interestDueSatang - installment.paidInterestSatang;
    expect(interest).toBeGreaterThan(0n);
    const repayment = await repay(context, interest);
    const [allocation] = await allocationsForTransaction(repayment.ledgerTransactionId);
    expect(allocation.principalSatang).toBe(0n);
    expect(allocation.interestSatang).toBe(interest);
    expect((await payout(context, allocation)).amountSatang).toBe(interest);
  });

  it("PAY-09 transfers the combined principal and interest allocation", async () => {
    const { context, allocations } = await createPayoutScenario();
    const allocation = allocations[0];
    expect(allocation.principalSatang).toBeGreaterThan(0n);
    expect(allocation.interestSatang).toBeGreaterThan(0n);
    expect((await payout(context, allocation)).amountSatang).toBe(allocation.principalSatang + allocation.interestSatang);
  });

  it("PAY-10 pays each investor their exact share from one repayment", async () => {
    const { context, allocations } = await createPayoutScenario(2);
    expect(allocations).toHaveLength(2);
    for (const allocation of allocations) {
      const { wallet } = await walletForAllocation(allocation);
      const before = wallet.balanceSatang;
      const result = await payout(context, allocation);
      expect(result.amountSatang).toBe(allocation.principalSatang + allocation.interestSatang);
      expect((await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balanceSatang).toBe(before + result.amountSatang);
    }
  });

  it("PAY-11 pays separate allocations for one investor exactly once", async () => {
    const { context, allocations } = await createPayoutScenario(1, 2);
    expect(allocations).toHaveLength(2);
    const { wallet } = await walletForAllocation(allocations[0]);
    const before = wallet.balanceSatang;
    for (const allocation of allocations) await payout(context, allocation);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balanceSatang).toBe(
      before + allocations.reduce((sum, row) => sum + row.principalSatang + row.interestSatang, 0n),
    );
    const persistedPayouts = await prisma.investorPayout.findMany({
      where: { payoutAllocationId: { in: allocations.map((row) => row.id) } },
    });
    expect(persistedPayouts).toHaveLength(2);
    expect(new Set(persistedPayouts.map((row) => row.ledgerTransactionId)).size).toBe(2);
  });

  it("PAY-12 keeps a zero-value allocation unpaid and creates no payout", async () => {
    const context = await createContext(2);
    const [installment] = await getDueInstallments(context);
    const repayment = await repay(context, 1n);
    const allocations = await allocationsForTransaction(repayment.ledgerTransactionId);
    const zero = allocations.find((row) => row.principalSatang + row.interestSatang === 0n);
    expect(zero).toBeDefined();
    const walletsBefore = await walletSnapshot();
    expect(() => assertPayoutAmountPositive(0n)).toThrow(/positive/i);
    await expect(payout(context, zero!)).rejects.toThrow(/positive/i);
    expect(await prisma.investorPayout.findUnique({ where: { payoutAllocationId: zero!.id } })).toBeNull();
    expect((await prisma.installment.findUniqueOrThrow({ where: { id: installment.id } })).paidInterestSatang).toBe(1n);
    expect(await walletSnapshot()).toEqual(walletsBefore);
  });

  it("PAY-13 reuses the original result for a sequential same-key request", async () => {
    const { context, allocations } = await createPayoutScenario();
    const key = payoutKey();
    const { wallet } = await walletForAllocation(allocations[0]);
    const beforeBalance = wallet.balanceSatang;
    const first = await payout(context, allocations[0], key);
    const duplicate = await payout(context, allocations[0], key);
    expect(duplicate).toEqual(first);
    expect(await prisma.investorPayout.count({ where: { payoutAllocationId: allocations[0].id } })).toBe(1);
    expect(await prisma.ledgerTransaction.count({ where: { idempotencyKey: key } })).toBe(1);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balanceSatang).toBe(
      beforeBalance + first.amountSatang,
    );
  });

  it("PAY-14 resolves concurrent duplicate requests to one payout and transfer", async () => {
    const { context, allocations } = await createPayoutScenario();
    const key = payoutKey();
    const [first, duplicate] = await Promise.all([
      payout(context, allocations[0], key),
      payout(context, allocations[0], key),
    ]);
    expect(duplicate).toEqual(first);
    expect(await prisma.investorPayout.count({ where: { payoutAllocationId: allocations[0].id } })).toBe(1);
    expect(await prisma.ledgerTransaction.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it("PAY-15 rejects reuse of a key for a different allocation", async () => {
    const { context, allocations } = await createPayoutScenario(1, 2);
    const key = payoutKey();
    const first = await payout(context, allocations[0], key);
    await expect(payout(context, allocations[1], key)).rejects.toThrow(/idempotency.*conflict|already.*use/i);
    expect(await prisma.investorPayout.findUniqueOrThrow({ where: { id: first.investorPayoutId } })).toBeTruthy();
    expect(await prisma.investorPayout.count({ where: { payoutAllocationId: allocations[1].id } })).toBe(0);
  });

  it("PAY-16 posts concurrent payouts for different investors without lost wallet updates", async () => {
    const { context, allocations } = await createPayoutScenario(2);
    const targets = await Promise.all(allocations.map(async (allocation) => ({
      allocation,
      wallet: (await walletForAllocation(allocation)).wallet,
    })));
    const before = new Map(targets.map(({ wallet }) => [wallet.id, wallet.balanceSatang]));
    const results = await Promise.all(targets.map(({ allocation }) => payout(context, allocation)));
    for (const { allocation, wallet } of targets) {
      const total = allocation.principalSatang + allocation.interestSatang;
      expect((await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balanceSatang).toBe(before.get(wallet.id)! + total);
    }
    expect(new Set(results.map((row) => row.ledgerTransactionId)).size).toBe(2);
    expect(await prisma.investorPayout.count({ where: { payoutAllocationId: { in: allocations.map((row) => row.id) } } })).toBe(2);
    expect(await prisma.ledgerTransaction.count({ where: { id: { in: results.map((row) => row.ledgerTransactionId) }, status: "POSTED" } })).toBe(2);
  });

  it("PAY-17 rechecks shared clearing funds when different payouts race", async () => {
    const { context, allocations } = await createPayoutScenario(2);
    const amounts = allocations.map((row) => row.principalSatang + row.interestSatang);
    const affordable = amounts.reduce((a, b) => a < b ? a : b);
    const clearing = await prisma.wallet.findUniqueOrThrow({ where: { id: context.clearingWalletId } });
    const sink = await createAdminSinkWallet(context);
    const drain = clearing.balanceSatang - affordable;
    await clearingTransfer(context, clearing.id, sink.id, drain, "Set the payout concurrency test balance.");
    let results: PromiseSettledResult<Awaited<ReturnType<typeof payout>>>[] = [];
    try {
      results = await Promise.allSettled(allocations.map((row) => payout(context, row)));
    } finally {
      await clearingTransfer(context, sink.id, clearing.id, drain, "Restore the payout concurrency test clearing balance.");
    }
    const success = results.filter((row) => row.status === "fulfilled");
    const failure = results.filter((row) => row.status === "rejected");
    expect(success).toHaveLength(1);
    expect(failure).toHaveLength(1);
    expect(String(failure[0].status === "rejected" ? failure[0].reason : "")).toMatch(/insufficient.*clearing/i);
    const successAmount = success[0].status === "fulfilled" ? success[0].value.amountSatang : 0n;
    expect(successAmount).toBe(affordable);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: clearing.id } })).balanceSatang).toBe(
      clearing.balanceSatang - successAmount,
    );
    expect(await prisma.investorPayout.count({ where: { payoutAllocationId: { in: allocations.map((row) => row.id) } } })).toBe(1);
  });

  it("PAY-18 rolls back payout writes when a real ledger persistence constraint fails", async () => {
    const { context, allocations } = await createPayoutScenario();
    const allocation = allocations[0];
    const { wallet } = await walletForAllocation(allocation);
    const key = payoutKey();
    await expectRollback(context, allocation, [wallet.id, context.clearingWalletId], key, {
      afterLedgerPosted: async (tx, ledgerTransactionId) => {
        await tx.ledgerEntry.create({
          data: {
            ledgerTransactionId,
            walletId: context.clearingWalletId,
            platformAccountId: null,
            entryType: "DEBIT",
            amountSatang: 1n,
            currency: "THB",
          },
        });
      },
    });
  });

  it("PAY-19 rolls back the posted ledger when payout persistence fails", async () => {
    const { context, allocations } = await createPayoutScenario();
    const allocation = allocations[0];
    const { wallet } = await walletForAllocation(allocation);
    await expectRollback(context, allocation, [wallet.id, context.clearingWalletId], payoutKey(), {
      createPayout: async (tx, data) => tx.investorPayout.create({
        data: { ...data, walletId: randomUUID() },
        select: { id: true },
      }),
    });
  });

  it("PAY-20 rolls back all posting effects when completion status persistence fails", async () => {
    const { context, allocations } = await createPayoutScenario();
    const allocation = allocations[0];
    const { wallet } = await walletForAllocation(allocation);
    await expectRollback(context, allocation, [wallet.id, context.clearingWalletId], payoutKey(), {
      completePayout: async (tx, payoutId, _ledgerId, completedAt) => tx.investorPayout.updateMany({
        where: { id: payoutId, status: "PENDING" },
        data: { status: "COMPLETED", ledgerTransactionId: randomUUID(), completedAt },
      }),
    });
  });

  it("PAY-21 lets the same key succeed after a failed transaction rolls back", async () => {
    const { context, allocations } = await createPayoutScenario();
    const allocation = allocations[0];
    const { wallet } = await walletForAllocation(allocation);
    const key = payoutKey();
    await expectRollback(context, allocation, [wallet.id, context.clearingWalletId], key, {
      afterLedgerPosted: async (tx, ledgerTransactionId) => {
        await tx.ledgerEntry.create({
          data: {
            ledgerTransactionId,
            walletId: context.clearingWalletId,
            platformAccountId: null,
            entryType: "DEBIT",
            amountSatang: 1n,
            currency: "THB",
          },
        });
      },
    });
    const result = await payout(context, allocation, key);
    expect(result.status).toBe("COMPLETED");
    expect(await prisma.investorPayout.count({ where: { payoutAllocationId: allocation.id } })).toBe(1);
    expect(await prisma.ledgerTransaction.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it("PAY-22 finishes in the schema-supported COMPLETED status", async () => {
    const { context, allocations } = await createPayoutScenario();
    const result = await payout(context, allocations[0]);
    const row = await prisma.investorPayout.findUniqueOrThrow({ where: { id: result.investorPayoutId } });
    expect(row.status).toBe("COMPLETED");
    expect(row.completedAt).toBeInstanceOf(Date);
  });

  it("PAY-23 rejects an invalid transition from COMPLETED", async () => {
    const { context, allocations } = await createPayoutScenario();
    const result = await payout(context, allocations[0]);
    const before = await prisma.investorPayout.findUniqueOrThrow({ where: { id: result.investorPayoutId } });
    await expect(prisma.investorPayout.update({ where: { id: before.id }, data: { status: "PENDING" } })).rejects.toThrow();
    expect(await prisma.investorPayout.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
  });

  it("PAY-24 prevents direct update or deletion of a completed payout", async () => {
    const { context, allocations } = await createPayoutScenario();
    const result = await payout(context, allocations[0]);
    const before = await prisma.investorPayout.findUniqueOrThrow({ where: { id: result.investorPayoutId } });
    await expect(prisma.investorPayout.update({ where: { id: before.id }, data: { attemptCount: before.attemptCount + 1 } })).rejects.toThrow(/immutable|completed/i);
    await expect(prisma.investorPayout.delete({ where: { id: before.id } })).rejects.toThrow(/immutable|completed/i);
    expect(await prisma.investorPayout.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
  });

  it("PAY-25 rejects a borrower attempting to initiate an investor payout", async () => {
    const { context, allocations } = await createPayoutScenario();
    const allocation = allocations[0];
    const { wallet } = await walletForAllocation(allocation);
    const before = await payoutState(allocation.id, [wallet.id, context.clearingWalletId]);
    const auditCountBefore = await prisma.auditLog.count({ where: { action: "INVESTOR_PAYOUT_COMPLETED", outcome: "SUCCESS" } });
    await expect(payout(context, allocation, payoutKey(), context.borrowerUser.id)).rejects.toThrow(/administrator|unauthorized/i);
    expect(await payoutState(allocation.id, [wallet.id, context.clearingWalletId])).toEqual(before);
    expect(await prisma.auditLog.count({ where: { action: "INVESTOR_PAYOUT_COMPLETED", outcome: "SUCCESS" } })).toBe(auditCountBefore);
  });

  it("PAY-26 lets an authorized administrator initiate the payout", async () => {
    const { context, allocations } = await createPayoutScenario();
    expect((await payout(context, allocations[0], payoutKey(), context.administratorUserId)).status).toBe("COMPLETED");
  });

  it("PAY-27 records the administrator and payout references in the success audit", async () => {
    const { context, allocations } = await createPayoutScenario();
    const result = await payout(context, allocations[0]);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "INVESTOR_PAYOUT_COMPLETED",
        targetType: "INVESTOR_PAYOUT",
        targetId: result.investorPayoutId,
      },
    });
    expect(audit.actorUserId).toBe(context.administratorUserId);
    expect(audit.outcome).toBe("SUCCESS");
    expect(audit.createdAt).toBeInstanceOf(Date);
    expect(audit.correlationId).toEqual(expect.any(String));
    expect(audit.newValues).toMatchObject({
      payoutAllocationId: allocations[0].id,
      investorPayoutId: result.investorPayoutId,
      ledgerTransactionId: result.ledgerTransactionId,
      totalSatang: result.amountSatang.toString(),
    });
  });
});

describe("REC — investor payout reconciliation", () => {
  it("REC-01 verifies that every completed payout has a POSTED ledger transaction", async () => {
    const { context, allocations } = await createPayoutScenario();
    await payout(context, allocations[0]);
    const report = await reconcileInvestorPayouts({ actorUserId: context.administratorUserId });
    expectValidPayoutReconciliation(report);
    expect(report.issues).toEqual([]);
    expect(report.checked.completedPayouts).toBeGreaterThan(0);
  });

  it("REC-02 reconciles investor wallet projections from ledger entries", async () => {
    const { context, allocations } = await createPayoutScenario();
    await payout(context, allocations[0]);
    const report = await reconcileInvestorPayouts({ actorUserId: context.administratorUserId });
    expectValidPayoutReconciliation(report);
    expect(report.checked.wallets).toBeGreaterThan(0);
  });

  it("REC-03 reconciles collection and payout movements against the clearing ledger", async () => {
    const { context, allocations } = await createPayoutScenario();
    const clearingBeforePayout = await prisma.wallet.findUniqueOrThrow({
      where: { id: context.clearingWalletId },
      select: { balanceSatang: true },
    });
    const payoutTotal = allocations.reduce(
      (sum, allocation) => sum + allocation.principalSatang + allocation.interestSatang,
      0n,
    );
    await payout(context, allocations[0]);
    const clearingAfterPayout = await prisma.wallet.findUniqueOrThrow({
      where: { id: context.clearingWalletId },
      select: { balanceSatang: true },
    });
    expect(clearingAfterPayout.balanceSatang).toBe(clearingBeforePayout.balanceSatang - payoutTotal);
    const report = await reconcileInvestorPayouts({ actorUserId: context.administratorUserId });
    expectValidPayoutReconciliation(report);
    expect(report.issues.some((issue) => issue.code === "CLEARING_BALANCE_MISMATCH")).toBe(false);
    expect(report.clearing?.ledgerBalanceSatang).toBe(report.clearing?.walletBalanceSatang);
    expect(report.clearing?.completedPayoutsSatang).toBeGreaterThanOrEqual(payoutTotal);
  });

  it("REC-04 reconciles completed payout amounts to source allocations", async () => {
    const { context, allocations } = await createPayoutScenario();
    await payout(context, allocations[0]);
    const report = await reconcileInvestorPayouts({ actorUserId: context.administratorUserId });
    expect(report.issues.some((issue) => issue.code === "PAYOUT_ALLOCATION_MISMATCH")).toBe(false);
  });

  it("REC-05 identifies unpaid allocations without treating them as paid", async () => {
    const { context, allocations } = await createPayoutScenario();
    const report = await reconcileInvestorPayouts({ actorUserId: context.administratorUserId });
    expect(report.unpaidAllocationIds).toContain(allocations[0].id);
    expect(await prisma.investorPayout.findUnique({ where: { payoutAllocationId: allocations[0].id } })).toBeNull();
  });

  it("REC-06 reconciles the full payout state and makes no financial changes", async () => {
    const { context, allocations } = await createPayoutScenario(2);
    for (const allocation of allocations) await payout(context, allocation);
    const [walletsBefore, payoutsBefore, transactionsBefore, allocationsBefore] = await Promise.all([
      walletSnapshot(),
      prisma.investorPayout.findMany({ orderBy: { id: "asc" } }),
      prisma.ledgerTransaction.findMany({ orderBy: { id: "asc" }, include: { entries: true } }),
      prisma.payoutAllocation.findMany({ orderBy: { id: "asc" } }),
    ]);
    const report = await reconcileInvestorPayouts({ actorUserId: context.administratorUserId });
    expectValidPayoutReconciliation(report);
    expect(report.issues).toEqual([]);
    expect(report.checked.allocations).toBeGreaterThanOrEqual(allocations.length);
    expect(report.checked.completedPayouts).toBeGreaterThanOrEqual(allocations.length);
    expect(await walletSnapshot()).toEqual(walletsBefore);
    expect(await prisma.investorPayout.findMany({ orderBy: { id: "asc" } })).toEqual(payoutsBefore);
    expect(await prisma.ledgerTransaction.findMany({ orderBy: { id: "asc" }, include: { entries: true } })).toEqual(transactionsBefore);
    expect(await prisma.payoutAllocation.findMany({ orderBy: { id: "asc" } })).toEqual(allocationsBefore);
  });
});
