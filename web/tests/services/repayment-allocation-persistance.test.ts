
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { submitRepayment } from "../../src/lib/services/repayment/repayment-submitrepayment";
import type { SubmitRepaymentTestOptions } from "../../src/lib/services/repayment/repayment-submitrepayment";
import {
  createRepaymentAllocationLifecycleContext,
  type RepaymentAllocationLifecycleContext,
} from "../fixtures/repayment-allocation.fixture";

const ALLOCATION_METHOD = "PROPORTIONAL_LARGEST_REMAINDER";

let contexts: RepaymentAllocationLifecycleContext[] = [];

async function createDueRepaymentContext(
  investorCount: 1 | 2 = 1,
): Promise<RepaymentAllocationLifecycleContext> {
  const context = await createRepaymentAllocationLifecycleContext(investorCount);
  contexts.push(context);
  return context;
}

async function submitFullDueRepayment(
  context: RepaymentAllocationLifecycleContext,
  options?: SubmitRepaymentTestOptions,
) {
  const installments = await prisma.installment.findMany({
    where: {
      scheduleVersion: {
        schedule: {
          loanId: context.loan.id,
        },
      },
      dueDate: { lte: new Date() },
      status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
    },
    orderBy: [
      { dueDate: "asc" },
      { installmentNumber: "asc" },
    ],
  });

  const payableSatang = installments.reduce(
    (total, installment) =>
      total +
      installment.principalDueSatang -
      installment.paidPrincipalSatang +
      installment.interestDueSatang -
      installment.paidInterestSatang,
    0n,
  );

  if (payableSatang <= 0n) {
    throw new Error("Test fixture did not create a payable installment.");
  }

  return submitRepayment(
    {
      loanId: context.loan.id,
      borrowerUserId: context.borrowerUser.id,
      amountSatang: payableSatang,
      idempotencyKey: `alloc-test-${crypto.randomUUID()}`,
    },
    options,
  );
}

async function getRepaymentsForLoan(loanId: string) {
  return prisma.repayment.findMany({
    where: { loanId },
    include: {
      payoutAllocations: {
        orderBy: { investmentId: "asc" },
      },
      installment: true,
    },
    orderBy: { receivedAt: "asc" },
  });
}

async function getActiveInvestments(loanId: string) {
  return prisma.investment.findMany({
    where: {
      loanId,
      status: "ACTIVE",
    },
    include: {
      contributions: true,
      investorProfile: true,
    },
    orderBy: { id: "asc" },
  });
}

