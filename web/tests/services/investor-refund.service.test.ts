import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,} from "vitest";

import { prisma } from "../../src/lib/prisma";
import { postOpeningBalance } from "../../src/lib/services/opening-balance.service";
import { postInvestorContribution } from "../../src/lib/services/investor-contribution.service";
import {
  approveLoanRefund,
  requestLoanRefund,
} from "../../src/lib/services/loan-refund-approval.service";
import { postInvestorRefund } from "../../src/lib/services/investor-refund.service";

import {
  createInvestorContributionFixture,
  createOpeningBalanceAdministrator,
  createAdditionalInvestorForLoan,
} from "../fixtures/investor-contribution.fixture";

async function expectWalletReconciled(walletId: string) {
    const entries = await prisma.ledgerEntry.findMany({
        where: {
            walletId,
            ledgerTransaction: {
                status: "POSTED",
            },
        },
    });

    const debit = entries
        .filter((entry) => entry.entryType === "DEBIT")
        .reduce((total, entry) => total + entry.amountSatang, 0n);

    const credit = entries
        .filter((entry) => entry.entryType === "CREDIT")
        .reduce((total, entry) => total + entry.amountSatang, 0n);

    const wallet = await prisma.wallet.findUniqueOrThrow({
        where: { id: walletId },
    });

    expect(wallet.balanceSatang).toBe(credit - debit);
}

