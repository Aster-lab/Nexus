
import { randomUUID } from "node:crypto";
import { vi } from "vitest";

import { prisma } from "../../src/lib/prisma";
import {
  createInvestorContributionFixture,
  createOpeningBalanceAdministrator,
  fundInvestorWallet,
} from "./investor-contribution.fixture";
import { postInvestorContribution } from "../../src/lib/services/investor-contribution.service";
import { createOpeningBalance } from "../../src/lib/services/opening-balance.service";
import { generateRepaymentSchedule } from "../../src/lib/services/repayment.service";
import {
  approveLoanDisbursement,
  recordBorrowerDisbursementConsent,
  requestLoanDisbursement,
} from "../../src/lib/services/loan-disbursement-approval.service";
import { postLoanDisbursement } from "../../src/lib/services/loan-disbursement.service";
const DEFAULT_BORROWER_OPENING_BALANCE_SATANG = 100_000_000n;
type PlatformAccountStatusValue =
  Awaited<
    ReturnType<typeof prisma.platformAccount.findUniqueOrThrow>
  >["status"];

type WalletStatusValue =
  Awaited<
    ReturnType<typeof prisma.wallet.findUniqueOrThrow>
  >["status"];

export type RepaymentFixtureOperations = {
  updatePlatformAccountStatus: (
    id: string,
    status: PlatformAccountStatusValue,
  ) => Promise<void>;

  updateWalletStatus: (
    id: string,
    status: WalletStatusValue,
  ) => Promise<void>;
};

export type RepaymentTestContextOperations = {
  postOpeningBalance: typeof createOpeningBalance;
};

const defaultRepaymentTestContextOperations: RepaymentTestContextOperations = {
  postOpeningBalance: createOpeningBalance,
};

export type CreateRepaymentTestContextOptions = {
  openingBalanceSatang?: bigint;
  operations?: RepaymentTestContextOperations;
};

const defaultRepaymentFixtureOperations: RepaymentFixtureOperations = {
  updatePlatformAccountStatus: async (id, status) => {
    await prisma.platformAccount.update({
      where: { id },
      data: { status },
    });
  },

  updateWalletStatus: async (id, status) => {
    await prisma.wallet.update({
      where: { id },
      data: { status },
    });
  },
};

export const REPAYMENT_CLEARING_ACCOUNT_CODE = "2300";
export const OPENING_BALANCE_ACCOUNT_CODE = "1300";

export async function activateRepaymentTestAccounts(
  operations: RepaymentFixtureOperations = defaultRepaymentFixtureOperations,
) {
  const sourceAccount = await prisma.platformAccount.findUniqueOrThrow({
    where: { accountCode: OPENING_BALANCE_ACCOUNT_CODE },
    select: {
      id: true,
      status: true,
    },
  });

  const clearingAccount = await prisma.platformAccount.findUniqueOrThrow({
    where: { accountCode: REPAYMENT_CLEARING_ACCOUNT_CODE },
    select: {
      id: true,
      status: true,
    },
  });

  const clearingWallet = await prisma.wallet.upsert({
    where: {
      ownerPlatformAccountId: clearingAccount.id,
    },
    update: {},
    create: {
      ownerPlatformAccountId: clearingAccount.id,
      currency: "THB",
      balanceSatang: 0n,
      status: "CLOSED",
    },
    select: {
      id: true,
      status: true,
    },
  });

  let cleanedUp = false;
  async function cleanup() {
    if (cleanedUp) return;

    const results = await Promise.allSettled([
      operations.updateWalletStatus(
        clearingWallet.id,
        clearingWallet.status,
      ),
      operations.updatePlatformAccountStatus(
        clearingAccount.id,
        clearingAccount.status,
      ),
      operations.updatePlatformAccountStatus(
        sourceAccount.id,
        sourceAccount.status,
      ),
    ]);

    cleanedUp = results.every(
      (result) => result.status === "fulfilled",
    );

    const failures = results
      .filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      )
      .map((result) => result.reason);

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        "Failed to restore one or more repayment fixture account states",
      );
    }
  }


  try {
    await operations.updatePlatformAccountStatus(
      sourceAccount.id,
      "ACTIVE",
    );

    await operations.updatePlatformAccountStatus(
      clearingAccount.id,
      "ACTIVE",
    );

    await operations.updateWalletStatus(
      clearingWallet.id,
      "ACTIVE",
    );
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [cleanupError],
        "Repayment account activation and cleanup both failed",
      );
    }

  throw error;
  }

  return {
    clearingAccountId: clearingAccount.id,
    clearingWalletId: clearingWallet.id,
    originalClearingWalletStatus : clearingWallet.status,
    cleanup,
  };
}


