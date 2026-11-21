
import { describe, expect, it } from "vitest";

import {
  calculateDueDates,
  calculatePeriodInterest,
  generateRepaymentSchedule,
} from "../../src/lib/services/repayment/repayment-calculation";

const ANNUAL_RATE = 0.12;
const DISBURSEMENT_DATE = new Date("2026-01-15T00:00:00.000Z");

function dateStrings(dates: Date[]): string[] {
  return dates.map((date) => date.toISOString().slice(0, 10));
}

describe("Repayment calculation: period interest", () => {
  it("CALC-01 calculates interest for 31 actual days", () => {
    expect(
      calculatePeriodInterest({
        openingPrincipalSatang: 10_000_000n,
        annualInterestRate: ANNUAL_RATE,
        actualDays: 31,
      }),
    ).toBe(101_918n);
  });

  it("CALC-02 calculates interest for 28 actual days", () => {
    expect(
      calculatePeriodInterest({
        openingPrincipalSatang: 10_000_000n,
        annualInterestRate: ANNUAL_RATE,
        actualDays: 28,
      }),
    ).toBe(92_055n);
  });

  it("CALC-03 calculates less interest on a reduced principal", () => {
    const originalInterest = calculatePeriodInterest({
      openingPrincipalSatang: 10_000_000n,
      annualInterestRate: ANNUAL_RATE,
      actualDays: 31,
    });

    const reducedInterest = calculatePeriodInterest({
      openingPrincipalSatang: 5_000_000n,
      annualInterestRate: ANNUAL_RATE,
      actualDays: 31,
    });

    expect(reducedInterest).toBeLessThan(originalInterest);
    expect(reducedInterest).toBe(50_959n);
  });

  it("CALC-04 returns zero interest for zero principal", () => {
    expect(
      calculatePeriodInterest({
        openingPrincipalSatang: 0n,
        annualInterestRate: ANNUAL_RATE,
        actualDays: 31,
      }),
    ).toBe(0n);
  });

  it("CALC-05 returns zero interest for zero elapsed days", () => {
    expect(
      calculatePeriodInterest({
        openingPrincipalSatang: 10_000_000n,
        annualInterestRate: ANNUAL_RATE,
        actualDays: 0,
      }),
    ).toBe(0n);
  });

  it("CALC-06 rounds a half-satang interest result upward", () => {
    expect(
      calculatePeriodInterest({
        openingPrincipalSatang: 1n,
        annualInterestRate: 0.5,
        actualDays: 365,
      }),
    ).toBe(1n);
  });

  it("CALC-07 rejects negative principal", () => {
    expect(() =>
      calculatePeriodInterest({
        openingPrincipalSatang: -1n,
        annualInterestRate: ANNUAL_RATE,
        actualDays: 31,
      }),
    ).toThrow();
  });

  it("CALC-08 rejects negative actual days", () => {
    expect(() =>
      calculatePeriodInterest({
        openingPrincipalSatang: 10_000_000n,
        annualInterestRate: ANNUAL_RATE,
        actualDays: -1,
      }),
    ).toThrow();
  });

  it("CALC-09 rejects an invalid annual interest rate", () => {
    for (const annualInterestRate of [-0.01, Number.NaN, Infinity]) {
      expect(() =>
        calculatePeriodInterest({
          openingPrincipalSatang: 10_000_000n,
          annualInterestRate,
          actualDays: 31,
        }),
      ).toThrow();
    }
  });
});