describe("Investor refund integration", () => {
  let administratorUserId: string;
  let originalSourceAccountStatus: "ACTIVE" | "INACTIVE";
  let fixture: Awaited<ReturnType<typeof createInvestorContributionFixture>>;

  beforeAll(async () => {
    const administrator = await createOpeningBalanceAdministrator({});
    administratorUserId = administrator.id;
  });

  beforeEach(async () => {
    const sourceAccount = await prisma.platformAccount.findUniqueOrThrow({
      where: { accountCode: "1300" },
      select: { status: true },
    });

    originalSourceAccountStatus = sourceAccount.status;

    await prisma.platformAccount.update({
      where: { accountCode: "1300" },
      data: { status: "ACTIVE" },
    });

    fixture = await createInvestorContributionFixture({
      administratorUserId,
    });
  });

  afterEach(async () => {
    await prisma.platformAccount.update({
      where: { accountCode: "1300" },
      data: { status: originalSourceAccountStatus },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function getInvestorWallet() {
    return prisma.wallet.findUniqueOrThrow({
      where: { ownerUserId: fixture.investorUser.id },
    });
  }

  async function getEscrowWallet() {
    return prisma.wallet.findUniqueOrThrow({
      where: { id: fixture.escrowAccount.platformWalletId },
    });
  }

  async function fundAndContribute() {
    const investorWallet = await getInvestorWallet();

    await postOpeningBalance({
      administratorUserId,
      walletId: investorWallet.id,
      amountSatang: fixture.amountSatang,
      idempotencyKey: `refund-opening-${fixture.idempotencyKey}`,
      reason: "Investor refund integration test funding",
    });

    await postInvestorContribution({
      userId: fixture.investorUser.id,
      loanId: fixture.loan.id,
      amountSatang: fixture.amountSatang,
      idempotencyKey: `refund-contribution-${fixture.idempotencyKey}`,
    });

    return prisma.investment.findUniqueOrThrow({
      where: {
        investorProfileId_loanId: {
          investorProfileId: fixture.investorProfile.id,
          loanId: fixture.loan.id,
        },
      },
    });
  }

  async function cancelLoan() {
    await prisma.loan.update({
      where: { id: fixture.loan.id },
      data: { status: "CANCELLED" },
    });

    await prisma.loanStatusHistory.create({
      data: {
        loanId: fixture.loan.id,
        previousStatus: "FUNDED",
        newStatus: "CANCELLED",
        reason: "Automated refund integration test",
        changedByUserId: administratorUserId,
      },
    });
  }

  async function approveRefund() {
    const request = await requestLoanRefund({
      requestedByUserId: administratorUserId,
      loanId: fixture.loan.id,
      reason: "Automated refund integration test",
    });

    return approveLoanRefund({
      approvedByUserId: administratorUserId,
      requestAuditLogId: request.id,
      reason: "Approved for integration test",
    });
  }

  it("refunds an investor after administrator approval", async () => {
    const investment = await fundAndContribute();
    await cancelLoan();

    const investorBefore = await getInvestorWallet();
    const escrowBefore = await getEscrowWallet();
    const approval = await approveRefund();

    const refund = await postInvestorRefund({
      investmentId: investment.id,
      approvalAuditLogId: approval.id,
      idempotencyKey: `refund-${fixture.idempotencyKey}`,
    });

    const investorAfter = await getInvestorWallet();
    const escrowAfter = await getEscrowWallet();

    expect(refund.amountSatang).toBe(fixture.amountSatang);

    expect(investorAfter.balanceSatang).toBe(
      investorBefore.balanceSatang + fixture.amountSatang,
    );

    expect(escrowAfter.balanceSatang).toBe(
      escrowBefore.balanceSatang - fixture.amountSatang,
    );

    const ledger = await prisma.ledgerTransaction.findUniqueOrThrow({
      where: { id: refund.ledgerTransactionId },
      include: { entries: true },
    });

    expect(ledger.status).toBe("POSTED");
    expect(ledger.entries).toHaveLength(2);

    expect(
      ledger.entries.find((entry) => entry.entryType === "DEBIT")
        ?.amountSatang,
    ).toBe(fixture.amountSatang);

    expect(
      ledger.entries.find((entry) => entry.entryType === "CREDIT")
        ?.amountSatang,
    ).toBe(fixture.amountSatang);

    const escrowTransaction = await prisma.escrowTransaction.findFirstOrThrow({
      where: {
        ledgerTransactionId: refund.ledgerTransactionId,
      },
    });

    expect(escrowTransaction.type).toBe("REFUND");
    expect(escrowTransaction.amountSatang).toBe(fixture.amountSatang);
  });

  it("does not refund twice when the same request is retried", async () => {
    const investment = await fundAndContribute();
    await cancelLoan();

    const approval = await approveRefund();
    const idempotencyKey = `refund-retry-${fixture.idempotencyKey}`;

    const firstRefund = await postInvestorRefund({
      investmentId: investment.id,
      approvalAuditLogId: approval.id,
      idempotencyKey,
    });

    const investorBeforeRetry = await getInvestorWallet();
    const escrowBeforeRetry = await getEscrowWallet();

    const secondRefund = await postInvestorRefund({
      investmentId: investment.id,
      approvalAuditLogId: approval.id,
      idempotencyKey,
    });

    const investorAfterRetry = await getInvestorWallet();
    const escrowAfterRetry = await getEscrowWallet();

    expect(secondRefund.id).toBe(firstRefund.id);

    expect(investorAfterRetry.balanceSatang).toBe(
      investorBeforeRetry.balanceSatang,
    );

    expect(escrowAfterRetry.balanceSatang).toBe(
      escrowBeforeRetry.balanceSatang,
    );

    const refunds = await prisma.investmentRefund.findMany({
      where: { idempotencyKey },
    });

    expect(refunds).toHaveLength(1);
  });
  it("rejects a refund request when the loan is not cancelled", async () => {
    await expect(
        requestLoanRefund({
        requestedByUserId: administratorUserId,
        loanId: fixture.loan.id,
        reason: "Test refund eligibility",
        }),
    ).rejects.toThrow();
    });

  it("rejects a refund when no valid administrator approval exists", async () => {
    const investment = await fundAndContribute();
    await cancelLoan();

    const investorBefore = await getInvestorWallet();
    const escrowBefore = await getEscrowWallet();

    const refundCountBefore = await prisma.investmentRefund.count({
      where: { investmentId: investment.id },
    });

    await expect(
      postInvestorRefund({
        investmentId: investment.id,
        approvalAuditLogId: "00000000-0000-4000-8000-000000000001",
        idempotencyKey: `refund-no-approval-${fixture.idempotencyKey}`,
      }),
    ).rejects.toThrow();

    const investorAfter = await getInvestorWallet();
    const escrowAfter = await getEscrowWallet();

    const refundCountAfter = await prisma.investmentRefund.count({
      where: { investmentId: investment.id },
    });

    expect(investorAfter.balanceSatang).toBe(investorBefore.balanceSatang);
    expect(escrowAfter.balanceSatang).toBe(escrowBefore.balanceSatang);
    expect(refundCountAfter).toBe(refundCountBefore);
  });

  it("rejects a second refund using a different idempotency key", async () => {
    const investment = await fundAndContribute();
    await cancelLoan();

    const approval = await approveRefund();

    const firstRefund = await postInvestorRefund({
      investmentId: investment.id,
      approvalAuditLogId: approval.id,
      idempotencyKey: `refund-first-${fixture.idempotencyKey}`,
    });

    const investorBeforeRetry = await getInvestorWallet();
    const escrowBeforeRetry = await getEscrowWallet();

    const refundCountBefore = await prisma.investmentRefund.count({
      where: { investmentId: investment.id },
    });

    await expect(
      postInvestorRefund({
        investmentId: investment.id,
        approvalAuditLogId: approval.id,
        idempotencyKey: `refund-second-${fixture.idempotencyKey}`,
      }),
    ).rejects.toThrow();

    const investorAfterRetry = await getInvestorWallet();
    const escrowAfterRetry = await getEscrowWallet();

    const refundCountAfter = await prisma.investmentRefund.count({
      where: { investmentId: investment.id },
    });

    expect(investorAfterRetry.balanceSatang).toBe(
      investorBeforeRetry.balanceSatang,
    );

    expect(escrowAfterRetry.balanceSatang).toBe(
      escrowBeforeRetry.balanceSatang,
    );

    expect(refundCountAfter).toBe(refundCountBefore);

    expect(
      await prisma.investmentRefund.findUnique({
        where: { id: firstRefund.id },
      }),
    ).not.toBeNull();
  });

  
  it("rejects refund approval by a non-administrator", async () => {
    await fundAndContribute();
    await cancelLoan();

    const request = await requestLoanRefund({
        requestedByUserId: administratorUserId,
        loanId: fixture.loan.id,
        reason: "Non-administrator approval test",
    });

    await expect(
        approveLoanRefund({
        approvedByUserId: fixture.investorUser.id,
        requestAuditLogId: request.id,
        reason: "Attempted approval by investor",
        }),
    ).rejects.toThrow();
    });
  it("allows only one refund when concurrent requests use different idempotency keys", async () => {
    const investment = await fundAndContribute();
    await cancelLoan();

    const approval = await approveRefund();

    const investorBefore = await getInvestorWallet();
    const escrowBefore = await getEscrowWallet();

    const results = await Promise.allSettled([
        postInvestorRefund({
        investmentId: investment.id,
        approvalAuditLogId: approval.id,
        idempotencyKey: `refund-concurrent-a-${fixture.idempotencyKey}`,
        }),
        postInvestorRefund({
        investmentId: investment.id,
        approvalAuditLogId: approval.id,
        idempotencyKey: `refund-concurrent-b-${fixture.idempotencyKey}`,
        }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const investorAfter = await getInvestorWallet();
    const escrowAfter = await getEscrowWallet();

    expect(investorAfter.balanceSatang).toBe(
        investorBefore.balanceSatang + fixture.amountSatang,
    );

    expect(escrowAfter.balanceSatang).toBe(
        escrowBefore.balanceSatang - fixture.amountSatang,
    );

    const refunds = await prisma.investmentRefund.findMany({
        where: { investmentId: investment.id },
    });

    expect(refunds).toHaveLength(1);
    });
  
    it("rejects a refund when the investor wallet is inactive", async () => {
        const investment = await fundAndContribute();
        await cancelLoan();
        const approval = await approveRefund();

        const investorWallet = await getInvestorWallet();
        const escrowBefore = await getEscrowWallet();

        await prisma.wallet.update({
            where: { id: investorWallet.id },
            data: { status: "CLOSED" },
        });

        await expect(
            postInvestorRefund({
            investmentId: investment.id,
            approvalAuditLogId: approval.id,
            idempotencyKey: `refund-inactive-investor-${fixture.idempotencyKey}`,
            }),
        ).rejects.toThrow();

        const investorAfter = await getInvestorWallet();
        const escrowAfter = await getEscrowWallet();

        expect(investorAfter.balanceSatang).toBe(investorWallet.balanceSatang);
        expect(escrowAfter.balanceSatang).toBe(escrowBefore.balanceSatang);

        expect(
            await prisma.investmentRefund.count({
            where: { investmentId: investment.id },
            }),
        ).toBe(0);
        });

    it("rejects a refund when the escrow wallet is inactive", async () => {
        const investment = await fundAndContribute();
        await cancelLoan();
        const approval = await approveRefund();

        const investorBefore = await getInvestorWallet();
        const escrowWallet = await getEscrowWallet();

        await prisma.wallet.update({
            where: { id: escrowWallet.id },
            data: { status: "CLOSED" },
        });

        await expect(
            postInvestorRefund({
            investmentId: investment.id,
            approvalAuditLogId: approval.id,
            idempotencyKey: `refund-inactive-escrow-${fixture.idempotencyKey}`,
            }),
        ).rejects.toThrow();

        const investorAfter = await getInvestorWallet();
        const escrowAfter = await getEscrowWallet();

        expect(investorAfter.balanceSatang).toBe(investorBefore.balanceSatang);
        expect(escrowAfter.balanceSatang).toBe(escrowWallet.balanceSatang);

        expect(
            await prisma.investmentRefund.count({
            where: { investmentId: investment.id },
            }),
        ).toBe(0);
        });
    
    it("rejects a refund request made by a non-administrator", async () => {
        await expect(
            requestLoanRefund({
            requestedByUserId: fixture.investorUser.id,
            loanId: fixture.loan.id,
            reason: "Investor attempted to request an administrative refund",
            }),
        ).rejects.toThrow();

        const requests = await prisma.auditLog.count({
            where: {
            actorUserId: fixture.investorUser.id,
            action: "LOAN_REFUND_REQUESTED",
            targetId: fixture.loan.id,
            },
        });

        expect(requests).toBe(0);
        });

    it("refunds two investors separately for the same cancelled loan", async () => {
        // 1. Create contributions from two investors for the same loan.
        const firstInvestment = await fundAndContribute();

        const secondInvestor = await createAdditionalInvestorForLoan({
            loanId: fixture.loan.id,
            administratorUserId,
            amountSatang: 75_000n,
        });

        await postInvestorContribution({
            userId: secondInvestor.investorUser.id,
            loanId: fixture.loan.id,
            amountSatang: secondInvestor.amountSatang,
            idempotencyKey: secondInvestor.idempotencyKey,
        });

        const secondInvestment =
            await prisma.investment.findUniqueOrThrow({
                where: {
                    investorProfileId_loanId: {
                        investorProfileId: secondInvestor.investorProfile.id,
                        loanId: fixture.loan.id,
                    },
                },
            });

        expect(firstInvestment.id).toBeDefined();
        expect(secondInvestment.id).toBeDefined();

        // 2. Cancel the loan and approve its refund request.
        await cancelLoan();

        const approval = await approveRefund();

        // 3. Refund each investor separately.
        const firstRefund = await postInvestorRefund({
            investmentId: firstInvestment.id,
            approvalAuditLogId: approval.id,
            idempotencyKey: `refund-first-${fixture.idempotencyKey}`,
        });

        const secondRefund = await postInvestorRefund({
            investmentId: secondInvestment.id,
            approvalAuditLogId: approval.id,
            idempotencyKey: `refund-second-${secondInvestor.idempotencyKey}`,
        });

        expect(firstRefund).toBeDefined();
        expect(secondRefund).toBeDefined();

        // 4. Load both investor wallets and the loan's escrow account.
        const firstWallet = await prisma.wallet.findUniqueOrThrow({
            where: { ownerUserId: fixture.investorUser.id },
        });

        const secondWallet = await prisma.wallet.findUniqueOrThrow({
            where: { ownerUserId: secondInvestor.investorUser.id },
        });

        const escrowAccount = await prisma.escrowAccount.findUniqueOrThrow({
            where: { loanId: fixture.loan.id },
        });

        const escrowWallet = await prisma.wallet.findUniqueOrThrow({
            where: { id: escrowAccount.platformWalletId },
        });

        // 5. Verify the refund amounts and wallet projections.
        expect(firstWallet.balanceSatang).toBe(fixture.amountSatang);
        expect(secondWallet.balanceSatang).toBe(secondInvestor.amountSatang);
        expect(escrowAccount.heldSatang).toBe(0n);

        // The shared escrow wallet can hold funds for other loans.
        // Its balance must equal all escrow subledger balances attached to it.
        const totalEscrowHeld = await prisma.escrowAccount.aggregate({
            where: {
                platformWalletId: escrowWallet.id,
            },
            _sum: {
                heldSatang: true,
            },
        });

        expect(escrowWallet.balanceSatang).toBe(
            totalEscrowHeld._sum.heldSatang ?? 0n,
        );

        // 6. Verify that exactly two refund movements were recorded.
        const refundMovements = await prisma.escrowTransaction.findMany({
            where: {
                escrowAccountId: escrowAccount.id,
                type: "REFUND",
            },
        });

        expect(refundMovements).toHaveLength(2);

        expect(
            refundMovements.reduce(
                (total, movement) => total + movement.amountSatang,
                0n,
            ),
        ).toBe(fixture.amountSatang + secondInvestor.amountSatang);

        // 7. Verify each refund's posted ledger transaction and both entries.
        const investorWalletIds = new Set([
            firstWallet.id,
            secondWallet.id,
        ]);

        const creditedWalletIds = new Set<string>();

        for (const movement of refundMovements) {
            const transaction =
                await prisma.ledgerTransaction.findUniqueOrThrow({
                    where: {
                        id: movement.ledgerTransactionId,
                    },
                    include: {
                        entries: true,
                    },
                });

            expect(transaction.status).toBe("POSTED");
            expect(transaction.postedAt).not.toBeNull();
            expect(transaction.entries).toHaveLength(2);

            const debit = transaction.entries.find(
                (entry) => entry.entryType === "DEBIT",
            );

            const credit = transaction.entries.find(
                (entry) => entry.entryType === "CREDIT",
            );

            expect(debit).toBeDefined();
            expect(credit).toBeDefined();

            // Refund accounting: debit escrow, credit the investor.
            expect(debit!.walletId).toBe(escrowAccount.platformWalletId);

            expect(credit!.walletId).not.toBeNull();
            expect(investorWalletIds.has(credit!.walletId!)).toBe(true);

            expect(debit!.amountSatang).toBe(movement.amountSatang);
            expect(credit!.amountSatang).toBe(movement.amountSatang);

            expect(debit!.platformAccountId).toBeNull();
            expect(credit!.platformAccountId).not.toBeNull();

            creditedWalletIds.add(credit!.walletId!);
        }

        // Each investor must receive exactly one refund credit.
        expect(creditedWalletIds).toEqual(investorWalletIds);

        // 8. Reconcile each wallet against its posted ledger entries.
        async function expectWalletReconciled(walletId: string) {
            const wallet = await prisma.wallet.findUniqueOrThrow({
                where: { id: walletId },
            });

            const entries = await prisma.ledgerEntry.findMany({
                where: {
                    walletId,
                    ledgerTransaction: {
                        status: "POSTED",
                    },
                },
            });

            const totalDebits = entries
                .filter((entry) => entry.entryType === "DEBIT")
                .reduce(
                    (total, entry) => total + entry.amountSatang,
                    0n,
                );

            const totalCredits = entries
                .filter((entry) => entry.entryType === "CREDIT")
                .reduce(
                    (total, entry) => total + entry.amountSatang,
                    0n,
                );

            expect(wallet.balanceSatang).toBe(
                totalCredits - totalDebits,
            );
        }

        await expectWalletReconciled(firstWallet.id);
        await expectWalletReconciled(secondWallet.id);
        await expectWalletReconciled(escrowWallet.id);
    });

    it("allows only one concurrent approval for the same refund request", async () => {
        await cancelLoan();

        const request = await requestLoanRefund({
            requestedByUserId: administratorUserId,
            loanId: fixture.loan.id,
            reason: "Concurrent approval test",
        });

        const approvalAttempts = await Promise.allSettled([
            approveLoanRefund({
            approvedByUserId: administratorUserId,
            requestAuditLogId: request.id,
            reason: "Concurrent approval attempt A",
            }),
            approveLoanRefund({
            approvedByUserId: administratorUserId,
            requestAuditLogId: request.id,
            reason: "Concurrent approval attempt B",
            }),
        ]);

        const fulfilled = approvalAttempts.filter(
            (result) => result.status === "fulfilled",
        );

        const rejected = approvalAttempts.filter(
            (result) => result.status === "rejected",
        );

        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        const failedAttempt = rejected[0];

        if (failedAttempt.status === "rejected") {
            expect(failedAttempt.reason).toMatchObject({
            code: "REFUND_ALREADY_APPROVED",
            });
        }

        const approvals = await prisma.auditLog.findMany({
            where: {
            action: "LOAN_REFUND_APPROVED",
            targetType: "LOAN",
            targetId: fixture.loan.id,
            outcome: "SUCCESS",
            },
        });

        const approvalsForRequest = approvals.filter((approval) => {
            const values = approval.newValues;

            return (
            typeof values === "object" &&
            values !== null &&
            !Array.isArray(values) &&
            "requestAuditLogId" in values &&
            values.requestAuditLogId === request.id
            );
        });

        expect(approvalsForRequest).toHaveLength(1);
        });
});
