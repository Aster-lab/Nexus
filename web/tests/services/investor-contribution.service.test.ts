import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma";
import { postOpeningBalance } from "../../src/lib/services/opening-balance.service";
import { postInvestorContribution } from "../../src/lib/services/investor-contribution.service";

import {
  createInvestorContributionFixture,
} from "../fixtures/investor-contribution.fixture";

import { createOpeningBalanceAdministrator } from "../fixtures/investor-contribution.fixture";

describe("Opening Balance + Investor Contribution integration", () => {
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
      where: {
        accountCode: "1300",
      },
      data: {
        status: originalSourceAccountStatus,
      },
    });
  });

  afterAll(async () => {
  });

  async function getInvestorWallet() {
    return prisma.wallet.findUniqueOrThrow({
      where: {
        ownerUserId: fixture.investorUser.id,
      },
    });
  }

  async function getEscrowWallet() {
    return prisma.wallet.findUniqueOrThrow({
      where: {
        id: fixture.escrowAccount.platformWalletId,
      },
    });
  }

  async function fundInvestorWallet(
    amountSatang: bigint = fixture.amountSatang,
  ) {
    const wallet = await getInvestorWallet();

    return postOpeningBalance({
      administratorUserId,
      walletId: wallet.id,
      amountSatang,
      idempotencyKey: `opening-${fixture.idempotencyKey}`,
      reason: "Automated test opening balance",
    });
  }

  async function getLedgerEntries(ledgerTransactionId: string) {
    return prisma.ledgerEntry.findMany({
      where: { ledgerTransactionId },
    });
  }

  function expectBalancedLedger(
    entries: Awaited<ReturnType<typeof getLedgerEntries>>,
    amountSatang: bigint,
  ) {
    expect(entries).toHaveLength(2);

    const debit = entries.find((entry) => entry.entryType === "DEBIT");
    const credit = entries.find((entry) => entry.entryType === "CREDIT");

    expect(debit).toBeDefined();
    expect(credit).toBeDefined();

    expect(debit!.amountSatang).toBe(amountSatang);
    expect(credit!.amountSatang).toBe(amountSatang);
  }

  describe("Opening Balance", () => {
    it("starts with a zero wallet balance", async () => {
      const wallet = await getInvestorWallet();

      expect(wallet.balanceSatang).toBe(0n);
    });

    it("posts an opening balance and updates the investor wallet", async () => {
      const walletBefore = await getInvestorWallet();

      expect(walletBefore.balanceSatang).toBe(0n);

      await fundInvestorWallet();

      const walletAfter = await getInvestorWallet();

      expect(walletAfter.balanceSatang).toBe(fixture.amountSatang);

      const openingBalance = await prisma.openingBalance.findFirstOrThrow({
        where: { walletId: walletBefore.id },
      });

      expect(openingBalance.amountSatang).toBe(fixture.amountSatang);
    });

    it("creates a balanced ledger transaction for the opening balance", async () => {
      await fundInvestorWallet();

      const openingBalance = await prisma.openingBalance.findFirstOrThrow({
        where: {
          walletId: (await getInvestorWallet()).id,
        },
      });

      const entries = await getLedgerEntries(
        openingBalance.ledgerTransactionId,
      );

      expectBalancedLedger(entries, fixture.amountSatang);
    });

    it("does not fund the wallet twice for the same opening-balance request", async () => {
      await fundInvestorWallet();

      const walletBeforeRetry = await getInvestorWallet();

      await expect(
        postOpeningBalance({
          administratorUserId,
          walletId: walletBeforeRetry.id,
          amountSatang: fixture.amountSatang,
          idempotencyKey: `opening-${fixture.idempotencyKey}`,
          reason: "Automated test opening balance",
        }),
      ).resolves.toBeDefined();

      const walletAfterRetry = await getInvestorWallet();

      expect(walletAfterRetry.balanceSatang).toBe(fixture.amountSatang);

      const openingBalances = await prisma.openingBalance.findMany({
        where: { walletId: walletBeforeRetry.id },
      });

      expect(openingBalances).toHaveLength(1);
    });

    it("does not create a second opening balance for an already-funded wallet", async () => {
      await fundInvestorWallet();

      const wallet = await getInvestorWallet();

      await expect(
        postOpeningBalance({
          administratorUserId,
          walletId: wallet.id,
          amountSatang: fixture.amountSatang,
          idempotencyKey: `opening-second-${fixture.idempotencyKey}`,
          reason: "Attempted second opening balance",
        }),
      ).rejects.toBeDefined();

      const updatedWallet = await getInvestorWallet();

      expect(updatedWallet.balanceSatang).toBe(fixture.amountSatang);

      const openingBalances = await prisma.openingBalance.findMany({
        where: { walletId: wallet.id },
      });

      expect(openingBalances).toHaveLength(1);
    });
  });

  describe("Investor Contribution", () => {
    it("debits the investor wallet and credits the escrow wallet", async () => {
      await fundInvestorWallet();

      const investorWalletBefore = await getInvestorWallet();
      const escrowWalletBefore = await getEscrowWallet();

      await postInvestorContribution({
        userId: fixture.investorUser.id,
        loanId: fixture.loan.id,
        amountSatang: fixture.amountSatang,
        idempotencyKey: fixture.idempotencyKey,
      });

      const investorWalletAfter = await getInvestorWallet();
      const escrowWalletAfter = await getEscrowWallet();

      expect(investorWalletAfter.balanceSatang).toBe(
        investorWalletBefore.balanceSatang - fixture.amountSatang,
      );

      expect(escrowWalletAfter.balanceSatang).toBe(
        escrowWalletBefore.balanceSatang + fixture.amountSatang,
      );
    });

    it("creates a balanced ledger transaction for the contribution", async () => {
      await fundInvestorWallet();

      await postInvestorContribution({
        userId: fixture.investorUser.id,
        loanId: fixture.loan.id,
        amountSatang: fixture.amountSatang,
        idempotencyKey: fixture.idempotencyKey,
      });

      const contribution =
        await prisma.investmentContribution.findFirstOrThrow({
          where: {
            idempotencyKey: fixture.idempotencyKey,
          },
        });

      const entries = await getLedgerEntries(
        contribution.ledgerTransactionId,
      );

      expectBalancedLedger(entries, fixture.amountSatang);

      const investorWallet = await getInvestorWallet();
      const escrowWallet = await getEscrowWallet();

      expect(
        entries.some((entry) => entry.walletId === investorWallet.id),
      ).toBe(true);

      expect(
        entries.some((entry) => entry.walletId === escrowWallet.id),
      ).toBe(true);

      await expect(prisma.notification.findFirst({ where: { userId: fixture.investorUser.id, category: "INVESTMENT", actionPath: "/investor/portfolio" } }))
        .resolves.toMatchObject({ status: "UNREAD", title: "Investment contribution confirmed" });
    });

    it("updates the loan funded amount and escrow held amount", async () => {
      await fundInvestorWallet();

      const loanBefore = await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.loan.id },
      });

      const escrowBefore = await prisma.escrowAccount.findUniqueOrThrow({
        where: { id: fixture.escrowAccount.id },
      });

      await postInvestorContribution({
        userId: fixture.investorUser.id,
        loanId: fixture.loan.id,
        amountSatang: fixture.amountSatang,
        idempotencyKey: fixture.idempotencyKey,
      });

      const loanAfter = await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.loan.id },
      });

      const escrowAfter = await prisma.escrowAccount.findUniqueOrThrow({
        where: { id: fixture.escrowAccount.id },
      });

      expect(loanAfter.fundedSatang).toBe(
        loanBefore.fundedSatang + fixture.amountSatang,
      );

      expect(escrowAfter.heldSatang).toBe(
        escrowBefore.heldSatang + fixture.amountSatang,
      );
    });

    it("does not process the same contribution twice", async () => {
      await fundInvestorWallet();

      await postInvestorContribution({
        userId: fixture.investorUser.id,
        loanId: fixture.loan.id,
        amountSatang: fixture.amountSatang,
        idempotencyKey: fixture.idempotencyKey,
      });

      const investorWalletBeforeRetry = await getInvestorWallet();
      const escrowWalletBeforeRetry = await getEscrowWallet();

      await expect(
        postInvestorContribution({
          userId: fixture.investorUser.id,
          loanId: fixture.loan.id,
          amountSatang: fixture.amountSatang,
          idempotencyKey: fixture.idempotencyKey,
        }),
      ).resolves.toBeDefined();

      const investorWalletAfterRetry = await getInvestorWallet();
      const escrowWalletAfterRetry = await getEscrowWallet();

      expect(investorWalletAfterRetry.balanceSatang).toBe(
        investorWalletBeforeRetry.balanceSatang,
      );

      expect(escrowWalletAfterRetry.balanceSatang).toBe(
        escrowWalletBeforeRetry.balanceSatang,
      );

      const contributions =
        await prisma.investmentContribution.findMany({
          where: {
            idempotencyKey: fixture.idempotencyKey,
          },
        });

      expect(contributions).toHaveLength(1);
    });
     it("rejects a contribution when the investor has insufficient funds", async () => {
      const openingAmount = fixture.amountSatang - 1n;

      await fundInvestorWallet(openingAmount);

      const investorWalletBefore = await getInvestorWallet();
      const escrowWalletBefore = await getEscrowWallet();

      const loanBefore = await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.loan.id },
      });

      const escrowBefore = await prisma.escrowAccount.findUniqueOrThrow({
        where: { id: fixture.escrowAccount.id },
      });

      await expect(
        postInvestorContribution({
          userId: fixture.investorUser.id,
          loanId: fixture.loan.id,
          amountSatang: fixture.amountSatang,
          idempotencyKey: fixture.idempotencyKey,
        }),
      ).rejects.toBeDefined();

      const investorWalletAfter = await getInvestorWallet();
      const escrowWalletAfter = await getEscrowWallet();

      const loanAfter = await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.loan.id },
      });

      const escrowAfter = await prisma.escrowAccount.findUniqueOrThrow({
        where: { id: fixture.escrowAccount.id },
      });

      expect(investorWalletAfter.balanceSatang).toBe(
        investorWalletBefore.balanceSatang,
      );

      expect(escrowWalletAfter.balanceSatang).toBe(
        escrowWalletBefore.balanceSatang,
      );

      expect(loanAfter.fundedSatang).toBe(loanBefore.fundedSatang);
      expect(escrowAfter.heldSatang).toBe(escrowBefore.heldSatang);

      const contributions = await prisma.investmentContribution.findMany({
        where: { idempotencyKey: fixture.idempotencyKey },
      });

      expect(contributions).toHaveLength(0);
    });

    it("rejects a zero-value contribution", async () => {
      await fundInvestorWallet();

      await expect(
        postInvestorContribution({
          userId: fixture.investorUser.id,
          loanId: fixture.loan.id,
          amountSatang: 0n,
          idempotencyKey: fixture.idempotencyKey,
        }),
      ).rejects.toBeDefined();

      const investorWallet = await getInvestorWallet();

      expect(investorWallet.balanceSatang).toBe(fixture.amountSatang);

      const contributions = await prisma.investmentContribution.findMany({
        where: { idempotencyKey: fixture.idempotencyKey },
      });

      expect(contributions).toHaveLength(0);
    });

    it("rejects reuse of an idempotency key with a different amount", async () => {
      const firstAmount = fixture.amountSatang / 2n;
      const retryAmount = firstAmount + 1n;

      await fundInvestorWallet(fixture.amountSatang + 2n);

      await postInvestorContribution({
        userId: fixture.investorUser.id,
        loanId: fixture.loan.id,
        amountSatang: firstAmount,
        idempotencyKey: fixture.idempotencyKey,
      });

      const investorWalletBeforeRetry = await getInvestorWallet();
      const escrowWalletBeforeRetry = await getEscrowWallet();

      await expect(
        postInvestorContribution({
          userId: fixture.investorUser.id,
          loanId: fixture.loan.id,
          amountSatang: retryAmount,
          idempotencyKey: fixture.idempotencyKey,
        }),
      ).rejects.toBeDefined();

      const investorWalletAfterRetry = await getInvestorWallet();
      const escrowWalletAfterRetry = await getEscrowWallet();

      expect(investorWalletAfterRetry.balanceSatang).toBe(
        investorWalletBeforeRetry.balanceSatang,
      );

      expect(escrowWalletAfterRetry.balanceSatang).toBe(
        escrowWalletBeforeRetry.balanceSatang,
      );

      const contributions = await prisma.investmentContribution.findMany({
        where: { idempotencyKey: fixture.idempotencyKey },
      });

      expect(contributions).toHaveLength(1);
      expect(contributions[0].amountSatang).toBe(firstAmount);
    });


    it("rejects a contribution that exceeds the loan's remaining funding requirement", async () => {
      const loanBefore = await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.loan.id },
      });

      const remainingSatang =
        loanBefore.principalSatang - loanBefore.fundedSatang;

      expect(remainingSatang).toBeGreaterThan(0n);

      const contributionAmount = remainingSatang + 1n;

      await fundInvestorWallet(contributionAmount);

      const investorWalletBefore = await getInvestorWallet();
      const escrowWalletBefore = await getEscrowWallet();

      const escrowBefore = await prisma.escrowAccount.findUniqueOrThrow({
        where: { id: fixture.escrowAccount.id },
      });

      await expect(
        postInvestorContribution({
          userId: fixture.investorUser.id,
          loanId: fixture.loan.id,
          amountSatang: contributionAmount,
          idempotencyKey: fixture.idempotencyKey,
        }),
      ).rejects.toBeDefined();

      const investorWalletAfter = await getInvestorWallet();
      const escrowWalletAfter = await getEscrowWallet();

      const loanAfter = await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.loan.id },
      });

      const escrowAfter = await prisma.escrowAccount.findUniqueOrThrow({
        where: { id: fixture.escrowAccount.id },
      });

      expect(investorWalletAfter.balanceSatang).toBe(
        investorWalletBefore.balanceSatang,
      );
      expect(escrowWalletAfter.balanceSatang).toBe(
        escrowWalletBefore.balanceSatang,
      );
      expect(loanAfter.fundedSatang).toBe(loanBefore.fundedSatang);
      expect(escrowAfter.heldSatang).toBe(escrowBefore.heldSatang);

      const contributions = await prisma.investmentContribution.findMany({
        where: { idempotencyKey: fixture.idempotencyKey },
      });

      expect(contributions).toHaveLength(0);
    });

    it("rejects a contribution when the loan is not in FUNDING status", async () => {
      await fundInvestorWallet();

      await prisma.loan.update({
        where: { id: fixture.loan.id },
        data: { status: "CANCELLED" },
      });

      const investorWalletBefore = await getInvestorWallet();
      const escrowWalletBefore = await getEscrowWallet();

      await expect(
        postInvestorContribution({
          userId: fixture.investorUser.id,
          loanId: fixture.loan.id,
          amountSatang: fixture.amountSatang,
          idempotencyKey: fixture.idempotencyKey,
        }),
      ).rejects.toBeDefined();

      const investorWalletAfter = await getInvestorWallet();
      const escrowWalletAfter = await getEscrowWallet();

      expect(investorWalletAfter.balanceSatang).toBe(
        investorWalletBefore.balanceSatang,
      );
      expect(escrowWalletAfter.balanceSatang).toBe(
        escrowWalletBefore.balanceSatang,
      );

      const contributions = await prisma.investmentContribution.findMany({
        where: { idempotencyKey: fixture.idempotencyKey },
      });

      expect(contributions).toHaveLength(0);
    });

    it("rejects a contribution from a restricted investor wallet", async () => {
      await fundInvestorWallet();

      const investorWalletBefore = await getInvestorWallet();
      const escrowWalletBefore = await getEscrowWallet();

      await prisma.wallet.update({
        where: { id: investorWalletBefore.id },
        data: { status: "RESTRICTED" },
      });

      await expect(
        postInvestorContribution({
          userId: fixture.investorUser.id,
          loanId: fixture.loan.id,
          amountSatang: fixture.amountSatang,
          idempotencyKey: fixture.idempotencyKey,
        }),
      ).rejects.toBeDefined();

      const investorWalletAfter = await getInvestorWallet();
      const escrowWalletAfter = await getEscrowWallet();

      expect(investorWalletAfter.balanceSatang).toBe(
        investorWalletBefore.balanceSatang,
      );
      expect(investorWalletAfter.status).toBe("RESTRICTED");

      expect(escrowWalletAfter.balanceSatang).toBe(
        escrowWalletBefore.balanceSatang,
      );

      const contributions = await prisma.investmentContribution.findMany({
        where: { idempotencyKey: fixture.idempotencyKey },
      });

      expect(contributions).toHaveLength(0);
    });

    it("marks the loan and escrow fully funded when a contribution completes funding", async () => {
      const loanBefore = await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.loan.id },
      });

      const remainingSatang =
        loanBefore.principalSatang - loanBefore.fundedSatang;

      expect(remainingSatang).toBeGreaterThan(0n);
      expect(loanBefore.status).toBe("FUNDING");

      await fundInvestorWallet(remainingSatang);

      const investorWalletBefore = await getInvestorWallet();
      const escrowWalletBefore = await getEscrowWallet();

      const escrowBefore = await prisma.escrowAccount.findUniqueOrThrow({
        where: { id: fixture.escrowAccount.id },
      });

      expect(investorWalletBefore.balanceSatang).toBe(remainingSatang);
      expect(escrowBefore.status).toBe("OPEN");

      await postInvestorContribution({
        userId: fixture.investorUser.id,
        loanId: fixture.loan.id,
        amountSatang: remainingSatang,
        idempotencyKey: fixture.idempotencyKey,
      });

      const loanAfter = await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.loan.id },
      });

      const escrowAfter = await prisma.escrowAccount.findUniqueOrThrow({
        where: { id: fixture.escrowAccount.id },
      });

      const investorWalletAfter = await getInvestorWallet();
      const escrowWalletAfter = await getEscrowWallet();

      expect(loanAfter.fundedSatang).toBe(loanAfter.principalSatang);
      expect(loanAfter.status).toBe("FUNDED");

      expect(escrowAfter.heldSatang).toBe(
        escrowBefore.heldSatang + remainingSatang,
      );
      expect(escrowAfter.status).toBe("FULLY_FUNDED");

      await expect(prisma.notification.findFirst({ where: { userId: fixture.borrowerUser.id, category: "LOAN_STATUS", actionPath: "/borrower/loans" } }))
        .resolves.toMatchObject({ status: "UNREAD", title: "Your loan is fully funded" });
      await expect(prisma.notification.findFirst({ where: { userId: fixture.investorUser.id, category: "INVESTMENT", title: "A loan you backed is fully funded" } }))
        .resolves.toMatchObject({ status: "UNREAD", actionPath: "/investor/portfolio" });

      expect(investorWalletAfter.balanceSatang).toBe(0n);
      expect(escrowWalletAfter.balanceSatang).toBe(
        escrowWalletBefore.balanceSatang + remainingSatang,
      );

      const contribution =
        await prisma.investmentContribution.findFirstOrThrow({
          where: { idempotencyKey: fixture.idempotencyKey },
        });

      expect(contribution.amountSatang).toBe(remainingSatang);

      const entries = await getLedgerEntries(
        contribution.ledgerTransactionId,
      );

      expectBalancedLedger(entries, remainingSatang);
    });


  it("processes concurrent requests with the same idempotency key only once", async () => {
    await fundInvestorWallet();

    const investorWalletBefore = await getInvestorWallet();
    const escrowWalletBefore = await getEscrowWallet();

    const contributionInput = {
      userId: fixture.investorUser.id,
      loanId: fixture.loan.id,
      amountSatang: fixture.amountSatang,
      idempotencyKey: fixture.idempotencyKey,
    };

    const results = await Promise.all([
      postInvestorContribution(contributionInput),
      postInvestorContribution(contributionInput),
    ]);

    expect(results).toHaveLength(2);

    const investorWalletAfter = await getInvestorWallet();
    const escrowWalletAfter = await getEscrowWallet();

    expect(investorWalletAfter.balanceSatang).toBe(
      investorWalletBefore.balanceSatang - fixture.amountSatang,
    );

    expect(escrowWalletAfter.balanceSatang).toBe(
      escrowWalletBefore.balanceSatang + fixture.amountSatang,
    );

    const contributions = await prisma.investmentContribution.findMany({
      where: {
        idempotencyKey: fixture.idempotencyKey,
      },
    });

    expect(contributions).toHaveLength(1);

    const loan = await prisma.loan.findUniqueOrThrow({
      where: { id: fixture.loan.id },
    });

    const escrow = await prisma.escrowAccount.findUniqueOrThrow({
      where: { id: fixture.escrowAccount.id },
    });

    expect(loan.fundedSatang).toBe(fixture.amountSatang);
    expect(escrow.heldSatang).toBe(fixture.amountSatang);
  });

  it("prevents concurrent contributions with different idempotency keys from overfunding a loan", async () => {
    const loanBefore = await prisma.loan.findUniqueOrThrow({
      where: { id: fixture.loan.id },
    });

    const remainingSatang =
      loanBefore.principalSatang - loanBefore.fundedSatang;

    const contributionAmount = remainingSatang / 2n + 1n;

    expect(contributionAmount).toBeGreaterThan(0n);
    expect(contributionAmount).toBeLessThanOrEqual(remainingSatang);
    expect(contributionAmount * 2n).toBeGreaterThan(remainingSatang);

    await fundInvestorWallet(contributionAmount * 2n);

    const investorWalletBefore = await getInvestorWallet();
    const escrowWalletBefore = await getEscrowWallet();

    const results = await Promise.allSettled([
      postInvestorContribution({
        userId: fixture.investorUser.id,
        loanId: fixture.loan.id,
        amountSatang: contributionAmount,
        idempotencyKey: `${fixture.idempotencyKey}-race-a`,
      }),
      postInvestorContribution({
        userId: fixture.investorUser.id,
        loanId: fixture.loan.id,
        amountSatang: contributionAmount,
        idempotencyKey: `${fixture.idempotencyKey}-race-b`,
      }),
    ]);

    const fulfilled = results.filter(
      (result) => result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result) => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const investorWalletAfter = await getInvestorWallet();
    const escrowWalletAfter = await getEscrowWallet();

    expect(investorWalletAfter.balanceSatang).toBe(
      investorWalletBefore.balanceSatang - contributionAmount,
    );

    expect(escrowWalletAfter.balanceSatang).toBe(
      escrowWalletBefore.balanceSatang + contributionAmount,
    );

    const loanAfter = await prisma.loan.findUniqueOrThrow({
      where: { id: fixture.loan.id },
    });

    expect(loanAfter.fundedSatang).toBe(
      loanBefore.fundedSatang + contributionAmount,
    );

    const escrowAfter = await prisma.escrowAccount.findUniqueOrThrow({
      where: { id: fixture.escrowAccount.id },
    });

    expect(escrowAfter.heldSatang).toBe(
      fixture.escrowAccount.heldSatang + contributionAmount,
    );

    const contributions = await prisma.investmentContribution.findMany({
      where: {
        idempotencyKey: {
          in: [
            `${fixture.idempotencyKey}-race-a`,
            `${fixture.idempotencyKey}-race-b`,
          ],
        },
      },
    });

    expect(contributions).toHaveLength(1);
    expect(contributions[0].amountSatang).toBe(contributionAmount);
    });

  it("prevents concurrent contributions from spending the same wallet balance twice", async () => {
    const contributionAmount = fixture.amountSatang / 2n;

    expect(contributionAmount).toBeGreaterThan(0n);

    await fundInvestorWallet(contributionAmount);

    const investorWalletBefore = await getInvestorWallet();
    const escrowWalletBefore = await getEscrowWallet();

    const loanBefore = await prisma.loan.findUniqueOrThrow({
      where: { id: fixture.loan.id },
    });

    expect(
      loanBefore.principalSatang - loanBefore.fundedSatang,
    ).toBeGreaterThanOrEqual(contributionAmount * 2n);

    const idempotencyKeys = [
      `${fixture.idempotencyKey}-wallet-race-a`,
      `${fixture.idempotencyKey}-wallet-race-b`,
    ];

    const results = await Promise.allSettled(
      idempotencyKeys.map((idempotencyKey) =>
        postInvestorContribution({
          userId: fixture.investorUser.id,
          loanId: fixture.loan.id,
          amountSatang: contributionAmount,
          idempotencyKey,
        }),
      ),
    );

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);

    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);

    const investorWalletAfter = await getInvestorWallet();
    const escrowWalletAfter = await getEscrowWallet();

    expect(investorWalletAfter.balanceSatang).toBe(
      investorWalletBefore.balanceSatang - contributionAmount,
    );

    expect(investorWalletAfter.balanceSatang).toBeGreaterThanOrEqual(0n);

    expect(escrowWalletAfter.balanceSatang).toBe(
      escrowWalletBefore.balanceSatang + contributionAmount,
    );

    const loanAfter = await prisma.loan.findUniqueOrThrow({
      where: { id: fixture.loan.id },
    });

    expect(loanAfter.fundedSatang).toBe(
      loanBefore.fundedSatang + contributionAmount,
    );

    const contributions = await prisma.investmentContribution.findMany({
      where: {
        idempotencyKey: { in: idempotencyKeys },
      },
    });

    expect(contributions).toHaveLength(1);
    expect(contributions[0].amountSatang).toBe(contributionAmount);
  });

  });

  describe("End-to-end integration", () => {
    it("funds an initially empty wallet before processing an investor contribution", async () => {
      const investorWalletBefore = await getInvestorWallet();
      const escrowWalletBefore = await getEscrowWallet();

      expect(investorWalletBefore.balanceSatang).toBe(0n);

      await fundInvestorWallet();

      const fundedWallet = await getInvestorWallet();

      expect(fundedWallet.balanceSatang).toBe(fixture.amountSatang);

      await postInvestorContribution({
        userId: fixture.investorUser.id,
        loanId: fixture.loan.id,
        amountSatang: fixture.amountSatang,
        idempotencyKey: fixture.idempotencyKey,
      });

      const finalInvestorWallet = await getInvestorWallet();
      const finalEscrowWallet = await getEscrowWallet();

      expect(finalInvestorWallet.balanceSatang).toBe(0n);

      expect(finalEscrowWallet.balanceSatang).toBe(
        escrowWalletBefore.balanceSatang + fixture.amountSatang,
      );

      const openingBalance = await prisma.openingBalance.findFirstOrThrow({
        where: {
          walletId: investorWalletBefore.id,
        },
      });

      const contribution =
        await prisma.investmentContribution.findFirstOrThrow({
          where: {
            idempotencyKey: fixture.idempotencyKey,
          },
        });

      expect(openingBalance.amountSatang).toBe(fixture.amountSatang);
      expect(contribution.amountSatang).toBe(fixture.amountSatang);

      const openingEntries = await getLedgerEntries(
        openingBalance.ledgerTransactionId,
      );

      const contributionEntries = await getLedgerEntries(
        contribution.ledgerTransactionId,
      );

      expectBalancedLedger(openingEntries, fixture.amountSatang);
      expectBalancedLedger(contributionEntries, fixture.amountSatang);
    });
  });
});
