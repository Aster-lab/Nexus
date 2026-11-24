
import { describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma";
import { generateRepaymentSchedule } from "../../src/lib/services/repayment.service";
import {
  createRepaymentTestContext,
} from "../fixtures/repayment.fixture";

const SUPPORTED_TERMS = [
  { id: "SCH-01", months: 3 },
  { id: "SCH-02", months: 6 },
  { id: "SCH-03", months: 9 },
  { id: "SCH-04", months: 12 },
  { id: "SCH-05", months: 18 },
  { id: "SCH-06", months: 24 },
] as const;

type TestContext = Awaited<ReturnType<typeof createRepaymentTestContext>>;

async function setLoanTerm(context: TestContext, termMonths: number) {
  await prisma.loan.update({
    where: { id: context.loan.id },
    data: { termMonths },
  });
}

async function generateAndLoadSchedule(context: TestContext) {
  const result = await generateRepaymentSchedule({
    loanId: context.loan.id,
    actorUserId: context.administratorUserId,
  });

  const schedule = await prisma.repaymentSchedule.findUniqueOrThrow({
    where: { loanId: context.loan.id },
  });

  const currentVersionId = schedule.currentVersionId;

  if (!currentVersionId) {
    throw new Error(
      `Schedule ${schedule.id} has no current version after generation`,
    );
  }

  const version = await prisma.scheduleVersion.findUniqueOrThrow({
    where: { id: currentVersionId },
  });

  const installments = await prisma.installment.findMany({
    where: { scheduleVersionId: currentVersionId },
    orderBy: { installmentNumber: "asc" },
  });

  return {
    result,
    schedule,
    version,
    installments,
  };
}

function actualDaysBetween(start: Date, end: Date) {
  return Math.round(
    (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
  );
}

function calculateExpectedInterest(
  openingPrincipalSatang: bigint,
  annualInterestRate: number,
  actualDays: number,
) {
  const unrounded =
    Number(openingPrincipalSatang) *
    annualInterestRate *
    actualDays /
    365;

  return BigInt(Math.floor(unrounded + 0.5));
}

async function expectNoSchedule(loanId: string) {
  const scheduleCount = await prisma.repaymentSchedule.count({
    where: { loanId },
  });

  const versionCount = await prisma.scheduleVersion.count({
    where: {
      schedule: {
        loanId,
      },
    },
  });

  const installmentCount = await prisma.installment.count({
    where: {
      scheduleVersion: {
        schedule: {
          loanId,
        },
      },
    },
  });

  expect(scheduleCount).toBe(0);
  expect(versionCount).toBe(0);
  expect(installmentCount).toBe(0);
}

describe("Repayment schedule generation integration", () => {
  it.each(SUPPORTED_TERMS)(
    "$id generates a schedule with exactly $months installments",
    async ({ months }) => {
      const context = await createRepaymentTestContext();

      try {
        await setLoanTerm(context, months);

        const generated = await generateAndLoadSchedule(context);

        expect(generated.result.currentVersionId).toBe(
          generated.schedule.currentVersionId,
        );

        expect(generated.installments).toHaveLength(months);

        expect(
          generated.installments.map(
            (installment) => installment.installmentNumber,
          ),
        ).toEqual(
          Array.from({ length: months }, (_, index) => index + 1),
        );

        expect(
          generated.installments.every(
            (installment) =>
              installment.scheduleVersionId ===
              generated.schedule.currentVersionId,
          ),
        ).toBe(true);
      } finally {
        await context.cleanup();
      }
    },
  );

  it("SCH-07 calculates interest using each period's reducing opening principal", async () => {
    const context = await createRepaymentTestContext({
      openingBalanceSatang: 100_000_000n,
    });

    try {
      await setLoanTerm(context, 3);

      const generated = await generateAndLoadSchedule(context);
      const annualRate = Number(context.loan.annualInterestRate);

      for (const installment of generated.installments) {
        const expectedInterest = calculateExpectedInterest(
          installment.openingPrincipalSatang,
          annualRate,
          actualDaysBetween(
            installment.installmentNumber === 1
              ? context.loan.disbursedAt!
              : generated.installments[
                  installment.installmentNumber - 2
                ].dueDate,
            installment.dueDate,
          ),
        );

        expect(installment.interestDueSatang).toBe(expectedInterest);
      }

      expect(
        generated.installments[1].openingPrincipalSatang,
      ).toBeLessThan(
        generated.installments[0].openingPrincipalSatang,
      );
    } finally {
      await context.cleanup();
    }
  });

  it("SCH-08 uses ACTUAL/365 days for each installment period", async () => {
    const context = await createRepaymentTestContext();

    try {
      await setLoanTerm(context, 3);

      const generated = await generateAndLoadSchedule(context);

      const expectedDueDates = [
        new Date("2026-02-15T00:00:00.000Z"),
        new Date("2026-03-15T00:00:00.000Z"),
        new Date("2026-04-15T00:00:00.000Z"),
      ];

      let previousDate = context.loan.disbursedAt!;

      for (let index = 0; index < generated.installments.length; index++) {
        const installment = generated.installments[index];

        expect(installment.dueDate.toISOString()).toBe(
          expectedDueDates[index].toISOString(),
        );

        const days = actualDaysBetween(previousDate, installment.dueDate);

        const expectedInterest = calculateExpectedInterest(
          installment.openingPrincipalSatang,
          Number(context.loan.annualInterestRate),
          days,
        );

        expect(installment.interestDueSatang).toBe(expectedInterest);

        previousDate = installment.dueDate;
      }
    } finally {
      await context.cleanup();
    }
  });

  it("SCH-09 persists principal and interest as separate installment components", async () => {
    const context = await createRepaymentTestContext();

    try {
      await setLoanTerm(context, 3);

      const generated = await generateAndLoadSchedule(context);

      for (const installment of generated.installments) {
        expect(installment.principalDueSatang).toBeGreaterThan(0n);
        expect(installment.interestDueSatang).toBeGreaterThanOrEqual(0n);

        const payment =
          installment.principalDueSatang +
          installment.interestDueSatang;

        expect(payment).toBeGreaterThan(0n);
      }
    } finally {
      await context.cleanup();
    }
  });

  it("SCH-10 uses the same whole-satang regular payment before the final installment", async () => {
    const context = await createRepaymentTestContext();

    try {
      await setLoanTerm(context, 3);

      const generated = await generateAndLoadSchedule(context);

      const regularPayments = generated.installments
        .slice(0, -1)
        .map(
          (installment) =>
            installment.principalDueSatang +
            installment.interestDueSatang,
        );

      expect(regularPayments.length).toBeGreaterThan(0);

      expect(
        regularPayments.every(
          (payment) => payment === regularPayments[0],
        ),
      ).toBe(true);

      for (const installment of generated.installments) {
        expect(typeof installment.principalDueSatang).toBe("bigint");
        expect(typeof installment.interestDueSatang).toBe("bigint");
      }
    } finally {
      await context.cleanup();
    }
  });

  it("SCH-11 adjusts the final installment to clear the remaining principal and interest", async () => {
    const context = await createRepaymentTestContext();

    try {
      await setLoanTerm(context, 3);

      const generated = await generateAndLoadSchedule(context);

      const regularPayment =
        generated.installments[0].principalDueSatang +
        generated.installments[0].interestDueSatang;

      const finalInstallment =
        generated.installments[generated.installments.length - 1];

      const finalPayment =
        finalInstallment.principalDueSatang +
        finalInstallment.interestDueSatang;

      expect(finalPayment).toBeLessThanOrEqual(regularPayment);

      expect(finalInstallment.principalDueSatang).toBe(
        finalInstallment.openingPrincipalSatang,
      );
    } finally {
      await context.cleanup();
    }
  });

  it("SCH-12 reconciles total principal and clears the closing balance", async () => {
    const context = await createRepaymentTestContext();

    try {
      await setLoanTerm(context, 3);

      const generated = await generateAndLoadSchedule(context);

      const totalPrincipal = generated.installments.reduce(
        (total, installment) =>
          total + installment.principalDueSatang,
        0n,
      );

      const totalInterest = generated.installments.reduce(
        (total, installment) =>
          total + installment.interestDueSatang,
        0n,
      );

      expect(totalPrincipal).toBe(context.loan.principalSatang);

      expect(
        totalPrincipal + totalInterest,
      ).toBeGreaterThanOrEqual(context.loan.principalSatang);

      const finalInstallment =
        generated.installments[generated.installments.length - 1];

      expect(
        finalInstallment.openingPrincipalSatang -
          finalInstallment.principalDueSatang,
      ).toBe(0n);
    } finally {
      await context.cleanup();
    }
  });

  it.each([
    {
      description: "unsupported loan term",
      update: async (loanId: string) => {
        await prisma.loan.update({
          where: { id: loanId },
          data: { termMonths: 5 },
        });
      },
    },
    {
      description: "loan that is not ACTIVE",
      update: async (loanId: string) => {
        await prisma.loan.update({
          where: { id: loanId },
          data: { status: "FUNDED" },
        });
      },
    },
    {
      description: "loan without a disbursement date",
      update: async (loanId: string) => {
        await prisma.loan.update({
          where: { id: loanId },
          data: { disbursedAt: null },
        });
      },
    },
  ])(
    "SCH-13 rejects a loan with $description",
    async ({ update }) => {
      const context = await createRepaymentTestContext();

      try {
        await update(context.loan.id);

        await expect(
          generateRepaymentSchedule({
            loanId: context.loan.id,
            actorUserId: context.administratorUserId,
          }),
        ).rejects.toThrow();

        await expectNoSchedule(context.loan.id);
      } finally {
        await context.cleanup();
      }
    },
  );

  it("SCH-14 returns the existing schedule for repeated and concurrent generation", async () => {
    const context = await createRepaymentTestContext();

    try {
      await setLoanTerm(context, 3);

      const first = await generateRepaymentSchedule({
        loanId: context.loan.id,
        actorUserId: context.administratorUserId,
      });

      const repeated = await generateRepaymentSchedule({
        loanId: context.loan.id,
        actorUserId: context.administratorUserId,
      });

      const concurrentResults = await Promise.all([
        generateRepaymentSchedule({
          loanId: context.loan.id,
          actorUserId: context.administratorUserId,
        }),
        generateRepaymentSchedule({
          loanId: context.loan.id,
          actorUserId: context.administratorUserId,
        }),
        generateRepaymentSchedule({
          loanId: context.loan.id,
          actorUserId: context.administratorUserId,
        }),
      ]);

      const returnedVersionIds = [
        first.currentVersionId,
        repeated.currentVersionId,
        ...concurrentResults.map((result) => result.currentVersionId),
      ];

      expect(new Set(returnedVersionIds).size).toBe(1);

      const scheduleCount = await prisma.repaymentSchedule.count({
        where: { loanId: context.loan.id },
      });

      const versionCount = await prisma.scheduleVersion.count({
        where: {
          schedule: {
            loanId: context.loan.id,
          },
        },
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

      expect(scheduleCount).toBe(1);
      expect(versionCount).toBe(1);
      expect(installmentCount).toBe(3);
    } finally {
      await context.cleanup();
    }
  });
});
