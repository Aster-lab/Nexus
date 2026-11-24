
const DAYS_PER_YEAR = 365;
const SUPPORTED_TERMS = [3, 6, 9, 12, 18, 24] as const;

export interface CalculatePeriodInterestInput {
  openingPrincipalSatang: bigint;
  annualInterestRate: number;
  actualDays: number;
}

export interface CalculateDueDatesInput {
  disbursedAt: Date;
  termMonths: number;
}

export interface GenerateRepaymentScheduleInput {
  principalSatang: bigint;
  annualInterestRate: number;
  disbursedAt: Date;
  termMonths: number;
}

export interface RepaymentScheduleInstallment {
  installmentNumber: number;
  dueDate: Date;
  actualDays: number;
  openingPrincipalSatang: bigint;
  interestSatang: bigint;
  principalSatang: bigint;
  paymentSatang: bigint;
  closingPrincipalSatang: bigint;
}

export interface GeneratedRepaymentSchedule {
  regularPaymentSatang: bigint;
  installments: RepaymentScheduleInstallment[];
}

interface RateFraction {
  numerator: bigint;
  denominator: bigint;
}

function toRateFraction(rate: number): RateFraction {
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new RangeError("Annual interest rate must be between 0 and 1.");
  }

  const [coefficient, exponentText] = rate.toString().toLowerCase().split("e");
  const exponent = exponentText ? Number(exponentText) : 0;
  const [integerPart, fractionalPart = ""] = coefficient.split(".");
  const digits = `${integerPart}${fractionalPart}`;
  const scale = fractionalPart.length - exponent;

  if (scale <= 0) {
    return {
      numerator: BigInt(digits) * 10n ** BigInt(-scale),
      denominator: 1n,
    };
  }

  return {
    numerator: BigInt(digits),
    denominator: 10n ** BigInt(scale),
  };
}

function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n || numerator < 0n) {
    throw new RangeError("Invalid values for monetary rounding.");
  }

  return (numerator + denominator / 2n) / denominator;
}

function validatePrincipal(principalSatang: bigint): void {
  if (principalSatang <= 0n) {
    throw new RangeError("Principal must be greater than zero.");
  }
}

function validateTerm(termMonths: number): void {
  if (
    !Number.isInteger(termMonths) ||
    !SUPPORTED_TERMS.includes(
      termMonths as (typeof SUPPORTED_TERMS)[number],
    )
  ) {
    throw new RangeError("Unsupported repayment term.");
  }
}

function validateDate(date: Date): void {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid disbursement date.");
  }
}

export function calculatePeriodInterest({
  openingPrincipalSatang,
  annualInterestRate,
  actualDays,
}: CalculatePeriodInterestInput): bigint {
  if (openingPrincipalSatang < 0n) {
    throw new RangeError("Opening principal cannot be negative.");
  }

  if (!Number.isInteger(actualDays) || actualDays < 0) {
    throw new RangeError("Actual days must be a non-negative integer.");
  }

  if (actualDays === 0 || openingPrincipalSatang === 0n) {
    return 0n;
  }

  const rate = toRateFraction(annualInterestRate);

  const numerator =
    openingPrincipalSatang *
    rate.numerator *
    BigInt(actualDays);

  const denominator =
    rate.denominator * BigInt(DAYS_PER_YEAR);

  return divideHalfUp(numerator, denominator);
}

function daysInUtcMonth(year: number, month: number): number {
  const firstDay = new Date(0);
  firstDay.setUTCHours(0, 0, 0, 0);
  firstDay.setUTCFullYear(year, month + 1, 0);

  return firstDay.getUTCDate();
}

function addAnchoredUtcMonths(
  originalDate: Date,
  monthsToAdd: number,
): Date {
  const originalYear = originalDate.getUTCFullYear();
  const originalMonth = originalDate.getUTCMonth();
  const originalDay = originalDate.getUTCDate();

  const totalMonths = originalYear * 12 + originalMonth + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = totalMonths - targetYear * 12;

  const targetDay = Math.min(
    originalDay,
    daysInUtcMonth(targetYear, targetMonth),
  );

  const result = new Date(originalDate);
  result.setUTCDate(1);
  result.setUTCFullYear(targetYear, targetMonth, targetDay);

  return result;
}

