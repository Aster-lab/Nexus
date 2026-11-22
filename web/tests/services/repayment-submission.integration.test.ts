
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma";
import { submitRepayment } from "../../src/lib/services/repayment/repayment-submitrepayment";
import {
  generateRepaymentSchedule,
} from "../../src/lib/services/repayment.service";
import { createRepaymentTestContext } from "../fixtures/repayment.fixture";

import type { RepaymentTestContext } from "../fixtures/repayment.fixture";

type InstallmentSnapshot = {
  id: string;
  installmentNumber: number;
  dueDate: Date;
  principalDueSatang: bigint;
  interestDueSatang: bigint;
  paidPrincipalSatang: bigint;
  paidInterestSatang: bigint;
  status: string;
};

type SubmissionResult = Awaited<ReturnType<typeof submitRepayment>>;

const makeIdempotencyKey = () => `repayment-test-${randomUUID()}`;

const outstandingPrincipal = (item: InstallmentSnapshot) =>
  item.principalDueSatang - item.paidPrincipalSatang;

const outstandingInterest = (item: InstallmentSnapshot) =>
  item.interestDueSatang - item.paidInterestSatang;

const outstandingTotal = (item: InstallmentSnapshot) =>
  outstandingPrincipal(item) + outstandingInterest(item);

const sumOutstanding = (items: InstallmentSnapshot[]) =>
  items.reduce((sum, item) => sum + outstandingTotal(item), 0n);

async function createDueRepaymentContext(
  monthsAgo = 3,
): Promise<RepaymentTestContext> {
  const context = await createRepaymentTestContext();

  try {
    const disbursedAt = new Date();
    disbursedAt.setMonth(disbursedAt.getMonth() - monthsAgo);

    await prisma.loan.update({
      where: { id: context.loan.id },
      data: {
        status: "ACTIVE",
        disbursedAt,
      },
    });

    await generateRepaymentSchedule({
      loanId: context.loan.id,
      actorUserId: context.administratorUserId,
    });

    return context;
  } catch (error) {
    await context.cleanup();
    throw error;
  }
}

async function createFutureScheduleContext(): Promise<RepaymentTestContext> {
  const context = await createRepaymentTestContext();

  try {
    const futureDisbursement = new Date();
    futureDisbursement.setFullYear(
      futureDisbursement.getFullYear() + 1,
    );

    await prisma.loan.update({
      where: { id: context.loan.id },
      data: {
        status: "ACTIVE",
        disbursedAt: futureDisbursement,
      },
    });

    await generateRepaymentSchedule({
      loanId: context.loan.id,
      actorUserId: context.administratorUserId,
    });

    return context;
  } catch (error) {
    await context.cleanup();
    throw error;
  }
}

async function getCurrentInstallments(
  loanId: string,
): Promise<InstallmentSnapshot[]> {
  const schedule = await prisma.repaymentSchedule.findUniqueOrThrow({
    where: { loanId },
    select: { currentVersionId: true },
  });

  if (!schedule.currentVersionId) {
    throw new Error("Repayment schedule has no current version.");
  }

  return prisma.installment.findMany({
    where: {
      scheduleVersionId: schedule.currentVersionId,
    },
    orderBy: { installmentNumber: "asc" },
    select: {
      id: true,
      installmentNumber: true,
      dueDate: true,
      principalDueSatang: true,
      interestDueSatang: true,
      paidPrincipalSatang: true,
      paidInterestSatang: true,
      status: true,
    },
  });
}

async function getPayableInstallments(
  loanId: string,
): Promise<InstallmentSnapshot[]> {
  const installments = await getCurrentInstallments(loanId);
  const now = new Date();

  return installments
    .filter(
      (item) =>
        item.dueDate <= now &&
        ["PENDING", "PARTIALLY_PAID", "OVERDUE"].includes(item.status) &&
        outstandingTotal(item) > 0n,
    )
    .sort(
      (a, b) =>
        a.dueDate.getTime() - b.dueDate.getTime() ||
        a.installmentNumber - b.installmentNumber,
    );
}

async function submit(
  context: RepaymentTestContext,
  amountSatang: bigint,
  options?: {
    borrowerUserId?: string;
    idempotencyKey?: string;
  },
): Promise<SubmissionResult> {
  return submitRepayment({
    loanId: context.loan.id,
    borrowerUserId:
      options?.borrowerUserId ?? context.borrowerUser.id,
    amountSatang,
    idempotencyKey:
      options?.idempotencyKey ?? makeIdempotencyKey(),
  });
}

async function expectWalletMovement(
  context: RepaymentTestContext,
  amountSatang: bigint,
  before: {
    borrower: bigint;
    clearing: bigint;
  },
) {
  const [borrowerWallet, clearingWallet] = await Promise.all([
    prisma.wallet.findUniqueOrThrow({
      where: { id: context.borrowerWalletId },
      select: { balanceSatang: true },
    }),
    prisma.wallet.findUniqueOrThrow({
      where: { id: context.clearingWalletId },
      select: { balanceSatang: true },
    }),
  ]);

  expect(borrowerWallet.balanceSatang).toBe(
    before.borrower - amountSatang,
  );

  expect(clearingWallet.balanceSatang).toBe(
    before.clearing + amountSatang,
  );
}

async function getWalletBalances(context: RepaymentTestContext) {
  const [borrower, clearing] = await Promise.all([
    prisma.wallet.findUniqueOrThrow({
      where: { id: context.borrowerWalletId },
      select: { balanceSatang: true },
    }),
    prisma.wallet.findUniqueOrThrow({
      where: { id: context.clearingWalletId },
      select: { balanceSatang: true },
    }),
  ]);

  return {
    borrower: borrower.balanceSatang,
    clearing: clearing.balanceSatang,
  };
}

