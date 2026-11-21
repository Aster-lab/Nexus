import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma";
import { compensateLedgerTransaction } from "../../src/lib/services/compensating-transaction.service";
import { reconcileFinancialState } from "../../src/lib/services/financial-reconciliation.service";
import {
  postWalletTransfer,
  withSerializableTransactionRetry,
} from "../../src/lib/services/ledger-posting.service";
import { submitRepayment } from "../../src/lib/services/repayment/repayment-submitrepayment";
import {
  createRepaymentAllocationLifecycleContext,
  type RepaymentAllocationLifecycleContext,
} from "../fixtures/repayment-allocation.fixture";

const contexts: RepaymentAllocationLifecycleContext[] = [];
const idempotencyKey = () => `auth-audit-${randomUUID()}`;

async function createContext(): Promise<RepaymentAllocationLifecycleContext> {
  const context = await createRepaymentAllocationLifecycleContext(2);
  contexts.push(context);
  return context;
}

async function getFirstPayable(context: RepaymentAllocationLifecycleContext) {
  const installment = await prisma.installment.findFirst({
    where: {
      scheduleVersion: { schedule: { loanId: context.loan.id } },
      dueDate: { lte: new Date() },
      status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
    },
    orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
  });
  if (!installment) throw new Error("Fixture has no payable installment.");
  return installment;
}

