
import { prisma } from "../prisma";
import {
  generateRepaymentSchedule as calculateSchedule,
} from "./repayment/repayment-calculation";

const SCHEDULE_TRANSACTION_OPTIONS = {
  isolationLevel: "Serializable" as const,
  maxWait: 10_000,
  timeout: 30_000,
};

const MAX_SCHEDULE_GENERATION_RETRIES = 3;

interface GenerateRepaymentScheduleInput {
  loanId: string;
  actorUserId: string;
}

interface GeneratedScheduleResult {
  scheduleId: string;
  currentVersionId: string;
  versionId: string;
  installmentCount: number;
  regularPaymentSatang: bigint;
}

function getErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return undefined;
}

function isSerializationConflict(error: unknown): boolean {
  const code = getErrorCode(error);

  if (code === "P2034") {
    return true;
  }

  // Support the narrowly identified PostgreSQL serialization
  // conflict exposed by Prisma's driver adapter.
  if (code !== "P2010" || typeof error !== "object" || error === null) {
    return false;
  }

  const meta = "meta" in error ? error.meta : undefined;

  if (typeof meta !== "object" || meta === null) {
    return false;
  }

  const driverError =
    "driverAdapterError" in meta ? meta.driverAdapterError : undefined;

  if (typeof driverError !== "object" || driverError === null) {
    return false;
  }

  const cause = "cause" in driverError ? driverError.cause : undefined;

  if (typeof cause !== "object" || cause === null) {
    return false;
  }

  return (
    "originalCode" in cause &&
    cause.originalCode === "40001"
  );
}

function isUniqueConstraintConflict(error: unknown): boolean {
  return getErrorCode(error) === "P2002";
}

async function findExistingSchedule(
  loanId: string,
): Promise<GeneratedScheduleResult | null> {
  const schedule = await prisma.repaymentSchedule.findUnique({
    where: { loanId },
    select: {
      id: true,
      currentVersionId: true,
    },
  });

  if (!schedule) {
    return null;
  }

  if (!schedule.currentVersionId) {
    throw new Error(
      `Schedule ${schedule.id} exists without a current version.`,
    );
  }

  const [version, installmentCount] = await Promise.all([
    prisma.scheduleVersion.findUnique({
      where: { id: schedule.currentVersionId },
      select: {
        id: true,
        scheduleSnapshot: true,
      },
    }),
    prisma.installment.count({
      where: {
        scheduleVersionId: schedule.currentVersionId,
      },
    }),
  ]);

  if (!version) {
    throw new Error(
      `Schedule ${schedule.id} references a missing current version.`,
    );
  }

  const snapshot = version.scheduleSnapshot;

  if (
    typeof snapshot !== "object" ||
    snapshot === null ||
    !("regularPaymentSatang" in snapshot) ||
    typeof snapshot.regularPaymentSatang !== "string"
  ) {
    throw new Error(
      `Schedule version ${version.id} has an invalid calculation snapshot.`,
    );
  }

  return {
    scheduleId: schedule.id,
    currentVersionId: schedule.currentVersionId,
    versionId: version.id,
    installmentCount,
    regularPaymentSatang: BigInt(snapshot.regularPaymentSatang),
  };
}

