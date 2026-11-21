
import { describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma";
import {
  validateRepaymentEligibility,
  generateRepaymentSchedule
} from "../../src/lib/services/repayment.service";
import {
  createRepaymentTestContext,
  type RepaymentTestContext,
} from "../fixtures/repayment.fixture";

const PARTIAL_PAYMENT_SATANG = 1n;
const FUTURE_DUE_DATE = new Date("2030-01-15T00:00:00.000Z");

async function validate(
  context: RepaymentTestContext,
  amountSatang: bigint,
  borrowerUserId = context.borrowerUser.id,
) {
  return validateRepaymentEligibility({
    loanId: context.loan.id,
    borrowerUserId,
    amountSatang,
  });
}

async function countRepayments(loanId: string) {
  return prisma.repayment.count({
    where: { loanId },
  });
}

async function expectRejectedWithoutRepayment(
  context: RepaymentTestContext,
  amountSatang: bigint,
  borrowerUserId = context.borrowerUser.id,
) {
  const before = await countRepayments(context.loan.id);

  await expect(
    validate(context, amountSatang, borrowerUserId),
  ).rejects.toThrow();

  const after = await countRepayments(context.loan.id);

  expect(after).toBe(before);
}

async function getPayableOutstanding(
  context: RepaymentTestContext,
): Promise<bigint> {
  const installments = await prisma.installment.findMany({
    where: {
      scheduleVersionId: await getCurrentScheduleVersionId(context.loan.id),
      dueDate: {
        lte: new Date(),
      },
      status: {
        in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"],
      },
    },
    select: {
      principalDueSatang: true,
      interestDueSatang: true,
      paidPrincipalSatang: true,
      paidInterestSatang: true,
    },
  });

  return installments.reduce((total, installment) => {
    return (
      total +
      installment.principalDueSatang -
      installment.paidPrincipalSatang +
      installment.interestDueSatang -
      installment.paidInterestSatang
    );
  }, 0n);
}
async function getCurrentScheduleVersionId(loanId: string) {
  const schedule = await prisma.repaymentSchedule.findUnique({
    where: { loanId },
    select: {
      currentVersionId: true,
    },
  });

  const versionId = schedule?.currentVersionId;

  if (!versionId) {
    throw new Error("Expected a current repayment schedule version.");
  }

  return versionId;
}

async function createScheduledRepaymentContext() {
  const context = await createRepaymentTestContext();

  try {
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

describe("Borrower repayment eligibility integration", () => {
  it("ELG-01 allows the correct borrower to submit a valid partial repayment", async () => {
    const context = await createScheduledRepaymentContext();

    try {
      const result = await validate(
        context,
        PARTIAL_PAYMENT_SATANG,
      );

      expect(result.loanId).toBe(context.loan.id);
      expect(result.amountSatang).toBe(PARTIAL_PAYMENT_SATANG);
      expect(result.payableOutstandingSatang).toBeGreaterThan(
        PARTIAL_PAYMENT_SATANG,
      );
      expect(result.payableInstallmentCount).toBeGreaterThan(0);
    } finally {
      await context.cleanup();
    }
  });

  it("ELG-02 rejects repayment eligibility for a user who does not own the loan", async () => {
    const context = await createRepaymentTestContext();

    try {
      await expectRejectedWithoutRepayment(
        context,
        PARTIAL_PAYMENT_SATANG,
        context.investorUser.id,
      );
    } finally {
      await context.cleanup();
    }
  });

  it.each([
    {
      description: "a loan that is not ACTIVE",
      update: async (loanId: string) => {
        await prisma.loan.update({
          where: { id: loanId },
          data: { status: "FUNDED" },
        });
      },
    },
    {
      description: "a loan without a disbursement date",
      update: async (loanId: string) => {
        await prisma.loan.update({
          where: { id: loanId },
          data: { disbursedAt: null },
        });
      },
    },
  ])(
    "ELG-03 rejects repayment eligibility for $description",
    async ({ update }) => {
      const context = await createRepaymentTestContext();

      try {
        await update(context.loan.id);

        await expectRejectedWithoutRepayment(
          context,
          PARTIAL_PAYMENT_SATANG,
        );
      } finally {
        await context.cleanup();
      }
    },
  );

  it("ELG-04 rejects repayment eligibility when no schedule exists", async () => {
    const context = await createRepaymentTestContext();

    try {
      const scheduleCount = await prisma.repaymentSchedule.count({
        where: {
          loanId: context.loan.id,
        },
      });

      expect(scheduleCount).toBe(0);

      await expectRejectedWithoutRepayment(
        context,
        PARTIAL_PAYMENT_SATANG,
      );
    } finally {
      await context.cleanup();
    }
  });

  it("ELG-05 rejects repayment eligibility before the first installment due date", async () => {
    const context = await createRepaymentTestContext();

    try {
      const futureDisbursementDate = new Date(
        "2029-12-15T00:00:00.000Z",
      );

      await prisma.loan.update({
        where: {
          id: context.loan.id,
        },
        data: {
          disbursedAt: futureDisbursementDate,
        },
      });

      await generateRepaymentSchedule({
        loanId: context.loan.id,
        actorUserId: context.administratorUserId,
      });

      const versionId = await getCurrentScheduleVersionId(
        context.loan.id,
      );

      const firstInstallment = await prisma.installment.findFirst({
        where: {
          scheduleVersionId: versionId,
        },
        orderBy: {
          installmentNumber: "asc",
        },
      });

      expect(firstInstallment).not.toBeNull();

      if (!firstInstallment) {
        throw new Error("Expected a generated installment.");
      }

      expect(firstInstallment.dueDate.getTime()).toBeGreaterThan(
        Date.now(),
      );

      await expectRejectedWithoutRepayment(
        context,
        PARTIAL_PAYMENT_SATANG,
      );
    } finally {
      await context.cleanup();
    }
  });

  it("ELG-06 rejects an amount exceeding the currently payable outstanding obligation", async () => {
    const context = await createScheduledRepaymentContext();

    try {
      const outstanding = await getPayableOutstanding(context);

      expect(outstanding).toBeGreaterThan(0n);

      await expectRejectedWithoutRepayment(
        context,
        outstanding + 1n,
      );
    } finally {
      await context.cleanup();
    }
  });
});