function installmentOutstanding(installment: {
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

async function submit(context: RepaymentAllocationLifecycleContext, amountSatang: bigint) {
  return submitRepayment({
    loanId: context.loan.id,
    borrowerUserId: context.borrowerUser.id,
    amountSatang,
    idempotencyKey: idempotencyKey(),
  });
}

async function walletBalances(context: RepaymentAllocationLifecycleContext) {
  return prisma.wallet.findMany({
    where: { id: { in: [context.borrowerWalletId, context.clearingWalletId] } },
    orderBy: { id: "asc" },
    select: { id: true, balanceSatang: true },
  });
}

async function loanFinancialState(context: RepaymentAllocationLifecycleContext) {
  const [transactions, repayments, allocations, installments, wallets] =
    await Promise.all([
      prisma.ledgerTransaction.findMany({
        where: { referenceType: "LOAN", referenceId: context.loan.id },
        orderBy: { id: "asc" },
      }),
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
      walletBalances(context),
    ]);
  return { transactions, repayments, allocations, installments, wallets };
}

async function platformFinancialSnapshot() {
  const [transactions, wallets, repayments, allocations, installments, auditCount] =
    await Promise.all([
      prisma.ledgerTransaction.findMany({
        where: { status: "POSTED" },
        orderBy: { id: "asc" },
      }),
      prisma.wallet.findMany({
        orderBy: { id: "asc" },
        select: { id: true, balanceSatang: true },
      }),
      prisma.repayment.findMany({ orderBy: { id: "asc" } }),
      prisma.payoutAllocation.findMany({ orderBy: { id: "asc" } }),
      prisma.installment.findMany({ orderBy: { id: "asc" } }),
      prisma.auditLog.count(),
    ]);
  return { transactions, wallets, repayments, allocations, installments, auditCount };
}

async function postTestTransfer(context: RepaymentAllocationLifecycleContext) {
  return withSerializableTransactionRetry((tx) =>
    postWalletTransfer(tx, {
      transactionType: "AUTH_AUDIT_TEST_TRANSFER",
      referenceType: "LOAN",
      referenceId: context.loan.id,
      description: "Authorization and audit integration test transfer",
      idempotencyKey: idempotencyKey(),
      debitWalletId: context.borrowerWalletId,
      creditWalletId: context.clearingWalletId,
      amountSatang: 1n,
    }),
  );
}

function auditPayload(values: unknown): Record<string, unknown> {
  return values && typeof values === "object" && !Array.isArray(values)
    ? values as Record<string, unknown>
    : {};
}

afterEach(async () => {
  for (const context of contexts.splice(0).reverse()) {
    await context.cleanup();
  }
});

describe("AUTH/AUD — repayment authorization and financial audit", () => {
  it("AUTH-01 allows a borrower to repay their own loan and uses that borrower as actor", async () => {
    const context = await createContext();
    const installment = await getFirstPayable(context);
    const result = await submit(context, installmentOutstanding(installment));
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "REPAYMENT_SUBMITTED",
        targetType: "LOAN",
        targetId: context.loan.id,
        actorUserId: context.borrowerUser.id,
      },
      orderBy: { createdAt: "desc" },
    });

    expect(result.loanId).toBe(context.loan.id);
    expect(result.totalSatang).toBe(installmentOutstanding(installment));
    expect(audit.actorUserId).toBe(context.borrowerUser.id);
    expect(audit.outcome).toBe("SUCCESS");
    expect(audit.createdAt).toBeInstanceOf(Date);
    expect(audit.targetId).toBe(context.loan.id);
    expect(auditPayload(audit.newValues)).toMatchObject({
      loanId: context.loan.id,
      ledgerTransactionId: result.ledgerTransactionId,
      totalSatang: result.totalSatang.toString(),
    });
  });

  it("AUTH-02 rejects one borrower's attempt to repay another borrower's loan without side effects", async () => {
    const borrowerA = await createContext();
    const borrowerB = await createContext();
    const installmentB = await getFirstPayable(borrowerB);
    const before = await loanFinancialState(borrowerB);
    const successAuditCountBefore = await prisma.auditLog.count({
      where: {
        action: "REPAYMENT_SUBMITTED",
        targetType: "LOAN",
        targetId: borrowerB.loan.id,
        outcome: "SUCCESS",
      },
    });

    await expect(
      submitRepayment({
        loanId: borrowerB.loan.id,
        borrowerUserId: borrowerA.borrowerUser.id,
        amountSatang: installmentOutstanding(installmentB),
        idempotencyKey: idempotencyKey(),
      }),
    ).rejects.toThrow(/not authorized|only the loan borrower/i);

    expect(await loanFinancialState(borrowerB)).toEqual(before);
    expect(
      await prisma.auditLog.count({
        where: {
          action: "REPAYMENT_SUBMITTED",
          targetType: "LOAN",
          targetId: borrowerB.loan.id,
          outcome: "SUCCESS",
        },
      }),
    ).toBe(successAuditCountBefore);
  }, 60_000);

  it("AUTH-03 denies borrower and investor compensation attempts, then records the administrator on success", async () => {
    const context = await createContext();
    const original = await postTestTransfer(context);
    const originalBefore = await prisma.ledgerTransaction.findUniqueOrThrow({
      where: { id: original.ledgerTransactionId },
      include: { entries: true },
    });
    const balancesBefore = await walletBalances(context);
    const compensationAuditCountBefore = await prisma.auditLog.count({
      where: {
        action: "COMPENSATING_TRANSACTION_CREATED",
        targetType: "LEDGER_TRANSACTION",
        targetId: original.ledgerTransactionId,
        outcome: "SUCCESS",
      },
    });

    for (const actorUserId of [context.borrowerUser.id, context.investorUser.id]) {
      await expect(
        compensateLedgerTransaction({
          actorUserId,
          originalLedgerTransactionId: original.ledgerTransactionId,
          idempotencyKey: idempotencyKey(),
          reason: "Unauthorized correction attempt",
        }),
      ).rejects.toThrow(/administrator|unauthorized/i);
    }

    expect(
      await prisma.ledgerTransaction.findUniqueOrThrow({
        where: { id: original.ledgerTransactionId },
        include: { entries: true },
      }),
    ).toEqual(originalBefore);
    expect(
      await prisma.ledgerTransaction.findFirst({
        where: { reversedTransactionId: original.ledgerTransactionId },
      }),
    ).toBeNull();
    expect(await walletBalances(context)).toEqual(balancesBefore);
    expect(
      await prisma.auditLog.count({
        where: {
          action: "COMPENSATING_TRANSACTION_CREATED",
          targetType: "LEDGER_TRANSACTION",
          targetId: original.ledgerTransactionId,
          outcome: "SUCCESS",
        },
      }),
    ).toBe(compensationAuditCountBefore);

    const compensation = await compensateLedgerTransaction({
      actorUserId: context.administratorUserId,
      originalLedgerTransactionId: original.ledgerTransactionId,
      idempotencyKey: idempotencyKey(),
      reason: "Authorized correction",
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "COMPENSATING_TRANSACTION_CREATED",
        targetType: "LEDGER_TRANSACTION",
        targetId: original.ledgerTransactionId,
        actorUserId: context.administratorUserId,
        outcome: "SUCCESS",
      },
      orderBy: { createdAt: "desc" },
    });

    expect(compensation.compensatingLedgerTransactionId).toBeTruthy();
    expect(audit.actorUserId).toBe(context.administratorUserId);
    expect(audit.createdAt).toBeInstanceOf(Date);
    expect(auditPayload(audit.newValues)).toMatchObject({
      originalLedgerTransactionId: original.ledgerTransactionId,
      compensatingLedgerTransactionId: compensation.compensatingLedgerTransactionId,
    });
    expect(
      await prisma.ledgerTransaction.findUniqueOrThrow({
        where: { id: original.ledgerTransactionId },
        include: { entries: true },
      }),
    ).toEqual(originalBefore);
  });

  it("AUTH-04 denies reconciliation to borrowers and investors, while an administrator receives a read-only report", async () => {
    const context = await createContext();
    const before = await platformFinancialSnapshot();

    for (const actorUserId of [context.borrowerUser.id, context.investorUser.id]) {
      await expect(reconcileFinancialState({ actorUserId })).rejects.toThrow(
        /administrator|unauthorized/i,
      );
    }

    const report = await reconcileFinancialState({
      actorUserId: context.administratorUserId,
    });

    expect(report.valid).toBe(true);
    expect(await platformFinancialSnapshot()).toEqual(before);
  });

  it("AUD-01 persists a successful repayment audit with actor, financial references, and timestamp", async () => {
    const context = await createContext();
    const installment = await getFirstPayable(context);
    const result = await submit(context, installmentOutstanding(installment));
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "REPAYMENT_SUBMITTED",
        targetType: "LOAN",
        targetId: context.loan.id,
        outcome: "SUCCESS",
      },
    });
    const persistedRepaymentIds = await prisma.repayment.findMany({
      where: { ledgerTransactionId: result.ledgerTransactionId },
      orderBy: { installment: { installmentNumber: "asc" } },
      select: { id: true },
    });
    const payload = auditPayload(audit.newValues);

    expect(audit.actorUserId).toBe(context.borrowerUser.id);
    expect(audit.createdAt).toBeInstanceOf(Date);
    expect(audit.correlationId).toEqual(expect.any(String));
    expect(payload.loanId).toBe(context.loan.id);
    expect(payload.ledgerTransactionId).toBe(result.ledgerTransactionId);
    expect(payload.idempotencyKey).toEqual(expect.any(String));
    expect(payload.repaymentIds).toEqual(persistedRepaymentIds.map((row) => row.id));
  });

  it("AUD-02 records the compensation actor and preserves the original audit history", async () => {
    const context = await createContext();
    const original = await postTestTransfer(context);
    await prisma.auditLog.create({
      data: {
        actorUserId: context.administratorUserId,
        action: "AUTH_AUDIT_ORIGINAL_OPERATION",
        targetType: "LEDGER_TRANSACTION",
        targetId: original.ledgerTransactionId,
        reason: "Preexisting audit history for compensation coverage",
        outcome: "SUCCESS",
        correlationId: randomUUID(),
      },
    });
    const originalAuditHistory = await prisma.auditLog.findMany({
      where: { targetId: original.ledgerTransactionId },
      orderBy: { createdAt: "asc" },
    });
    const compensation = await compensateLedgerTransaction({
      actorUserId: context.administratorUserId,
      originalLedgerTransactionId: original.ledgerTransactionId,
      idempotencyKey: idempotencyKey(),
      reason: "Audit verification correction",
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "COMPENSATING_TRANSACTION_CREATED",
        targetType: "LEDGER_TRANSACTION",
        targetId: original.ledgerTransactionId,
      },
      orderBy: { createdAt: "desc" },
    });

    expect(audit.actorUserId).toBe(context.administratorUserId);
    expect(audit.outcome).toBe("SUCCESS");
    expect(audit.createdAt).toBeInstanceOf(Date);
    expect(auditPayload(audit.newValues)).toMatchObject({
      originalLedgerTransactionId: original.ledgerTransactionId,
      compensatingLedgerTransactionId: compensation.compensatingLedgerTransactionId,
    });
    const historyAfter = await prisma.auditLog.findMany({
      where: { targetId: original.ledgerTransactionId },
    });
    expect(historyAfter).toHaveLength(originalAuditHistory.length + 1);
    for (const previousAudit of originalAuditHistory) {
      expect(historyAfter).toContainEqual(previousAudit);
    }
    expect(historyAfter).toContainEqual(audit);
  });

  it("AUD-03 creates no success audit for failed operations and protects persisted audit rows from mutation", async () => {
    const context = await createContext();
    const original = await postTestTransfer(context);
    const targetAuditCountBefore = await prisma.auditLog.count({
      where: {
        action: "COMPENSATING_TRANSACTION_CREATED",
        targetId: original.ledgerTransactionId,
        outcome: "SUCCESS",
      },
    });

    await expect(
      compensateLedgerTransaction({
        actorUserId: context.borrowerUser.id,
        originalLedgerTransactionId: original.ledgerTransactionId,
        idempotencyKey: idempotencyKey(),
        reason: "Denied compensation",
      }),
    ).rejects.toThrow(/administrator|unauthorized/i);
    await expect(
      compensateLedgerTransaction({
        actorUserId: context.administratorUserId,
        originalLedgerTransactionId: randomUUID(),
        idempotencyKey: idempotencyKey(),
        reason: "Invalid transaction reference",
      }),
    ).rejects.toThrow(/posted transaction|transaction can be compensated/i);
    await expect(
      submitRepayment({
        loanId: context.loan.id,
        borrowerUserId: context.borrowerUser.id,
        amountSatang: 0n,
        idempotencyKey: idempotencyKey(),
      }),
    ).rejects.toThrow(/greater than zero/i);

    expect(
      await prisma.auditLog.count({
        where: {
          action: "COMPENSATING_TRANSACTION_CREATED",
          targetId: original.ledgerTransactionId,
          outcome: "SUCCESS",
        },
      }),
    ).toBe(targetAuditCountBefore);
    expect(
      await prisma.auditLog.count({
        where: {
          action: "REPAYMENT_SUBMITTED",
          targetId: context.loan.id,
          outcome: "SUCCESS",
        },
      }),
    ).toBe(0);

    const installment = await getFirstPayable(context);
    const result = await submit(context, installmentOutstanding(installment));
    const successfulAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "REPAYMENT_SUBMITTED",
        targetId: context.loan.id,
        outcome: "SUCCESS",
      },
      orderBy: { createdAt: "desc" },
    });
    const auditBeforeMutation = successfulAudit;

    await expect(
      prisma.auditLog.update({
        where: { id: successfulAudit.id },
        data: { outcome: "FAILED" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.auditLog.delete({ where: { id: successfulAudit.id } }),
    ).rejects.toThrow();

    expect(
      await prisma.auditLog.findUniqueOrThrow({
        where: { id: successfulAudit.id },
      }),
    ).toEqual(auditBeforeMutation);
    expect(result.ledgerTransactionId).toBe(
      auditPayload(successfulAudit.newValues).ledgerTransactionId,
    );
  }, 60_000);
});