export function calculateDueDates({
  disbursedAt,
  termMonths,
}: CalculateDueDatesInput): Date[] {
  validateDate(disbursedAt);
  validateTerm(termMonths);

  return Array.from({ length: termMonths }, (_, index) =>
    addAnchoredUtcMonths(disbursedAt, index + 1),
  );
}

interface SimulatedInstallment {
  interestSatang: bigint;
  principalSatang: bigint;
  paymentSatang: bigint;
  closingPrincipalSatang: bigint;
}

function simulatePayments(
  principalSatang: bigint,
  annualInterestRate: number,
  periodDays: number[],
  regularPaymentSatang: bigint,
): SimulatedInstallment[] | null {
  let outstandingPrincipal = principalSatang;
  const installments: SimulatedInstallment[] = [];

  for (const actualDays of periodDays) {
    const interestSatang = calculatePeriodInterest({
      openingPrincipalSatang: outstandingPrincipal,
      annualInterestRate,
      actualDays,
    });

    if (regularPaymentSatang <= interestSatang) {
      return null;
    }

    const principalPayment = regularPaymentSatang - interestSatang;

    const principalSatangPaid =
      principalPayment >= outstandingPrincipal
        ? outstandingPrincipal
        : principalPayment;

    const closingPrincipalSatang =
      outstandingPrincipal - principalSatangPaid;

    const paymentSatang =
      interestSatang + principalSatangPaid;

    installments.push({
      interestSatang,
      principalSatang: principalSatangPaid,
      paymentSatang,
      closingPrincipalSatang,
    });

    outstandingPrincipal = closingPrincipalSatang;

    if (outstandingPrincipal === 0n) {
      break;
    }
  }

  return outstandingPrincipal === 0n ? installments : null;
}

function findRegularPayment(
  principalSatang: bigint,
  annualInterestRate: number,
  periodDays: number[],
): bigint {
  let lowerBound = 1n;
  let upperBound = principalSatang;

  while (
    simulatePayments(
      principalSatang,
      annualInterestRate,
      periodDays,
      upperBound,
    ) === null
  ) {
    upperBound *= 2n;
  }

  while (lowerBound < upperBound) {
    const midpoint = (lowerBound + upperBound) / 2n;

    const result = simulatePayments(
      principalSatang,
      annualInterestRate,
      periodDays,
      midpoint,
    );

    if (result !== null) {
      upperBound = midpoint;
    } else {
      lowerBound = midpoint + 1n;
    }
  }

  return lowerBound;
}

export function generateRepaymentSchedule({
  principalSatang,
  annualInterestRate,
  disbursedAt,
  termMonths,
}: GenerateRepaymentScheduleInput): GeneratedRepaymentSchedule {
  validatePrincipal(principalSatang);
  validateTerm(termMonths);
  validateDate(disbursedAt);

  toRateFraction(annualInterestRate);

  const dueDates = calculateDueDates({
    disbursedAt,
    termMonths,
  });

  const periodDays = dueDates.map((dueDate, index) => {
    const previousDate =
      index === 0 ? disbursedAt : dueDates[index - 1];

    return Math.round(
      (dueDate.getTime() - previousDate.getTime()) /
        (24 * 60 * 60 * 1000),
    );
  });

  const regularPaymentSatang = findRegularPayment(
    principalSatang,
    annualInterestRate,
    periodDays,
  );

  const simulatedInstallments = simulatePayments(
    principalSatang,
    annualInterestRate,
    periodDays,
    regularPaymentSatang,
  );

  if (simulatedInstallments === null) {
    throw new Error("Unable to generate a valid repayment schedule.");
  }

  let openingPrincipalSatang = principalSatang;

  const installments = simulatedInstallments.map(
    (installment, index): RepaymentScheduleInstallment => {
      const actualDays = periodDays[index];

      const result: RepaymentScheduleInstallment = {
        installmentNumber: index + 1,
        dueDate: dueDates[index],
        actualDays,
        openingPrincipalSatang,
        interestSatang: installment.interestSatang,
        principalSatang: installment.principalSatang,
        paymentSatang: installment.paymentSatang,
        closingPrincipalSatang: installment.closingPrincipalSatang,
      };

      openingPrincipalSatang = installment.closingPrincipalSatang;

      return result;
    },
  );

  return {
    regularPaymentSatang,
    installments,
  };
}