async function expectPostedLedgerTransaction(
  context: RepaymentTestContext,
  ledgerTransactionId: string,
  idempotencyKey: string,
  expectedAmountSatang: bigint,
) {
  const transaction =
    await prisma.ledgerTransaction.findUniqueOrThrow({
      where: { id: ledgerTransactionId },
      include: { entries: true, repayments: true },
    });

  expect(transaction.status).toBe("POSTED");
  expect(transaction.postedAt).toBeInstanceOf(Date);
  expect(transaction.idempotencyKey).toBe(idempotencyKey);

  // Repayments that include principal also post the 1300/1200 receivable
  // movement alongside the borrower-to-clearing wallet transfer.
  const principalSatang = transaction.repayments.reduce(
    (total, repayment) => total + repayment.principalSatang,
    0n,
  );
  expect(transaction.entries).toHaveLength(principalSatang > 0n ? 4 : 2);

  const debit = transaction.entries.find(
    (entry) => entry.entryType === "DEBIT",
  );
  const credit = transaction.entries.find(
    (entry) => entry.entryType === "CREDIT",
  );

  expect(debit).toBeDefined();
  expect(credit).toBeDefined();

  expect(debit!.walletId).toBe(context.borrowerWalletId);
  expect(credit!.walletId).toBe(context.clearingWalletId);

  expect(debit!.platformAccountId).not.toBeNull();
  expect(credit!.platformAccountId).toBeNull();

  expect(debit!.currency).toBe("THB");
  expect(credit!.currency).toBe("THB");

  expect(debit!.amountSatang).toBe(expectedAmountSatang);
  expect(credit!.amountSatang).toBe(expectedAmountSatang);

  expect(transaction.repayments.length).toBeGreaterThan(0);

  return transaction;
}

async function expectPersistedRepayments(
  result: SubmissionResult,
  expectedTotalSatang: bigint,
) {
  const persisted = await prisma.repayment.findMany({
    where: {
      ledgerTransactionId: result.ledgerTransactionId,
    },
    orderBy: { receivedAt: "asc" },
  });

  expect(persisted).toHaveLength(result.repayments.length);
  expect(persisted.length).toBeGreaterThan(0);

  const persistedByInstallment = new Map(
    persisted.map((repayment) => [
      repayment.installmentId,
      repayment,
    ]),
  );

  for (const returned of result.repayments) {
    const saved = persistedByInstallment.get(returned.installmentId);

    expect(saved).toBeDefined();
    expect(saved!.ledgerTransactionId).toBe(
      result.ledgerTransactionId,
    );
    expect(saved!.principalSatang).toBe(returned.principalSatang);
    expect(saved!.interestSatang).toBe(returned.interestSatang);
    expect(saved!.feeSatang).toBe(returned.feeSatang);
    expect(saved!.totalSatang).toBe(returned.totalSatang);
  }

  for (const repayment of persisted) {
    expect(repayment.status).toBe("POSTED");
    expect(repayment.feeSatang).toBe(0n);
    expect(repayment.totalSatang).toBe(
      repayment.principalSatang +
        repayment.interestSatang +
        repayment.feeSatang,
    );
    expect(repayment.receivedAt).toBeInstanceOf(Date);
  }

  const persistedTotal = persisted.reduce(
    (sum, repayment) => sum + repayment.totalSatang,
    0n,
  );

  expect(persistedTotal).toBe(expectedTotalSatang);
  expect(result.totalSatang).toBe(expectedTotalSatang);

  const returnedTotal = result.repayments.reduce(
    (sum, repayment) => sum + repayment.totalSatang,
    0n,
  );

  expect(returnedTotal).toBe(expectedTotalSatang);

  return persisted;
}

async function expectNoRepaymentChanges(
  context: RepaymentTestContext,
  idempotencyKey: string,
  beforeCount: number,
  beforeInstallments: InstallmentSnapshot[],
  beforeWallets: { borrower: bigint; clearing: bigint },
) {
  const afterCount = await prisma.repayment.count({
    where: { loanId: context.loan.id },
  });

  expect(afterCount).toBe(beforeCount);

  const afterInstallments = await getCurrentInstallments(
    context.loan.id,
  );

  expect(afterInstallments).toEqual(beforeInstallments);

  const transaction = await prisma.ledgerTransaction.findUnique({
    where: { idempotencyKey },
  });

  expect(transaction).toBeNull();

  expect(await getWalletBalances(context)).toEqual(beforeWallets);
}

async function getRepaymentState(context: RepaymentTestContext) {
  const [installments, repayments, allocations, transactions, wallets] =
    await Promise.all([
      getCurrentInstallments(context.loan.id),
      prisma.repayment.findMany({
        where: { loanId: context.loan.id },
        orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
      }),
      prisma.payoutAllocation.findMany({
        where: { repayment: { loanId: context.loan.id } },
        orderBy: [{ repaymentId: "asc" }, { investmentId: "asc" }],
      }),
      prisma.ledgerTransaction.findMany({
        where: {
          transactionType: "BORROWER_REPAYMENT",
          referenceId: context.loan.id,
        },
        orderBy: { id: "asc" },
      }),
      getWalletBalances(context),
    ]);

  return { installments, repayments, allocations, transactions, wallets };
}