export async function generateRepaymentSchedule({
  loanId,
  actorUserId,
}: GenerateRepaymentScheduleInput): Promise<GeneratedScheduleResult> {
  if (!loanId || !actorUserId) {
    throw new Error("Loan ID and actor user ID are required.");
  }

  for (
    let attempt = 1;
    attempt <= MAX_SCHEDULE_GENERATION_RETRIES;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          // Idempotency check inside the transaction.
          const existingSchedule =
            await tx.repaymentSchedule.findUnique({
              where: { loanId },
              select: {
                id: true,
                currentVersionId: true,
              },
            });

          if (existingSchedule) {
            if (!existingSchedule.currentVersionId) {
              throw new Error(
                `Schedule ${existingSchedule.id} has no current version.`,
              );
            }

            const [version, installmentCount] = await Promise.all([
              tx.scheduleVersion.findUnique({
                where: {
                  id: existingSchedule.currentVersionId,
                },
                select: {
                  id: true,
                  scheduleSnapshot: true,
                },
              }),
              tx.installment.count({
                where: {
                  scheduleVersionId:
                    existingSchedule.currentVersionId,
                },
              }),
            ]);

            if (!version) {
              throw new Error(
                `Schedule ${existingSchedule.id} references a missing version.`,
              );
            }

            const snapshot = version.scheduleSnapshot;

            if (
              typeof snapshot !== "object" ||
              snapshot === null ||
              !("regularPaymentSatang" in snapshot) ||
              typeof snapshot.regularPaymentSatang !== "string"
            ) {
              throw new Error(
                `Schedule version ${version.id} has an invalid snapshot.`,
              );
            }

            return {
              scheduleId: existingSchedule.id,
              currentVersionId: existingSchedule.currentVersionId,
              versionId: version.id,
              installmentCount,
              regularPaymentSatang: BigInt(
                snapshot.regularPaymentSatang,
              ),
            };
          }

          const loan = await tx.loan.findUnique({
            where: { id: loanId },
            select: {
              id: true,
              principalSatang: true,
              annualInterestRate: true,
              termMonths: true,
              status: true,
              disbursedAt: true,
            },
          });

          if (!loan) {
            throw new Error("Loan not found.");
          }

          if (loan.status !== "ACTIVE") {
            throw new Error(
              "A repayment schedule can only be generated for an active loan.",
            );
          }

          if (!loan.disbursedAt) {
            throw new Error(
              "Loan must have a disbursement date before schedule generation.",
            );
          }

          if (loan.principalSatang <= 0n) {
            throw new Error("Loan principal must be greater than zero.");
          }

          // All financial calculations come from the tested pure module.
          const calculation = calculateSchedule({
            principalSatang: loan.principalSatang,
            annualInterestRate: Number(loan.annualInterestRate),
            disbursedAt: loan.disbursedAt,
            termMonths: loan.termMonths,
          });

          if (calculation.installments.length !== loan.termMonths) {
            throw new Error(
              "Generated installment count does not match the loan term.",
            );
          }

          const totalInterestSatang =
            calculation.installments.reduce(
              (total, installment) =>
                total + installment.interestSatang,
              0n,
            );

          const totalPrincipalSatang =
            calculation.installments.reduce(
              (total, installment) =>
                total + installment.principalSatang,
              0n,
            );

          const finalInstallment =
            calculation.installments[
              calculation.installments.length - 1
            ];

          if (
            totalPrincipalSatang !== loan.principalSatang ||
            finalInstallment.closingPrincipalSatang !== 0n
          ) {
            throw new Error(
              "Generated schedule does not reconcile to the loan principal.",
            );
          }

          // Create the schedule first. currentVersionId is linked after
          // the version and its installments have been created.
          const schedule = await tx.repaymentSchedule.create({
            data: {
              loanId: loan.id,
            },
          });

          const version = await tx.scheduleVersion.create({
            data: {
              scheduleId: schedule.id,
              versionNumber: 1,
              calculationMethod: "REDUCING_BALANCE",
              interestRateType: "FIXED",
              dayCountConvention: "ACTUAL_365",
              paymentFrequency: "MONTHLY",
              annualInterestRate: loan.annualInterestRate,
              roundingMethod: "HALF_UP",
              effectiveFrom: loan.disbursedAt,
              scheduleInputs: {
                loanId: loan.id,
                actorUserId,
                principalSatang: loan.principalSatang.toString(),
                annualInterestRate: Number(
                  loan.annualInterestRate,
                ),
                termMonths: loan.termMonths,
                disbursedAt: loan.disbursedAt.toISOString(),
                dayCountConvention: "ACTUAL_365",
                calculationMethod: "REDUCING_BALANCE",
                roundingMethod: "HALF_UP",
              },
              scheduleSnapshot: {
                regularPaymentSatang:
                  calculation.regularPaymentSatang.toString(),
                totalPrincipalSatang:
                  totalPrincipalSatang.toString(),
                totalInterestSatang:
                  totalInterestSatang.toString(),
                totalPaymentSatang: (
                  totalPrincipalSatang + totalInterestSatang
                ).toString(),
                installments: calculation.installments.map(
                  (installment) => ({
                    installmentNumber:
                      installment.installmentNumber,
                    dueDate: installment.dueDate.toISOString(),
                    actualDays: installment.actualDays,
                    openingPrincipalSatang:
                      installment.openingPrincipalSatang.toString(),
                    principalSatang:
                      installment.principalSatang.toString(),
                    interestSatang:
                      installment.interestSatang.toString(),
                    paymentSatang:
                      installment.paymentSatang.toString(),
                    closingPrincipalSatang:
                      installment.closingPrincipalSatang.toString(),
                  }),
                ),
              },
            },
          });

          await tx.installment.createMany({
            data: calculation.installments.map((installment) => ({
              scheduleVersionId: version.id,
              installmentNumber: installment.installmentNumber,
              dueDate: installment.dueDate,
              openingPrincipalSatang:
                installment.openingPrincipalSatang,
              principalDueSatang: installment.principalSatang,
              interestDueSatang: installment.interestSatang,
              status: "PENDING",
            })),
          });

          const updatedSchedule =
            await tx.repaymentSchedule.update({
              where: { id: schedule.id },
              data: {
                currentVersionId: version.id,
              },
              select: {
                id: true,
                currentVersionId: true,
              },
            });

          if (!updatedSchedule.currentVersionId) {
            throw new Error(
              "Failed to set the current repayment schedule version.",
            );
          }

          return {
            scheduleId: updatedSchedule.id,
            currentVersionId: updatedSchedule.currentVersionId,
            versionId: version.id,
            installmentCount: calculation.installments.length,
            regularPaymentSatang:
              calculation.regularPaymentSatang,
          };
        },
        SCHEDULE_TRANSACTION_OPTIONS,
      );
    } catch (error) {
      // A concurrent request may have created the unique schedule first.
      if (isUniqueConstraintConflict(error)) {
        const existing = await findExistingSchedule(loanId);

        if (existing) {
          return existing;
        }

        throw error;
      }

      if (
        isSerializationConflict(error) &&
        attempt < MAX_SCHEDULE_GENERATION_RETRIES
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    "Schedule generation failed after the maximum retry attempts.",
  );
}


