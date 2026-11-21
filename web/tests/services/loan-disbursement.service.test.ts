
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { prisma } from "../../src/lib/prisma";

import { postOpeningBalance } from "../../src/lib/services/opening-balance.service";
import { postInvestorContribution } from "../../src/lib/services/investor-contribution.service";

import {
  requestLoanDisbursement,
  approveLoanDisbursement,
} from "../../src/lib/services/loan-disbursement-approval.service";

import {
  postLoanDisbursement,
} from "../../src/lib/services/loan-disbursement.service";

import {
  createInvestorContributionFixture,
  createOpeningBalanceAdministrator,
} from "../fixtures/investor-contribution.fixture";

describe("Loan Disbursement integration", () => {
  let administratorUserId: string;
  let originalSourceAccountStatus: "ACTIVE" | "INACTIVE";
  let originalEscrowAccountStatus: "ACTIVE" | "INACTIVE";
  let originalEscrowWalletStatus: "ACTIVE" | "CLOSED"| "RESTRICTED";

  let fixture: Awaited<
    ReturnType<typeof createInvestorContributionFixture>
  >;

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

    const escrowAccountStatus = await prisma.platformAccount.findUniqueOrThrow({
        where: { accountCode: "2200" },
        select: { status: true },
        });

        const escrowWalletStatus = await prisma.wallet.findUniqueOrThrow({
        where: { id: fixture.escrowAccount.platformWalletId },
        select: { status: true },
        });

        originalEscrowAccountStatus = escrowAccountStatus.status;
        originalEscrowWalletStatus = escrowWalletStatus.status;

        await prisma.platformAccount.update({
        where: { accountCode: "2200" },
        data: { status: "ACTIVE" },
        });

        await prisma.wallet.update({
        where: { id: fixture.escrowAccount.platformWalletId },
        data: { status: "ACTIVE" },
        });
  });
  

  afterEach(async () => {
    await prisma.platformAccount.update({
      where: { accountCode: "1300" },
      data: { status: originalSourceAccountStatus },
    });

    await prisma.wallet.update({
        where: { id: fixture.escrowAccount.platformWalletId },
        data: { status: originalEscrowWalletStatus },
        });

        await prisma.platformAccount.update({
        where: { accountCode: "2200" },
        data: { status: originalEscrowAccountStatus },
        });
  });

  afterAll(async () => {
    // Preserve the project's existing administrator cleanup convention.
  });

  async function createBorrowerWallet() {
    return prisma.wallet.create({
      data: {
        ownerUserId: fixture.borrowerUser.id,
        balanceSatang: 0n,
        currency: "THB",
        status: "ACTIVE",
      },
    });
  }

  async function fundLoan(amountSatang: bigint) {
    await postOpeningBalance({
      administratorUserId,
      walletId: fixture.investorWallet.id,
      amountSatang,
      idempotencyKey: `opening-${fixture.idempotencyKey}`,
      reason: "Test investor opening balance",
    });

    return postInvestorContribution({
      userId: fixture.investorUser.id,
      loanId: fixture.loan.id,
      amountSatang,
      idempotencyKey: fixture.idempotencyKey,
    });
  }

  async function createApprovedDisbursement() {
    const borrowerWallet = await createBorrowerWallet();

    await fundLoan(fixture.loan.principalSatang);

    const request = await requestLoanDisbursement({
      requesterUserId: administratorUserId,
      loanId: fixture.loan.id,
      reason: "Request loan disbursement for integration testing",
    });

    const approval = await approveLoanDisbursement({
      approverUserId: administratorUserId,
      requestAuditLogId: request.id,
      reason: "Approve loan disbursement for integration testing",
    });

    return {
      borrowerWallet,
      request,
      approval,
    };
  }

  async function getEscrowWallet() {
    return prisma.wallet.findUniqueOrThrow({
      where: {
        id: fixture.escrowAccount.platformWalletId,
      },
    });
  }

  async function getBorrowerWallet() {
    return prisma.wallet.findUniqueOrThrow({
      where: {
        ownerUserId: fixture.borrowerUser.id,
      },
    });
  }

  async function getLedgerEntries(ledgerTransactionId: string) {
    return prisma.ledgerEntry.findMany({
      where: { ledgerTransactionId },
    });
  }

  describe("Successful disbursement", () => {
    it("transfers the fully funded loan amount to the borrower wallet", async () => {
      const { borrowerWallet } = await createApprovedDisbursement();

      const escrowBefore = await getEscrowWallet();
      const borrowerBefore = await getBorrowerWallet();

      const result = await postLoanDisbursement({
        loanId: fixture.loan.id,
        approvalAuditLogId: (
          await prisma.auditLog.findFirstOrThrow({
            where: {
              action: "LOAN_DISBURSEMENT_APPROVED",
              targetId: fixture.loan.id,
            },
            orderBy: { createdAt: "desc" },
          })
        ).id,
        idempotencyKey: `disbursement-${fixture.idempotencyKey}`,
      });

      const escrowAfter = await getEscrowWallet();
      const borrowerAfter = await getBorrowerWallet();

      const entries = await prisma.ledgerEntry.findMany({
        where: { ledgerTransactionId: result.id },
        });

        expect(entries).toHaveLength(2);
        expect(entries.every(
        (entry) => entry.amountSatang === fixture.loan.principalSatang,
        )).toBe(true);
            expect(result.referenceId).toBe(fixture.loan.id);

      const updatedLoan = await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.loan.id },
        });

        expect(updatedLoan.disbursedAt).not.toBeNull();
        expect(updatedLoan.status).toBe("ACTIVE");

      expect(result.referenceType).toBe("LOAN");
      expect(result.status).toBe("POSTED");
      expect(result.postedAt).not.toBeNull();
      
      expect(escrowAfter.balanceSatang).toBe(
        escrowBefore.balanceSatang - fixture.loan.principalSatang,
      );

      expect(borrowerAfter.balanceSatang).toBe(
        borrowerBefore.balanceSatang + fixture.loan.principalSatang,
      );

      expect(borrowerAfter.id).toBe(borrowerWallet.id);
      const loanAfter = await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.loan.id },
        });

        expect(loanAfter.status).toBe("ACTIVE");
        expect(loanAfter.disbursedAt).not.toBeNull();
        });

    it("creates exactly two balanced ledger entries in the correct direction", async () => {
      const { approval } = await createApprovedDisbursement();

      const result = await postLoanDisbursement({
        loanId: fixture.loan.id,
        approvalAuditLogId: approval.id,
        idempotencyKey: `disbursement-${fixture.idempotencyKey}`,
      });

      const entries = await getLedgerEntries(result.id);

      expect(entries).toHaveLength(2);

      const debit = entries.find(
        (entry) => entry.entryType === "DEBIT",
      );

      const credit = entries.find(
        (entry) => entry.entryType === "CREDIT",
      );

      expect(debit).toBeDefined();
      expect(credit).toBeDefined();

      expect(debit!.walletId).toBe(fixture.escrowWallet.id);
      expect(credit!.walletId).toBe(
        (await getBorrowerWallet()).id,
      );

      expect(debit!.amountSatang).toBe(fixture.loan.principalSatang);
      expect(credit!.amountSatang).toBe(fixture.loan.principalSatang);

      expect(debit!.currency).toBe("THB");
      expect(credit!.currency).toBe("THB");

      const ledger = await prisma.ledgerTransaction.findUniqueOrThrow({
        where: { id: result.id },
      });

      expect(ledger.status).toBe("POSTED");
      expect(ledger.idempotencyKey).toBe(
        `disbursement-${fixture.idempotencyKey}`,
      );
    });

    it("records the escrow disbursement and reduces held funds", async () => {
      const { approval } = await createApprovedDisbursement();

      const escrowBefore = await prisma.escrowAccount.findUniqueOrThrow({
        where: { id: fixture.escrowAccount.id },
      });

      const result = await postLoanDisbursement({
        loanId: fixture.loan.id,
        approvalAuditLogId: approval.id,
        idempotencyKey: `disbursement-${fixture.idempotencyKey}`,
      });

      const escrowAfter = await prisma.escrowAccount.findUniqueOrThrow({
        where: { id: fixture.escrowAccount.id },
      });

      expect(escrowAfter.heldSatang).toBe(
        escrowBefore.heldSatang - fixture.loan.principalSatang,
      );

      expect(escrowAfter.heldSatang).toBe(0n);

      const movements = await prisma.escrowTransaction.findMany({
        where: {
          escrowAccountId: fixture.escrowAccount.id,
          type: "DISBURSEMENT",
        },
      });

      expect(movements).toHaveLength(1);
      expect(movements[0].amountSatang).toBe(
        fixture.loan.principalSatang,
      );
      expect(movements[0].ledgerTransactionId).toBe(
        result.id,
      );
    });

    it("transitions the loan from FUNDED to ACTIVE and records its history", async () => {
      const { approval } = await createApprovedDisbursement();

      const result = await postLoanDisbursement({
        loanId: fixture.loan.id,
        approvalAuditLogId: approval.id,
        idempotencyKey: `disbursement-${fixture.idempotencyKey}`,
      });

      const loan = await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.loan.id },
      });

      expect(loan.status).toBe("ACTIVE");
      const updatedLoan = await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.loan.id },
        });

        expect(updatedLoan.disbursedAt).not.toBeNull();
        expect(updatedLoan.status).toBe("ACTIVE");

      const history = await prisma.loanStatusHistory.findMany({
        where: {
          loanId: fixture.loan.id,
          previousStatus: "FUNDED",
          newStatus: "ACTIVE",
        },
      });

      expect(history).toHaveLength(1);
      expect(history[0].changedByUserId).toBe(administratorUserId);
    });
  });

  describe("Approval and eligibility", () => {
    it("rejects disbursement without administrator approval", async () => {
      await createBorrowerWallet();
      await fundLoan(fixture.loan.principalSatang);

      const request = await requestLoanDisbursement({
        requesterUserId: administratorUserId,
        loanId: fixture.loan.id,
        reason: "Test unapproved disbursement",
      });

      await expect(
        postLoanDisbursement({
          loanId: fixture.loan.id,
          approvalAuditLogId: request.id,
          idempotencyKey: `unapproved-${fixture.idempotencyKey}`,
        }),
      ).rejects.toBeDefined();

      const loan = await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.loan.id },
      });

      expect(loan.status).toBe("FUNDED");
      expect(loan.disbursedAt).toBeNull();
    });

    it("rejects an underfunded loan", async () => {
      await createBorrowerWallet();

      await fundLoan(fixture.amountSatang);

      await expect(
        requestLoanDisbursement({
          requesterUserId: administratorUserId,
          loanId: fixture.loan.id,
          reason: "Attempt to disburse an underfunded loan",
        }),
      ).rejects.toBeDefined();

      const loan = await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.loan.id },
      });

      expect(loan.status).not.toBe("FUNDED");
      expect(loan.fundedSatang).toBe(fixture.amountSatang);
      expect(loan.disbursedAt).toBeNull();
    });

    it("rejects a second disbursement using a different idempotency key", async () => {
      const { approval } = await createApprovedDisbursement();

      await postLoanDisbursement({
        loanId: fixture.loan.id,
        approvalAuditLogId: approval.id,
        idempotencyKey: `disbursement-first-${fixture.idempotencyKey}`,
      });

      await expect(
        postLoanDisbursement({
          loanId: fixture.loan.id,
          approvalAuditLogId: approval.id,
          idempotencyKey: `disbursement-second-${fixture.idempotencyKey}`,
        }),
      ).rejects.toBeDefined();

      const movements = await prisma.escrowTransaction.findMany({
        where: {
          escrowAccountId: fixture.escrowAccount.id,
          type: "DISBURSEMENT",
        },
      });

      expect(movements).toHaveLength(1);
    });
  });

  describe("Idempotency and concurrency", () => {
    it("returns the original posting when the same request is retried", async () => {
      const { approval } = await createApprovedDisbursement();

      const idempotencyKey = `disbursement-${fixture.idempotencyKey}`;

      const first = await postLoanDisbursement({
        loanId: fixture.loan.id,
        approvalAuditLogId: approval.id,
        idempotencyKey,
      });

      const borrowerBeforeRetry = await getBorrowerWallet();
      const escrowBeforeRetry = await getEscrowWallet();

      const second = await postLoanDisbursement({
        loanId: fixture.loan.id,
        approvalAuditLogId: approval.id,
        idempotencyKey,
      });

      expect(second.id).toBe(first.id);

      const borrowerAfterRetry = await getBorrowerWallet();
      const escrowAfterRetry = await getEscrowWallet();

      expect(borrowerAfterRetry.balanceSatang).toBe(
        borrowerBeforeRetry.balanceSatang,
      );

      expect(escrowAfterRetry.balanceSatang).toBe(
        escrowBeforeRetry.balanceSatang,
      );

      const movements = await prisma.escrowTransaction.findMany({
        where: {
          escrowAccountId: fixture.escrowAccount.id,
          type: "DISBURSEMENT",
        },
      });

      expect(movements).toHaveLength(1);
    });

    it("does not double-disburse when the same request runs concurrently", async () => {
      const { approval } = await createApprovedDisbursement();

      const idempotencyKey = `concurrent-${fixture.idempotencyKey}`;

      const [first, second] = await Promise.all([
        postLoanDisbursement({
          loanId: fixture.loan.id,
          approvalAuditLogId: approval.id,
          idempotencyKey,
        }),
        postLoanDisbursement({
          loanId: fixture.loan.id,
          approvalAuditLogId: approval.id,
          idempotencyKey,
        }),
      ]);

      expect(first.id).toBe(second.id);

      const movements = await prisma.escrowTransaction.findMany({
        where: {
          escrowAccountId: fixture.escrowAccount.id,
          type: "DISBURSEMENT",
        },
      });

      expect(movements).toHaveLength(1);

      const entries = await getLedgerEntries(first.id);
      expect(entries).toHaveLength(2);

      const loan = await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.loan.id },
      });

      expect(loan.status).toBe("ACTIVE");
      expect(loan.disbursedAt).not.toBeNull();
    });
  });
});