async function expectAllocationReconciliationForTransaction(
  ledgerTransactionId: string,
) {
  const repayments = await prisma.repayment.findMany({
    where: { ledgerTransactionId },
    include: { payoutAllocations: true },
  });

  expect(repayments.length).toBeGreaterThan(0);
  for (const repayment of repayments) {
    expect(
      repayment.payoutAllocations.reduce(
        (total, allocation) => total + allocation.principalSatang,
        0n,
      ),
    ).toBe(repayment.principalSatang);
    expect(
      repayment.payoutAllocations.reduce(
        (total, allocation) => total + allocation.interestSatang,
        0n,
      ),
    ).toBe(repayment.interestSatang);
    expect(
      repayment.payoutAllocations.reduce(
        (total, allocation) => total + allocation.recoverySatang,
        0n,
      ),
    ).toBe(0n);
  }
}

async function countAllocationsForTransaction(ledgerTransactionId: string) {
  return prisma.payoutAllocation.count({
    where: { repayment: { ledgerTransactionId } },
  });
}

function expectInstallmentMovements(
  before: InstallmentSnapshot[],
  after: InstallmentSnapshot[],
  results: SubmissionResult[],
) {
  const repaymentTotals = new Map<string, { principal: bigint; interest: bigint }>();
  for (const result of results) {
    for (const repayment of result.repayments) {
      const total = repaymentTotals.get(repayment.installmentId) ?? {
        principal: 0n,
        interest: 0n,
      };
      total.principal += repayment.principalSatang;
      total.interest += repayment.interestSatang;
      repaymentTotals.set(repayment.installmentId, total);
    }
  }

  expect(after.map((item) => item.id)).toEqual(before.map((item) => item.id));
  for (const original of before) {
    const updated = after.find((item) => item.id === original.id);
    expect(updated).toBeDefined();
    const movement = repaymentTotals.get(original.id) ?? {
      principal: 0n,
      interest: 0n,
    };
    expect(updated!.paidPrincipalSatang).toBe(
      original.paidPrincipalSatang + movement.principal,
    );
    expect(updated!.paidInterestSatang).toBe(
      original.paidInterestSatang + movement.interest,
    );
  }
}