interface ValidateRepaymentEligibilityInput {
  loanId: string;
  borrowerUserId: string;
  amountSatang: bigint;
}

interface RepaymentEligibilityResult {
  loanId: string;
  amountSatang: bigint;
  payableOutstandingSatang: bigint;
  payableInstallmentCount: number;
}

export async function validateRepaymentEligibility({
  loanId,
  borrowerUserId,
  amountSatang,
}: ValidateRepaymentEligibilityInput): Promise<RepaymentEligibilityResult> {
  if (!loanId || !borrowerUserId) {
    throw new Error("Loan ID and borrower user ID are required.");
  }

  if (amountSatang <= 0n) {
    throw new Error("Repayment amount must be greater than zero.");
  }

  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    select: {
      id: true,
      status: true,
      disbursedAt: true,
      borrowerProfile: {
        select: {
          userId: true,
        },
      },
      repaymentSchedule: {
        select: {
          currentVersionId: true,
        },
      },
    },
  });

  if (!loan) {
    throw new Error("Loan not found.");
  }

  if (loan.borrowerProfile.userId !== borrowerUserId) {
    throw new Error("Borrower is not authorized to repay this loan.");
  }

  // Delinquent loans remain repayable.
  if (
    loan.status !== "ACTIVE" &&
    loan.status !== "DELINQUENT"
  ) {
    throw new Error("Loan is not eligible for repayment.");
  }

  if (!loan.disbursedAt) {
    throw new Error("Loan has not been disbursed.");
  }

  const currentVersionId =
    loan.repaymentSchedule?.currentVersionId;

  if (!currentVersionId) {
    throw new Error("Loan has no active repayment schedule.");
  }

  const now = new Date();

  const installments = await prisma.installment.findMany({
    where: {
      scheduleVersionId: currentVersionId,
      dueDate: {
        lte: now,
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

  let payableOutstandingSatang = 0n;
  let payableInstallmentCount = 0;

  for (const installment of installments) {
    const outstandingPrincipal =
      installment.principalDueSatang -
      installment.paidPrincipalSatang;

    const outstandingInterest =
      installment.interestDueSatang -
      installment.paidInterestSatang;

    const outstanding =
      outstandingPrincipal + outstandingInterest;

    if (outstanding < 0n) {
      throw new Error(
        "Installment payment balances exceed the scheduled obligation.",
      );
    }

    if (outstanding === 0n) {
      continue;
    }

    payableOutstandingSatang += outstanding;
    payableInstallmentCount += 1;
  }

  if (payableInstallmentCount === 0) {
    throw new Error("No installments are currently payable.");
  }

  if (amountSatang > payableOutstandingSatang) {
    throw new Error(
      "Repayment amount exceeds the currently payable outstanding obligation.",
    );
  }

  return {
    loanId: loan.id,
    amountSatang,
    payableOutstandingSatang,
    payableInstallmentCount,
  };
}

