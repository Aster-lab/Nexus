import { randomUUID } from "node:crypto";
import { vi } from "vitest";

import { postInvestorContribution } from "../../src/lib/services/investor-contribution.service";
import {
  approveLoanDisbursement,
  requestLoanDisbursement,
} from "../../src/lib/services/loan-disbursement-approval.service";
import { postLoanDisbursement } from "../../src/lib/services/loan-disbursement.service";
import { generateRepaymentSchedule } from "../../src/lib/services/repayment.service";
import { prisma } from "../../src/lib/prisma";
import {
  createAdditionalInvestorForLoan,
  createInvestorContributionFixture,
  createOpeningBalanceAdministrator,
  fundInvestorWallet,
} from "./investor-contribution.fixture";
import { activateRepaymentTestAccounts } from "./repayment.fixture";

export interface RepaymentAllocationLifecycleContext {
  administratorUserId: string;
  borrowerUser: { id: string };
  investorUser: { id: string };
  loan: { id: string; principalSatang: bigint };
  borrowerWalletId: string;
  clearingWalletId: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates a due repayment fixture through the real funding and disbursement
 * workflows. `investorCount` is one or two for the allocation test cases.
 */
export async function createRepaymentAllocationLifecycleContext(
  investorCount: 1 | 2,
): Promise<RepaymentAllocationLifecycleContext> {
  const escrowAccountBefore = await prisma.platformAccount.findUnique({
    where: { accountCode: "2200" },
    select: { id: true, status: true },
  });
  const escrowWalletBefore = escrowAccountBefore
    ? await prisma.wallet.findUnique({
        where: { ownerPlatformAccountId: escrowAccountBefore.id },
        select: { id: true, status: true },
      })
    : null;

  const wallClockNow = Date.now();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(wallClockNow - 70 * 24 * 60 * 60 * 1000));

  let repaymentAccounts: Awaited<
    ReturnType<typeof activateRepaymentTestAccounts>
  > | undefined;

  try {
    const administrator = await createOpeningBalanceAdministrator({});
    const administratorUserId = administrator.id;

    repaymentAccounts = await activateRepaymentTestAccounts();
    const fixture = await createInvestorContributionFixture({
      administratorUserId,
    });

    const contributionSatang =
      fixture.loan.principalSatang / BigInt(investorCount);
    const investors: Array<{ userId: string; walletId: string }> = [
      {
        userId: fixture.investorUser.id,
        walletId: fixture.investorWallet.id,
      },
    ];

    if (investorCount === 2) {
      const additionalInvestor = await createAdditionalInvestorForLoan({
        loanId: fixture.loan.id,
        administratorUserId,
        amountSatang: contributionSatang,
      });
      investors.push({
        userId: additionalInvestor.investorUser.id,
        walletId: additionalInvestor.investorWallet.id,
      });
    }

    await fundInvestorWallet({
      walletId: fixture.investorWallet.id,
      administratorUserId,
      amountSatang: contributionSatang,
    });

    for (const investor of investors) {
      await postInvestorContribution({
        userId: investor.userId,
        loanId: fixture.loan.id,
        amountSatang: contributionSatang,
        idempotencyKey: `allocation-lifecycle-${randomUUID()}`,
      });
    }

    const fundedLoan = await prisma.loan.findUniqueOrThrow({
      where: { id: fixture.loan.id },
      select: { status: true, fundedSatang: true, principalSatang: true },
    });
    if (
      fundedLoan.status !== "FUNDED" ||
      fundedLoan.fundedSatang !== fundedLoan.principalSatang
    ) {
      throw new Error("Contribution workflow did not fully fund the test loan.");
    }

    const borrowerWallet = await prisma.wallet.create({
      data: {
        ownerUserId: fixture.borrowerUser.id,
        currency: "THB",
        balanceSatang: 0n,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    const request = await requestLoanDisbursement({
      loanId: fixture.loan.id,
      requesterUserId: administratorUserId,
      reason: "Allocation persistence lifecycle test",
    });
    const approval = await approveLoanDisbursement({
      requestAuditLogId: request.id,
      approverUserId: administratorUserId,
      reason: "Approve allocation persistence lifecycle test",
    });
    const disbursement = await postLoanDisbursement({
      loanId: fixture.loan.id,
      approvalAuditLogId: approval.id,
      idempotencyKey: `allocation-disbursement-${randomUUID()}`,
    });

    if (disbursement.status !== "POSTED") {
      throw new Error("WP5 disbursement service did not post the loan.");
    }

    await generateRepaymentSchedule({
      loanId: fixture.loan.id,
      actorUserId: administratorUserId,
    });

    vi.useRealTimers();

    const dueInstallment = await prisma.installment.findFirst({
      where: {
        scheduleVersion: { schedule: { loanId: fixture.loan.id } },
        dueDate: { lte: new Date() },
        status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
      },
      orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
      select: { id: true },
    });
    if (!dueInstallment) {
      throw new Error("Lifecycle fixture did not produce a payable installment.");
    }

    let cleaned = false;
    const cleanup = async () => {
      if (cleaned) return;
      const restores: Promise<unknown>[] = [];
      if (escrowWalletBefore) {
        restores.push(
          prisma.wallet.update({
            where: { id: escrowWalletBefore.id },
            data: { status: escrowWalletBefore.status },
          }),
        );
      }
      if (escrowAccountBefore) {
        restores.push(
          prisma.platformAccount.update({
            where: { id: escrowAccountBefore.id },
            data: { status: escrowAccountBefore.status },
          }),
        );
      }
      if (repaymentAccounts) restores.push(repaymentAccounts.cleanup());
      const results = await Promise.allSettled(restores);
      const failures = results
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => result.reason);
      if (failures.length > 0) {
        throw new AggregateError(failures, "Failed to restore allocation test account states.");
      }
      cleaned = true;
    };

    return {
      administratorUserId,
      borrowerUser: { id: fixture.borrowerUser.id },
      investorUser: { id: fixture.investorUser.id },
      loan: {
        id: fixture.loan.id,
        principalSatang: fixture.loan.principalSatang,
      },
      borrowerWalletId: borrowerWallet.id,
      clearingWalletId: repaymentAccounts.clearingWalletId,
      cleanup,
    };
  } catch (error) {
    vi.useRealTimers();
    if (repaymentAccounts) await repaymentAccounts.cleanup();
    if (escrowWalletBefore) {
      await prisma.wallet.update({
        where: { id: escrowWalletBefore.id },
        data: { status: escrowWalletBefore.status },
      });
    }
    if (escrowAccountBefore) {
      await prisma.platformAccount.update({
        where: { id: escrowAccountBefore.id },
        data: { status: escrowAccountBefore.status },
      });
    }
    throw error;
  }
}