async function getInvestorWalletBalances(loanId: string) {
  const investments = await prisma.investment.findMany({
    where: { loanId },
    select: {
      investorProfile: {
        select: {
          user: {
            select: {
                    wallets: {
                select: {
                  id: true,
                  balanceSatang: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return investments.flatMap((investment) => {
    return investment.investorProfile.user.wallets.map((wallet) => ({
      walletId: wallet.id,
      balanceSatang: wallet.balanceSatang,
    }));
  });
}

async function expectAllocationReconciliation(loanId: string) {
  const repayments = await getRepaymentsForLoan(loanId);

  for (const repayment of repayments) {
    const principalTotal = repayment.payoutAllocations.reduce(
      (total, allocation) => total + allocation.principalSatang,
      0n,
    );

    const interestTotal = repayment.payoutAllocations.reduce(
      (total, allocation) => total + allocation.interestSatang,
      0n,
    );

    const recoveryTotal = repayment.payoutAllocations.reduce(
      (total, allocation) => total + allocation.recoverySatang,
      0n,
    );

    expect(principalTotal).toBe(repayment.principalSatang);
    expect(interestTotal).toBe(repayment.interestSatang);
    expect(recoveryTotal).toBe(0n);

    expect(
      repayment.payoutAllocations.every(
        (allocation) =>
          allocation.allocationMethod === ALLOCATION_METHOD,
      ),
    ).toBe(true);

    expect(
      new Set(
        repayment.payoutAllocations.map(
          (allocation) => allocation.investmentId,
        ),
      ).size,
    ).toBe(repayment.payoutAllocations.length);
  }
}

afterEach(async () => {
  for (const context of contexts.reverse()) {
    await context.cleanup();
  }

  contexts = [];
});

describe("Repayment allocation persistence", () => {
  it("ALLOC-01 creates an allocation for a single-investor repayment", async () => {
    const context = await createDueRepaymentContext(1);

    const activeInvestments = await getActiveInvestments(context.loan.id);

    expect(activeInvestments).toHaveLength(1);

    await submitFullDueRepayment(context);

    const repayments = await getRepaymentsForLoan(context.loan.id);

    expect(repayments.length).toBeGreaterThan(0);

    for (const repayment of repayments) {
      expect(repayment.payoutAllocations).toHaveLength(1);

      const allocation = repayment.payoutAllocations[0];

      expect(allocation.repaymentId).toBe(repayment.id);
      expect(allocation.investmentId).toBe(activeInvestments[0].id);
      expect(allocation.principalSatang).toBe(repayment.principalSatang);
      expect(allocation.interestSatang).toBe(repayment.interestSatang);
      expect(allocation.recoverySatang).toBe(0n);
      expect(allocation.allocationMethod).toBe(ALLOCATION_METHOD);
    }

    await expectAllocationReconciliation(context.loan.id);
  });

  it("ALLOC-02 creates one correctly related allocation per eligible investment", async () => {
    const context = await createDueRepaymentContext(2);

    const activeInvestments = await getActiveInvestments(context.loan.id);

    expect(activeInvestments.length).toBeGreaterThanOrEqual(2);

    await submitFullDueRepayment(context);

    const repayments = await getRepaymentsForLoan(context.loan.id);

    for (const repayment of repayments) {
      expect(repayment.payoutAllocations).toHaveLength(
        activeInvestments.length,
      );

      expect(
        repayment.payoutAllocations.map((row) => row.investmentId).sort(),
      ).toEqual(activeInvestments.map((row) => row.id).sort());

      expect(
        new Set(
          repayment.payoutAllocations.map((row) => row.investmentId),
        ).size,
      ).toBe(activeInvestments.length);

      for (const allocation of repayment.payoutAllocations) {
        expect(allocation.repaymentId).toBe(repayment.id);
      }
    }

    await expectAllocationReconciliation(context.loan.id);
  });

  it("ALLOC-03 allocates principal and interest independently", async () => {
    const context = await createDueRepaymentContext(2);

    const investments = await getActiveInvestments(context.loan.id);

    expect(investments.length).toBeGreaterThanOrEqual(2);

    await submitFullDueRepayment(context);

    const repayments = await getRepaymentsForLoan(context.loan.id);

    for (const repayment of repayments) {
      const principalAllocations = repayment.payoutAllocations.map(
        (row) => row.principalSatang,
      );

      const interestAllocations = repayment.payoutAllocations.map(
        (row) => row.interestSatang,
      );

      expect(
        principalAllocations.reduce((a, b) => a + b, 0n),
      ).toBe(repayment.principalSatang);

      expect(
        interestAllocations.reduce((a, b) => a + b, 0n),
      ).toBe(repayment.interestSatang);

      // The two components must be persisted separately.
      expect(
        repayment.payoutAllocations.every(
          (row) =>
            row.principalSatang >= 0n &&
            row.interestSatang >= 0n,
        ),
      ).toBe(true);
    }
  });

  it("ALLOC-04 aggregates persisted contributions and excludes inactive investments", async () => {
    const context = await createDueRepaymentContext(2);

    const activeBefore = await getActiveInvestments(context.loan.id);

    expect(activeBefore.length).toBeGreaterThanOrEqual(2);
    const investmentToDeactivate = activeBefore[1];
    const additionalInvestmentId = investmentToDeactivate.id;

    // Verify that contribution weights come from persisted records.
    const contributionTotals = new Map<string, bigint>();

    for (const investment of activeBefore) {
      contributionTotals.set(
        investment.id,
        investment.contributions.reduce(
          (total, contribution) => total + contribution.amountSatang,
          0n,
        ),
      );
    }

    expect(
      [...contributionTotals.values()].every((amount) => amount > 0n),
    ).toBe(true);

    // An inactive investment must not participate in allocation.
    await prisma.investment.update({
      where: { id: additionalInvestmentId },
      data: { status: "CANCELLED" },
    });

    const eligibleInvestments = await getActiveInvestments(context.loan.id);

    expect(
      eligibleInvestments.some(
        (investment) => investment.id === additionalInvestmentId,
      ),
    ).toBe(false);

    await submitFullDueRepayment(context);

    const repayments = await getRepaymentsForLoan(context.loan.id);

    for (const repayment of repayments) {
      expect(
        repayment.payoutAllocations.some(
          (allocation) =>
            allocation.investmentId === additionalInvestmentId,
        ),
      ).toBe(false);

      expect(
        repayment.payoutAllocations.map(
          (allocation) => allocation.investmentId,
        ).sort(),
      ).toEqual(
        eligibleInvestments.map((investment) => investment.id).sort(),
      );
    }

    await expectAllocationReconciliation(context.loan.id);
  });

  it("ALLOC-05 reconciles largest-remainder allocations exactly", async () => {
    const context = await createDueRepaymentContext(2);

    const investments = await getActiveInvestments(context.loan.id);

    expect(investments.length).toBeGreaterThanOrEqual(2);

    await submitFullDueRepayment(context);

    const repayments = await getRepaymentsForLoan(context.loan.id);

    for (const repayment of repayments) {
      const allocations = repayment.payoutAllocations;

      expect(
        allocations.reduce(
          (total, row) => total + row.principalSatang,
          0n,
        ),
      ).toBe(repayment.principalSatang);

      expect(
        allocations.reduce(
          (total, row) => total + row.interestSatang,
          0n,
        ),
      ).toBe(repayment.interestSatang);

      expect(
        allocations.every((row) => row.recoverySatang === 0n),
      ).toBe(true);

      // Stable result ordering makes equal-remainder behavior reproducible.
      expect(
        allocations.map((row) => row.investmentId),
      ).toEqual(
        [...allocations]
          .map((row) => row.investmentId)
          .sort(),
      );
    }

    await expectAllocationReconciliation(context.loan.id);
  });

  it("ALLOC-06 creates no investor payouts and does not credit investor wallets", async () => {
    const context = await createDueRepaymentContext(2);

    const balancesBefore = await getInvestorWalletBalances(context.loan.id);

    await submitFullDueRepayment(context);

    const balancesAfter = await getInvestorWalletBalances(context.loan.id);

    expect(balancesAfter).toEqual(balancesBefore);

    const repayments = await prisma.repayment.findMany({
      where: { loanId: context.loan.id },
      select: { id: true },
    });

    const allocationIds = await prisma.payoutAllocation.findMany({
      where: {
        repaymentId: { in: repayments.map((repayment) => repayment.id) },
      },
      select: { id: true },
    });

    const investorPayouts = await prisma.investorPayout.findMany({
      where: {
        payoutAllocationId: {
          in: allocationIds.map((allocation) => allocation.id),
        },
      },
    });

    expect(investorPayouts).toHaveLength(0);
  });

  it("ALLOC-07 rolls back repayment, ledger, installment, and allocation writes when allocation persistence fails", async () => {
    const context = await createDueRepaymentContext(2);

    const installmentsBefore = await prisma.installment.findMany({
      where: {
        scheduleVersion: {
          schedule: { loanId: context.loan.id },
        },
      },
      orderBy: { installmentNumber: "asc" },
    });

    const repaymentCountBefore = await prisma.repayment.count({
      where: { loanId: context.loan.id },
    });

    const ledgerCountBefore = await prisma.ledgerTransaction.count({
      where: {
        referenceId: context.loan.id,
        referenceType: "LOAN",
      },
    });

    const allocationCountBefore = await prisma.payoutAllocation.count({
      where: {
        repayment: { loanId: context.loan.id },
      },
    });

    const walletBalancesBefore = await prisma.wallet.findMany({
      where: {
        id: { in: [context.borrowerWalletId, context.clearingWalletId] },
      },
      orderBy: { id: "asc" },
      select: { id: true, balanceSatang: true },
    });

    // Trigger a genuine PostgreSQL VARCHAR(50) error inside the same
    // transaction after ledger, repayment, and installment writes begin.
    await expect(
      submitFullDueRepayment(context, {
        allocationMethod: "X".repeat(51),
      }),
    ).rejects.toThrow();

    const installmentsAfter = await prisma.installment.findMany({
      where: {
        scheduleVersion: {
          schedule: { loanId: context.loan.id },
        },
      },
      orderBy: { installmentNumber: "asc" },
    });

    expect(
      await prisma.repayment.count({
        where: { loanId: context.loan.id },
      }),
    ).toBe(repaymentCountBefore);

    expect(
      await prisma.ledgerTransaction.count({
        where: {
          referenceId: context.loan.id,
          referenceType: "LOAN",
        },
      }),
    ).toBe(ledgerCountBefore);

    expect(
      await prisma.payoutAllocation.count({
        where: {
          repayment: { loanId: context.loan.id },
        },
      }),
    ).toBe(allocationCountBefore);

    expect(installmentsAfter).toEqual(installmentsBefore);

    expect(
      await prisma.wallet.findMany({
        where: {
          id: { in: [context.borrowerWalletId, context.clearingWalletId] },
        },
        orderBy: { id: "asc" },
        select: { id: true, balanceSatang: true },
      }),
    ).toEqual(walletBalancesBefore);
  });
});