export async function createRepaymentTestContext(
  options: CreateRepaymentTestContextOptions = {},
) {
  const openingBalanceSatang =
    options.openingBalanceSatang ??
    DEFAULT_BORROWER_OPENING_BALANCE_SATANG;

  if (openingBalanceSatang <= 0n) {
    throw new Error("Borrower opening balance must be greater than zero");
  }

  const administrator = await createOpeningBalanceAdministrator({});
  const administratorUserId = administrator.id;

  const fixture = await createInvestorContributionFixture({
    administratorUserId,
  });
  const repaymentAccounts = await activateRepaymentTestAccounts();
  const operations =
    options.operations ?? defaultRepaymentTestContextOperations;

  const openingBalanceIdempotencyKey =
    `repayment-test-opening-${randomUUID()}`;

  const wallClockNow = Date.now();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-15T00:00:00.000Z"));

  try {
    await fundInvestorWallet({
      walletId: fixture.investorWallet.id,
      administratorUserId,
      amountSatang: fixture.loan.principalSatang,
    });

    await postInvestorContribution({
      userId: fixture.investorUser.id,
      loanId: fixture.loan.id,
      amountSatang: fixture.loan.principalSatang,
      idempotencyKey: fixture.idempotencyKey,
    });

    const borrowerWallet = await prisma.wallet.upsert({
      where: { ownerUserId: fixture.borrowerUser.id },
      update: {},
      create: {
        ownerUserId: fixture.borrowerUser.id,
        currency: "THB",
        balanceSatang: 0n,
        status: "ACTIVE",
      },
    });

    await recordBorrowerDisbursementConsent({
      loanId: fixture.loan.id,
      borrowerUserId: fixture.borrowerUser.id,
    });
    const request = await requestLoanDisbursement({
      loanId: fixture.loan.id,
      requesterUserId: administratorUserId,
      reason: "Repayment integration test disbursement",
    });
    const approval = await approveLoanDisbursement({
      requestAuditLogId: request.id,
      approverUserId: administratorUserId,
      reason: "Approve repayment integration test disbursement",
    });
    const disbursement = await postLoanDisbursement({
      loanId: fixture.loan.id,
      approvalAuditLogId: approval.id,
      idempotencyKey: `repayment-test-disbursement-${randomUUID()}`,
    });
    if (disbursement.status !== "POSTED") {
      throw new Error("Repayment integration fixture disbursement did not post.");
    }
    const loan = await prisma.loan.findUniqueOrThrow({ where: { id: fixture.loan.id } });
    await operations.postOpeningBalance({
      administratorUserId,
      walletId: borrowerWallet.id,
      amountSatang: openingBalanceSatang,
      idempotencyKey: openingBalanceIdempotencyKey,
      reason: "Repayment integration test opening balance",
    });

    async function cleanup() {
      await prisma.loan.update({
        where: { id: loan.id },
        data: { status: loan.status, disbursedAt: loan.disbursedAt },
      });
      await repaymentAccounts.cleanup();
    }

    return {
      administratorUserId,
      borrowerUser: fixture.borrowerUser,
      investorUser: fixture.investorUser,
      loan,
      borrowerWalletId: borrowerWallet.id,
      clearingAccountId: repaymentAccounts.clearingAccountId,
      clearingWalletId: repaymentAccounts.clearingWalletId,
      originalClearingWalletStatus:
        repaymentAccounts.originalClearingWalletStatus,
      openingBalanceSatang,
      openingBalanceIdempotencyKey,
      cleanup,
      idempotencyKey: `repayment-${randomUUID()}`,
    };
  } catch (error) {
    try {
      await repaymentAccounts.cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Repayment test context creation and cleanup both failed",
      );
    }

    throw error;
  } finally {
    vi.setSystemTime(new Date(wallClockNow));
    vi.useRealTimers();
  }
}

export async function createRepaymentScheduleTestContext(
  options: CreateRepaymentTestContextOptions = {},
) {
  const context = await createRepaymentTestContext(options);

  try {
    const schedule = await generateRepaymentSchedule({
      loanId: context.loan.id,
      actorUserId: context.administratorUserId,
    });

    const installments = await prisma.installment.findMany({
      where: {
        scheduleVersionId: schedule.currentVersionId,
      },
      orderBy: {
        installmentNumber: "asc",
      },
    });

    return {
      ...context,
      schedule,
      installments,
    };
  } catch (setupError) {
    try {
      await context.cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [setupError, cleanupError],
        "Repayment schedule setup and cleanup both failed",
      );
    }

    throw setupError;
  }
}
export type RepaymentTestContext =
  Awaited<ReturnType<typeof createRepaymentTestContext>>;

export type RepaymentScheduleTestContext =
  Awaited<ReturnType<typeof createRepaymentScheduleTestContext>>;