describe("Repayment calculation: due dates", () => {
  it("CALC-10 generates ordinary monthly due dates", () => {
    const dates = calculateDueDates({
      disbursedAt: DISBURSEMENT_DATE,
      termMonths: 3,
    });

    expect(dateStrings(dates)).toEqual([
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
  });

  it("CALC-11 clamps January 31 to February's last day without date drift", () => {
    const dates = calculateDueDates({
      disbursedAt: new Date("2026-01-31T00:00:00.000Z"),
      termMonths: 3,
    });

    expect(dateStrings(dates)).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("CALC-12 anchors January 30 due dates to the original day", () => {
    const dates = calculateDueDates({
      disbursedAt: new Date("2026-01-30T00:00:00.000Z"),
      termMonths: 3,
    });

    expect(dateStrings(dates)).toEqual([
      "2026-02-28",
      "2026-03-30",
      "2026-04-30",
    ]);
  });

  it("CALC-13 handles months with 30 and 31 days", () => {
    const dates = calculateDueDates({
      disbursedAt: new Date("2026-08-31T00:00:00.000Z"),
      termMonths: 3,
    });

    expect(dateStrings(dates)).toEqual([
      "2026-09-30",
      "2026-10-31",
      "2026-11-30",
    ]);
  });

  it("CALC-14 handles year boundaries", () => {
    const dates = calculateDueDates({
      disbursedAt: new Date("2026-12-31T00:00:00.000Z"),
      termMonths: 3,
    });

    expect(dateStrings(dates)).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
  });

  it("CALC-15 handles February 29 in a leap year", () => {
    const dates = calculateDueDates({
      disbursedAt: new Date("2028-01-31T00:00:00.000Z"),
      termMonths: 3,
    });

    expect(dateStrings(dates)).toEqual([
      "2028-02-29",
      "2028-03-31",
      "2028-04-30",
    ]);
  });

  it("CALC-16 rejects an unsupported term", () => {
    expect(() =>
      calculateDueDates({
        disbursedAt: DISBURSEMENT_DATE,
        termMonths: 5,
      }),
    ).toThrow();
  });

  it("CALC-17 rejects an invalid disbursement date", () => {
    expect(() =>
      calculateDueDates({
        disbursedAt: new Date("invalid"),
        termMonths: 3,
      }),
    ).toThrow();
  });
});

describe("Repayment calculation: reducing-balance schedule", () => {
  it.each([3, 6, 9, 12, 18, 24])(
    "CALC-18–23 generates exactly %i installments",
    (termMonths) => {
      const schedule = generateRepaymentSchedule({
        principalSatang: 1_000_000n,
        annualInterestRate: ANNUAL_RATE,
        disbursedAt: DISBURSEMENT_DATE,
        termMonths,
      });

      expect(schedule.installments).toHaveLength(termMonths);
    },
  );

  it("CALC-24 calculates each period's interest from actual days and opening principal", () => {
    const schedule = generateRepaymentSchedule({
      principalSatang: 1_000_000n,
      annualInterestRate: ANNUAL_RATE,
      disbursedAt: DISBURSEMENT_DATE,
      termMonths: 3,
    });

    expect(
      schedule.installments.map((item) => item.actualDays),
    ).toEqual([31, 28, 31]);

    expect(
      schedule.installments.map((item) => item.interestSatang),
    ).toEqual([10_192n, 6_170n, 3_430n]);
  });

  it("CALC-25 calculates principal as payment minus interest", () => {
    const schedule = generateRepaymentSchedule({
      principalSatang: 1_000_000n,
      annualInterestRate: ANNUAL_RATE,
      disbursedAt: DISBURSEMENT_DATE,
      termMonths: 3,
    });

    for (const installment of schedule.installments) {
      expect(installment.principalSatang).toBe(
        installment.paymentSatang - installment.interestSatang,
      );
    }
  });

  it("CALC-26 carries each closing balance into the next opening balance", () => {
    const schedule = generateRepaymentSchedule({
      principalSatang: 1_000_000n,
      annualInterestRate: ANNUAL_RATE,
      disbursedAt: DISBURSEMENT_DATE,
      termMonths: 3,
    });

    for (let index = 1; index < schedule.installments.length; index++) {
      expect(
        schedule.installments[index].openingPrincipalSatang,
      ).toBe(
        schedule.installments[index - 1].closingPrincipalSatang,
      );
    }
  });

  it("CALC-27 calculates interest on the reducing balance", () => {
    const schedule = generateRepaymentSchedule({
      principalSatang: 1_000_000n,
      annualInterestRate: ANNUAL_RATE,
      disbursedAt: DISBURSEMENT_DATE,
      termMonths: 3,
    });

    expect(
      schedule.installments[1].interestSatang,
    ).toBeLessThan(schedule.installments[0].interestSatang);

    expect(
      schedule.installments[2].interestSatang,
    ).toBeLessThan(schedule.installments[1].interestSatang);
  });

  it("CALC-28 allocates exactly the original principal", () => {
    const principalSatang = 1_000_000n;

    const schedule = generateRepaymentSchedule({
      principalSatang,
      annualInterestRate: ANNUAL_RATE,
      disbursedAt: DISBURSEMENT_DATE,
      termMonths: 3,
    });

    const totalPrincipal = schedule.installments.reduce(
      (sum, item) => sum + item.principalSatang,
      0n,
    );

    expect(totalPrincipal).toBe(principalSatang);
  });

  it("CALC-29 clears the outstanding principal in the final installment", () => {
    const schedule = generateRepaymentSchedule({
      principalSatang: 1_000_000n,
      annualInterestRate: ANNUAL_RATE,
      disbursedAt: DISBURSEMENT_DATE,
      termMonths: 3,
    });

    expect(
      schedule.installments.at(-1)?.closingPrincipalSatang,
    ).toBe(0n);
  });

  it("CALC-30 reconciles total payments to principal plus interest", () => {
    const schedule = generateRepaymentSchedule({
      principalSatang: 1_000_000n,
      annualInterestRate: ANNUAL_RATE,
      disbursedAt: DISBURSEMENT_DATE,
      termMonths: 3,
    });

    const totalPayments = schedule.installments.reduce(
      (sum, item) => sum + item.paymentSatang,
      0n,
    );

    const totalPrincipal = schedule.installments.reduce(
      (sum, item) => sum + item.principalSatang,
      0n,
    );

    const totalInterest = schedule.installments.reduce(
      (sum, item) => sum + item.interestSatang,
      0n,
    );

    expect(totalPayments).toBe(totalPrincipal + totalInterest);
  });

  it("CALC-31 uses one regular payment and adjusts only the final payment", () => {
    const schedule = generateRepaymentSchedule({
      principalSatang: 1_000_000n,
      annualInterestRate: ANNUAL_RATE,
      disbursedAt: DISBURSEMENT_DATE,
      termMonths: 3,
    });

    const regularPayments = schedule.installments
      .slice(0, -1)
      .map((item) => item.paymentSatang);

    expect(new Set(regularPayments).size).toBe(1);

    expect(schedule.installments.at(-1)!.paymentSatang)
      .toBeLessThanOrEqual(schedule.regularPaymentSatang);

    expect(regularPayments[0]).toBe(schedule.regularPaymentSatang);
  });

  it("CALC-32 rejects a non-positive schedule principal", () => {
    expect(() =>
      generateRepaymentSchedule({
        principalSatang: 0n,
        annualInterestRate: ANNUAL_RATE,
        disbursedAt: DISBURSEMENT_DATE,
        termMonths: 3,
      }),
    ).toThrow();
  });

  it("CALC-33 rejects an unsupported schedule term", () => {
    expect(() =>
      generateRepaymentSchedule({
        principalSatang: 1_000_000n,
        annualInterestRate: ANNUAL_RATE,
        disbursedAt: DISBURSEMENT_DATE,
        termMonths: 5,
      }),
    ).toThrow();
  });

  it("CALC-34 rejects an invalid schedule interest rate", () => {
    expect(() =>
      generateRepaymentSchedule({
        principalSatang: 1_000_000n,
        annualInterestRate: -0.01,
        disbursedAt: DISBURSEMENT_DATE,
        termMonths: 3,
      }),
    ).toThrow();
  });
});