describe("REP — repayment submission", () => {
  const contexts: RepaymentTestContext[] = [];

  afterEach(async () => {
    for (const context of contexts.splice(0)) {
      await context.cleanup();
    }
  });

  async function track(
    context: RepaymentTestContext,
  ): Promise<RepaymentTestContext> {
    contexts.push(context);
    return context;
  }

  it("REP-01: submits a full payment for one due installment", async () => {
    const context = await track(await createDueRepaymentContext());
    const payable = await getPayableInstallments(context.loan.id);

    expect(payable.length).toBeGreaterThan(0);

    const first = payable[0];
    const amount = outstandingTotal(first);
    const beforeWallets = await getWalletBalances(context);
    const idempotencyKey = makeIdempotencyKey();

    const result = await submit(context, amount, {
      idempotencyKey,
    });

    expect(result.loanId).toBe(context.loan.id);
    expect(result.totalSatang).toBe(amount);
    expect(result.repayments).toHaveLength(1);
    expect(result.repayments[0].installmentId).toBe(first.id);
    expect(result.repayments[0].principalSatang).toBe(
      outstandingPrincipal(first),
    );
    expect(result.repayments[0].interestSatang).toBe(
      outstandingInterest(first),
    );
    expect(result.repayments[0].feeSatang).toBe(0n);

    const updated = await prisma.installment.findUniqueOrThrow({
      where: { id: first.id },
    });

    expect(updated.paidPrincipalSatang).toBe(
      first.principalDueSatang,
    );
    expect(updated.paidInterestSatang).toBe(
      first.interestDueSatang,
    );
    expect(updated.status).toBe("PAID");

    await expectPersistedRepayments(result, amount);
    await expectPostedLedgerTransaction(
      context,
      result.ledgerTransactionId,
      idempotencyKey,
      amount,
    );
    await expectWalletMovement(context, amount, beforeWallets);
    await expect(prisma.notification.findMany({ where: { userId: context.borrowerUser.id, category: "REPAYMENT" } })).resolves.toHaveLength(1);
    await expect(prisma.notification.findFirst({ where: { userId: context.borrowerUser.id, category: "REPAYMENT", actionPath: "/borrower/repayments" } })).resolves.toMatchObject({ status: "UNREAD", title: "Repayment confirmed" });
  });

  it("REP-02: applies an interest-only payment before principal", async () => {
    const context = await track(await createDueRepaymentContext());
    const payable = await getPayableInstallments(context.loan.id);

    const first = payable.find(
      (item) => outstandingInterest(item) > 0n,
    );

    expect(first).toBeDefined();

    const amount = outstandingInterest(first!);
    const beforeWallets = await getWalletBalances(context);
    const idempotencyKey = makeIdempotencyKey();

    const result = await submit(context, amount, {
      idempotencyKey,
    });

    expect(result.repayments).toHaveLength(1);
    expect(result.repayments[0].interestSatang).toBe(amount);
    expect(result.repayments[0].principalSatang).toBe(0n);
    expect(result.repayments[0].feeSatang).toBe(0n);

    const updated = await prisma.installment.findUniqueOrThrow({
      where: { id: first!.id },
    });

    expect(updated.paidInterestSatang).toBe(
      first!.interestDueSatang,
    );
    expect(updated.paidPrincipalSatang).toBe(
      first!.paidPrincipalSatang,
    );

    if (outstandingPrincipal(first!) > 0n) {
      expect(updated.status).toBe("OVERDUE");
    }

    await expectPersistedRepayments(result, amount);
    await expectPostedLedgerTransaction(
      context,
      result.ledgerTransactionId,
      idempotencyKey,
      amount,
    );
    await expectWalletMovement(context, amount, beforeWallets);
  });

  it("REP-03: pays outstanding interest before reducing principal", async () => {
    const context = await track(await createDueRepaymentContext());
    const payable = await getPayableInstallments(context.loan.id);

    const first = payable.find(
      (item) =>
        outstandingInterest(item) > 0n &&
        outstandingPrincipal(item) > 0n,
    );

    expect(first).toBeDefined();

    const interest = outstandingInterest(first!);
    const principalPayment = 1n;
    const amount = interest + principalPayment;
    const beforeWallets = await getWalletBalances(context);
    const idempotencyKey = makeIdempotencyKey();

    const result = await submit(context, amount, {
      idempotencyKey,
    });

    expect(result.repayments).toHaveLength(1);
    expect(result.repayments[0].interestSatang).toBe(interest);
    expect(result.repayments[0].principalSatang).toBe(
      principalPayment,
    );
    expect(result.repayments[0].totalSatang).toBe(amount);

    const updated = await prisma.installment.findUniqueOrThrow({
      where: { id: first!.id },
    });

    expect(updated.paidInterestSatang).toBe(
      first!.interestDueSatang,
    );
    expect(updated.paidPrincipalSatang).toBe(
      first!.paidPrincipalSatang + principalPayment,
    );
    expect(updated.status).toBe("OVERDUE");

    await expectPersistedRepayments(result, amount);
    await expectPostedLedgerTransaction(
      context,
      result.ledgerTransactionId,
      idempotencyKey,
      amount,
    );
    await expectWalletMovement(context, amount, beforeWallets);
  });

  it("REP-04: completes an installment with a second partial payment", async () => {
    const context = await track(await createDueRepaymentContext());
    const payable = await getPayableInstallments(context.loan.id);

    const first = payable[0];
    const total = outstandingTotal(first);

    expect(total).toBeGreaterThan(1n);

    const firstPayment = total / 2n;
    const secondPayment = total - firstPayment;

    const firstKey = makeIdempotencyKey();
    const secondKey = makeIdempotencyKey();

    const firstWallets = await getWalletBalances(context);
    const firstResult = await submit(context, firstPayment, {
      idempotencyKey: firstKey,
    });

    expect(firstResult.totalSatang).toBe(firstPayment);

    const afterFirst = await prisma.installment.findUniqueOrThrow({
      where: { id: first.id },
    });

    expect(afterFirst.status).toBe("OVERDUE");

    await expectPersistedRepayments(firstResult, firstPayment);
    await expectPostedLedgerTransaction(
      context,
      firstResult.ledgerTransactionId,
      firstKey,
      firstPayment,
    );
    await expectWalletMovement(context, firstPayment, firstWallets);

    const secondWallets = await getWalletBalances(context);
    const secondResult = await submit(context, secondPayment, {
      idempotencyKey: secondKey,
    });

    expect(secondResult.totalSatang).toBe(secondPayment);
    expect(secondResult.ledgerTransactionId).not.toBe(
      firstResult.ledgerTransactionId,
    );

    const afterSecond = await prisma.installment.findUniqueOrThrow({
      where: { id: first.id },
    });

    expect(afterSecond.paidPrincipalSatang).toBe(
      first.principalDueSatang,
    );
    expect(afterSecond.paidInterestSatang).toBe(
      first.interestDueSatang,
    );
    expect(afterSecond.status).toBe("PAID");

    await expectPersistedRepayments(secondResult, secondPayment);
    await expectPostedLedgerTransaction(
      context,
      secondResult.ledgerTransactionId,
      secondKey,
      secondPayment,
    );
    await expectWalletMovement(context, secondPayment, secondWallets);
  });

  it("REP-05: allocates across installments oldest first and interest first", async () => {
    const context = await track(await createDueRepaymentContext());
    const payable = await getPayableInstallments(context.loan.id);

    expect(payable.length).toBeGreaterThanOrEqual(2);

    const first = payable[0];
    const second = payable[1];

    expect(outstandingInterest(second)).toBeGreaterThan(0n);

    const amount = outstandingTotal(first) + 1n;
    const beforeWallets = await getWalletBalances(context);
    const idempotencyKey = makeIdempotencyKey();

    const result = await submit(context, amount, {
      idempotencyKey,
    });

    expect(result.repayments).toHaveLength(2);

    expect(result.repayments[0].installmentId).toBe(first.id);
    expect(result.repayments[0].principalSatang).toBe(
      outstandingPrincipal(first),
    );
    expect(result.repayments[0].interestSatang).toBe(
      outstandingInterest(first),
    );
    expect(result.repayments[0].totalSatang).toBe(
      outstandingTotal(first),
    );

    expect(result.repayments[1].installmentId).toBe(second.id);
    expect(result.repayments[1].interestSatang).toBe(1n);
    expect(result.repayments[1].principalSatang).toBe(0n);
    expect(result.repayments[1].totalSatang).toBe(1n);

    const [updatedFirst, updatedSecond] = await Promise.all([
      prisma.installment.findUniqueOrThrow({
        where: { id: first.id },
      }),
      prisma.installment.findUniqueOrThrow({
        where: { id: second.id },
      }),
    ]);

    expect(updatedFirst.status).toBe("PAID");
    expect(updatedSecond.status).toBe("OVERDUE");
    expect(updatedSecond.paidInterestSatang).toBe(
      second.paidInterestSatang + 1n,
    );
    expect(updatedSecond.paidPrincipalSatang).toBe(
      second.paidPrincipalSatang,
    );

    await expectPersistedRepayments(result, amount);
    await expectPostedLedgerTransaction(
      context,
      result.ledgerTransactionId,
      idempotencyKey,
      amount,
    );
    await expectWalletMovement(context, amount, beforeWallets);
  });

  it("REP-06: stores multiple repayment rows under one ledger transaction", async () => {
    const context = await track(await createDueRepaymentContext());
    const payable = await getPayableInstallments(context.loan.id);

    expect(payable.length).toBeGreaterThanOrEqual(2);

    const first = payable[0];
    const second = payable[1];
    const amount =
      outstandingTotal(first) + outstandingTotal(second);

    const beforeWallets = await getWalletBalances(context);
    const idempotencyKey = makeIdempotencyKey();

    const result = await submit(context, amount, {
      idempotencyKey,
    });

    expect(result.repayments).toHaveLength(2);

    const persisted = await expectPersistedRepayments(
      result,
      amount,
    );

    expect(
      new Set(persisted.map((item) => item.ledgerTransactionId)),
    ).toEqual(new Set([result.ledgerTransactionId]));

    expect(
      new Set(persisted.map((item) => item.installmentId)),
    ).toEqual(new Set([first.id, second.id]));

    await expectPostedLedgerTransaction(
      context,
      result.ledgerTransactionId,
      idempotencyKey,
      amount,
    );
    await expectWalletMovement(context, amount, beforeWallets);
  }, 60_000);

  it("REP-07: accepts overdue repayment for a DELINQUENT loan without penalty", async () => {
    const context = await track(
      await createDueRepaymentContext(6),
    );

    await prisma.loan.update({
      where: { id: context.loan.id },
      data: { status: "DELINQUENT" },
    });

    const loan = await prisma.loan.findUniqueOrThrow({
      where: { id: context.loan.id },
      select: { status: true },
    });

    expect(loan.status).toBe("DELINQUENT");

    const payable = await getPayableInstallments(context.loan.id);
    expect(payable.length).toBeGreaterThan(0);

    const first = payable[0];
    expect(first.dueDate.getTime()).toBeLessThan(Date.now());

    const amount = outstandingTotal(first);
    const beforeWallets = await getWalletBalances(context);
    const idempotencyKey = makeIdempotencyKey();

    const result = await submit(context, amount, {
      idempotencyKey,
    });

    expect(result.totalSatang).toBe(amount);

    const persisted = await expectPersistedRepayments(
      result,
      amount,
    );

    expect(
      persisted.reduce(
        (sum, repayment) => sum + repayment.feeSatang,
        0n,
      ),
    ).toBe(0n);

    await expectPostedLedgerTransaction(
      context,
      result.ledgerTransactionId,
      idempotencyKey,
      amount,
    );
    await expectWalletMovement(context, amount, beforeWallets);
  });

  it("REP-08: rejects a zero repayment amount without side effects", async () => {
    const context = await track(await createDueRepaymentContext());
    const key = makeIdempotencyKey();

    const beforeCount = await prisma.repayment.count({
      where: { loanId: context.loan.id },
    });
    const beforeInstallments = await getCurrentInstallments(
      context.loan.id,
    );
    const beforeWallets = await getWalletBalances(context);

    await expect(
      submit(context, 0n, { idempotencyKey: key }),
    ).rejects.toThrow();

    await expectNoRepaymentChanges(
      context,
      key,
      beforeCount,
      beforeInstallments,
      beforeWallets,
    );
  });

  it("REP-09: rejects a negative repayment amount without side effects", async () => {
    const context = await track(await createDueRepaymentContext());
    const key = makeIdempotencyKey();

    const beforeCount = await prisma.repayment.count({
      where: { loanId: context.loan.id },
    });
    const beforeInstallments = await getCurrentInstallments(
      context.loan.id,
    );
    const beforeWallets = await getWalletBalances(context);

    await expect(
      submit(context, -1n, { idempotencyKey: key }),
    ).rejects.toThrow();

    await expectNoRepaymentChanges(
      context,
      key,
      beforeCount,
      beforeInstallments,
      beforeWallets,
    );
  });

  it("REP-10: rejects an amount greater than payable outstanding", async () => {
    const context = await track(await createDueRepaymentContext());
    const payable = await getPayableInstallments(context.loan.id);

    expect(payable.length).toBeGreaterThan(0);

    const amount = sumOutstanding(payable) + 1n;
    const key = makeIdempotencyKey();

    const beforeCount = await prisma.repayment.count({
      where: { loanId: context.loan.id },
    });
    const beforeInstallments = await getCurrentInstallments(
      context.loan.id,
    );
    const beforeWallets = await getWalletBalances(context);

    await expect(
      submit(context, amount, { idempotencyKey: key }),
    ).rejects.toThrow();

    await expectNoRepaymentChanges(
      context,
      key,
      beforeCount,
      beforeInstallments,
      beforeWallets,
    );
  });

  it("REP-11: rejects repayment when no installments are payable", async () => {
    const context = await track(
      await createFutureScheduleContext(),
    );

    expect(
      await getPayableInstallments(context.loan.id),
    ).toHaveLength(0);

    const key = makeIdempotencyKey();
    const beforeCount = await prisma.repayment.count({
      where: { loanId: context.loan.id },
    });
    const beforeInstallments = await getCurrentInstallments(
      context.loan.id,
    );
    const beforeWallets = await getWalletBalances(context);

    await expect(
      submit(context, 1n, { idempotencyKey: key }),
    ).rejects.toThrow();

    await expectNoRepaymentChanges(
      context,
      key,
      beforeCount,
      beforeInstallments,
      beforeWallets,
    );
  });

  it("REP-12: rejects a user who is not the borrower", async () => {
    const context = await track(await createDueRepaymentContext());
    const payable = await getPayableInstallments(context.loan.id);

    const amount = outstandingTotal(payable[0]);
    const key = makeIdempotencyKey();

    const beforeCount = await prisma.repayment.count({
      where: { loanId: context.loan.id },
    });
    const beforeInstallments = await getCurrentInstallments(
      context.loan.id,
    );
    const beforeWallets = await getWalletBalances(context);

    await expect(
      submit(context, amount, {
        borrowerUserId: context.investorUser.id,
        idempotencyKey: key,
      }),
    ).rejects.toThrow();

    await expectNoRepaymentChanges(
      context,
      key,
      beforeCount,
      beforeInstallments,
      beforeWallets,
    );
  });

  it.each([
    {
      label: "FUNDED loan",
      status: "FUNDED" as const,
      disbursedAt: new Date(),
    },
    {
      label: "loan without a disbursement date",
      status: "ACTIVE" as const,
      disbursedAt: null,
    },
  ])(
    "REP-13: rejects an ineligible $label",
    async ({ status, disbursedAt }) => {
      const context = await track(
        await createDueRepaymentContext(),
      );

      await prisma.loan.update({
        where: { id: context.loan.id },
        data: { status, disbursedAt },
      });

      const key = makeIdempotencyKey();
      const beforeCount = await prisma.repayment.count({
        where: { loanId: context.loan.id },
      });
      const beforeInstallments = await getCurrentInstallments(
        context.loan.id,
      );
      const beforeWallets = await getWalletBalances(context);

      await expect(
        submit(context, 1n, { idempotencyKey: key }),
      ).rejects.toThrow();

      await expectNoRepaymentChanges(
        context,
        key,
        beforeCount,
        beforeInstallments,
        beforeWallets,
      );
    },
  );

  it("REP-14: rejects repayment against a REPAID loan", async () => {
    const context = await track(await createDueRepaymentContext());

    await prisma.loan.update({
      where: { id: context.loan.id },
      data: { status: "REPAID" },
    });

    const key = makeIdempotencyKey();
    const beforeCount = await prisma.repayment.count({
      where: { loanId: context.loan.id },
    });
    const beforeInstallments = await getCurrentInstallments(
      context.loan.id,
    );
    const beforeWallets = await getWalletBalances(context);

    await expect(
      submit(context, 1n, { idempotencyKey: key }),
    ).rejects.toThrow();

    await expectNoRepaymentChanges(
      context,
      key,
      beforeCount,
      beforeInstallments,
      beforeWallets,
    );
  });

  it("REP-15: returns the original posting for an identical idempotent retry", async () => {
    const context = await track(await createDueRepaymentContext());
    const amount = outstandingTotal(
      (await getPayableInstallments(context.loan.id))[0],
    );
    const idempotencyKey = makeIdempotencyKey();

    const first = await submit(context, amount, { idempotencyKey });
    const retry = await submit(context, amount, { idempotencyKey });

    expect(retry).toEqual(first);
    expect(
      await prisma.ledgerTransaction.count({ where: { idempotencyKey } }),
    ).toBe(1);
    expect(
      await prisma.repayment.count({
        where: { ledgerTransactionId: first.ledgerTransactionId },
      }),
    ).toBe(first.repayments.length);
  });

  it("REP-16: rejects reuse of an idempotency key with a different amount", async () => {
    const context = await track(await createDueRepaymentContext());
    const amount = outstandingTotal(
      (await getPayableInstallments(context.loan.id))[0],
    );
    const idempotencyKey = makeIdempotencyKey();
    const first = await submit(context, amount, { idempotencyKey });

    await expect(
      submit(context, amount + 1n, { idempotencyKey }),
    ).rejects.toThrow();

    expect(
      await prisma.ledgerTransaction.count({ where: { idempotencyKey } }),
    ).toBe(1);
    expect(
      await prisma.repayment.count({
        where: { ledgerTransactionId: first.ledgerTransactionId },
      }),
    ).toBe(first.repayments.length);
  });

  it("REP-17: serializes concurrent repayments so total collection cannot exceed payable obligations", async () => {
    const context = await track(await createDueRepaymentContext());
    const payable = await getPayableInstallments(context.loan.id);
    const amount = sumOutstanding(payable);
    const beforeWallets = await getWalletBalances(context);

    const results = await Promise.allSettled([
      submit(context, amount, { idempotencyKey: makeIdempotencyKey() }),
      submit(context, amount, { idempotencyKey: makeIdempotencyKey() }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const posted = await prisma.ledgerTransaction.findMany({
      where: {
        transactionType: "BORROWER_REPAYMENT",
        referenceId: context.loan.id,
        status: "POSTED",
      },
      include: { repayments: true },
    });
    expect(posted).toHaveLength(1);
    expect(
      posted[0].repayments.reduce((total, repayment) => total + repayment.totalSatang, 0n),
    ).toBe(amount);
    await expectWalletMovement(context, amount, beforeWallets);
  });

  it("REP-18: marks the loan REPAID and records status history when the schedule is settled", async () => {
    const context = await track(await createDueRepaymentContext(36));
    const payable = await getPayableInstallments(context.loan.id);
    const amount = sumOutstanding(payable);
    const beforeWallets = await getWalletBalances(context);
    const result = await submit(context, amount);

    const [loan, history] = await Promise.all([
      prisma.loan.findUniqueOrThrow({
        where: { id: context.loan.id },
        select: { status: true },
      }),
      prisma.loanStatusHistory.findMany({
        where: { loanId: context.loan.id, newStatus: "REPAID" },
      }),
    ]);

    expect(loan.status).toBe("REPAID");
    expect(history).toHaveLength(1);
    expect(history[0].previousStatus).toBe("ACTIVE");
    expect(result.totalSatang).toBe(amount);
    await expectWalletMovement(context, amount, beforeWallets);
  });

  it("IDE-01: posts a sequential duplicate request only once", async () => {
    const context = await track(await createDueRepaymentContext());
    const amount = outstandingTotal(
      (await getPayableInstallments(context.loan.id))[0],
    );
    const before = await getRepaymentState(context);
    const idempotencyKey = makeIdempotencyKey();

    const first = await submit(context, amount, { idempotencyKey });
    const retry = await submit(context, amount, { idempotencyKey });

    expect(retry).toEqual(first);
    const after = await getRepaymentState(context);
    expect(after.transactions).toHaveLength(before.transactions.length + 1);
    expect(after.transactions.filter((row) => row.idempotencyKey === idempotencyKey))
      .toHaveLength(1);
    expect(after.repayments).toHaveLength(before.repayments.length + first.repayments.length);
    expect(after.allocations).toHaveLength(
      before.allocations.length +
        await countAllocationsForTransaction(first.ledgerTransactionId),
    );
    expect(after.wallets.borrower).toBe(before.wallets.borrower - amount);
    expect(after.wallets.clearing).toBe(before.wallets.clearing + amount);
    expectInstallmentMovements(before.installments, after.installments, [first]);
    await expectPostedLedgerTransaction(
      context,
      first.ledgerTransactionId,
      idempotencyKey,
      amount,
    );
    await expectPersistedRepayments(first, amount);
    await expectAllocationReconciliationForTransaction(first.ledgerTransactionId);
  });

  it("IDE-02: resolves concurrent duplicates to one persisted repayment", async () => {
    const context = await track(await createDueRepaymentContext());
    const amount = outstandingTotal(
      (await getPayableInstallments(context.loan.id))[0],
    );
    const before = await getRepaymentState(context);
    const idempotencyKey = makeIdempotencyKey();

    const [first, duplicate] = await Promise.all([
      submit(context, amount, { idempotencyKey }),
      submit(context, amount, { idempotencyKey }),
    ]);

    expect(duplicate).toEqual(first);
    const after = await getRepaymentState(context);
    expect(after.transactions).toHaveLength(before.transactions.length + 1);
    expect(after.transactions.filter((row) => row.idempotencyKey === idempotencyKey))
      .toHaveLength(1);
    expect(after.repayments).toHaveLength(before.repayments.length + first.repayments.length);
    expect(after.allocations).toHaveLength(
      before.allocations.length +
        await countAllocationsForTransaction(first.ledgerTransactionId),
    );
    expect(after.wallets.borrower).toBe(before.wallets.borrower - amount);
    expect(after.wallets.clearing).toBe(before.wallets.clearing + amount);
    expectInstallmentMovements(before.installments, after.installments, [first]);
    await expectPostedLedgerTransaction(
      context,
      first.ledgerTransactionId,
      idempotencyKey,
      amount,
    );
    await expectPersistedRepayments(first, amount);
    await expectAllocationReconciliationForTransaction(first.ledgerTransactionId);
  }, 60_000);

  it("IDE-03: rejects reuse of a key with a different amount without changing the original posting", async () => {
    const context = await track(await createDueRepaymentContext());
    const amount = outstandingTotal(
      (await getPayableInstallments(context.loan.id))[0],
    );
    const key = makeIdempotencyKey();
    const first = await submit(context, amount, { idempotencyKey: key });
    const beforeConflict = await getRepaymentState(context);

    await expect(
      submit(context, amount + 1n, { idempotencyKey: key }),
    ).rejects.toThrow(/do not match the requested repayment/i);

    expect(await getRepaymentState(context)).toEqual(beforeConflict);
    expect(
      await prisma.ledgerTransaction.findUniqueOrThrow({
        where: { id: first.ledgerTransactionId },
      }),
    ).toEqual(beforeConflict.transactions.find((row) => row.id === first.ledgerTransactionId));
  });

  it("IDE-04: rejects reuse of a key for another loan without affecting that loan", async () => {
    const firstContext = await track(await createDueRepaymentContext());
    const secondContext = await track(await createDueRepaymentContext());
    const firstAmount = outstandingTotal(
      (await getPayableInstallments(firstContext.loan.id))[0],
    );
    const secondAmount = outstandingTotal(
      (await getPayableInstallments(secondContext.loan.id))[0],
    );
    const key = makeIdempotencyKey();
    const first = await submit(firstContext, firstAmount, { idempotencyKey: key });
    const firstState = await getRepaymentState(firstContext);
    const secondBefore = await getRepaymentState(secondContext);

    await expect(
      submit(secondContext, secondAmount, { idempotencyKey: key }),
    ).rejects.toThrow(/idempotency key is already associated/i);

    expect(await getRepaymentState(firstContext)).toEqual(firstState);
    expect(await getRepaymentState(secondContext)).toEqual(secondBefore);
    expect(firstState.transactions.filter((row) => row.idempotencyKey === key))
      .toHaveLength(1);
    expect(first.ledgerTransactionId).toBe(
      firstState.transactions.find((row) => row.idempotencyKey === key)?.id,
    );
  }, 60_000);

  it("IDE-05: persists concurrent independent repayments without lost installment or wallet updates", async () => {
    const context = await track(await createDueRepaymentContext());
    const installmentOutstanding = outstandingTotal(
      (await getPayableInstallments(context.loan.id))[0],
    );
    const firstAmount = installmentOutstanding / 2n;
    const secondAmount = installmentOutstanding - firstAmount;
    expect(firstAmount).toBeGreaterThan(0n);
    const before = await getRepaymentState(context);
    const firstKey = makeIdempotencyKey();
    const secondKey = makeIdempotencyKey();

    const [first, second] = await Promise.all([
      submit(context, firstAmount, { idempotencyKey: firstKey }),
      submit(context, secondAmount, { idempotencyKey: secondKey }),
    ]);

    const after = await getRepaymentState(context);
    const total = firstAmount + secondAmount;
    expect(after.transactions).toHaveLength(before.transactions.length + 2);
    expect(after.transactions.filter((row) =>
      [firstKey, secondKey].includes(row.idempotencyKey ?? ""),
    )).toHaveLength(2);
    expect(after.repayments).toHaveLength(
      before.repayments.length + first.repayments.length + second.repayments.length,
    );
    expect(after.wallets.borrower).toBe(before.wallets.borrower - total);
    expect(after.wallets.clearing).toBe(before.wallets.clearing + total);
    expectInstallmentMovements(before.installments, after.installments, [first, second]);
    expect(sumOutstanding(after.installments)).toBe(
      sumOutstanding(before.installments) - total,
    );
    await expectPostedLedgerTransaction(context, first.ledgerTransactionId, firstKey, firstAmount);
    await expectPostedLedgerTransaction(context, second.ledgerTransactionId, secondKey, secondAmount);
    await expectPersistedRepayments(first, firstAmount);
    await expectPersistedRepayments(second, secondAmount);
    await expectAllocationReconciliationForTransaction(first.ledgerTransactionId);
    await expectAllocationReconciliationForTransaction(second.ledgerTransactionId);
  }, 60_000);

  it("IDE-06: rejects one of two concurrent requests that each exceed remaining payable balance", async () => {
    const context = await track(await createDueRepaymentContext());
    const payableBefore = sumOutstanding(
      await getPayableInstallments(context.loan.id),
    );
    const amount = (payableBefore * 60n + 99n) / 100n;
    const before = await getRepaymentState(context);
    const keys = [makeIdempotencyKey(), makeIdempotencyKey()];

    const outcomes = await Promise.allSettled([
      submit(context, amount, { idempotencyKey: keys[0] }),
      submit(context, amount, { idempotencyKey: keys[1] }),
    ]);

    expect(outcomes.filter((result) => result.status === "fulfilled"))
      .toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected"))
      .toHaveLength(1);
    const rejected = outcomes.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(String(rejected?.reason)).toMatch(/exceeds the currently payable outstanding amount/i);
    const fulfilledIndex = outcomes.findIndex((result) => result.status === "fulfilled");
    const rejectedIndex = 1 - fulfilledIndex;
    const successful = (outcomes[fulfilledIndex] as PromiseFulfilledResult<SubmissionResult>).value;
    const after = await getRepaymentState(context);
    expect(sumOutstanding(after.installments)).toBe(
      sumOutstanding(before.installments) - amount,
    );
    expect(after.transactions).toHaveLength(before.transactions.length + 1);
    expect(after.transactions.some((row) => row.idempotencyKey === keys[rejectedIndex]))
      .toBe(false);
    expect(after.wallets.borrower).toBe(before.wallets.borrower - amount);
    expect(after.wallets.clearing).toBe(before.wallets.clearing + amount);
    expectInstallmentMovements(before.installments, after.installments, [successful]);
    expect(successful.totalSatang).toBe(amount);
    await expectPostedLedgerTransaction(
      context,
      successful.ledgerTransactionId,
      keys[fulfilledIndex],
      amount,
    );
    await expectPersistedRepayments(successful, amount);
    await expectAllocationReconciliationForTransaction(successful.ledgerTransactionId);
  }, 60_000);

  it("IDE-07: leaves the idempotency key available after an overpayment fails", async () => {
    const context = await track(await createDueRepaymentContext());
    const payable = sumOutstanding(await getPayableInstallments(context.loan.id));
    const validAmount = outstandingTotal(
      (await getPayableInstallments(context.loan.id))[0],
    );
    const key = makeIdempotencyKey();
    const before = await getRepaymentState(context);

    await expect(
      submit(context, payable + 1n, { idempotencyKey: key }),
    ).rejects.toThrow(/exceeds the currently payable outstanding amount/i);
    expect(await getRepaymentState(context)).toEqual(before);

    const result = await submit(context, validAmount, { idempotencyKey: key });
    const after = await getRepaymentState(context);
    expect(after.transactions).toHaveLength(before.transactions.length + 1);
    expect(after.transactions.filter((row) => row.idempotencyKey === key))
      .toHaveLength(1);
    expect(after.repayments).toHaveLength(
      before.repayments.length + result.repayments.length,
    );
    expect(after.wallets.borrower).toBe(before.wallets.borrower - validAmount);
    expectInstallmentMovements(before.installments, after.installments, [result]);
    await expectPostedLedgerTransaction(context, result.ledgerTransactionId, key, validAmount);
    await expectPersistedRepayments(result, validAmount);
    await expectAllocationReconciliationForTransaction(result.ledgerTransactionId);
  });
});
