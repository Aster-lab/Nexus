import {randomUUID} from "crypto";
import {postOpeningBalance} from "../../src/lib/services/opening-balance.service";

import {Prisma} from "../../src/generated/prisma/client";
import {prisma} from "../../src/lib/prisma";

const ESCROW_ACCOUNT_CODE = "2200";
const CURRENCY = "THB";

const DEFAULT_AMOUNT =  100_000n;
const DEFAULT_WALLET_BALANCE = 2_000_000n;
const DEFAULT_LOAN_PRINCIPAL = 1_000_000n;

export async function createOpeningBalanceAdministrator({
  }: {
    adminstratorUserId?: string;
  }
) {

  const role = await prisma.role.findUniqueOrThrow({
    where: { code: "ADMIN" },
  });

  const administrator = await prisma.user.create({
    data: {
      email: `opening-balance-admin-${randomUUID()}@example.test`,
      accountStatus: "ACTIVE",
    },
  });

  await prisma.userRole.create({
    data: {
      userId: administrator.id,
      roleId: role.id,
      grantReason: "Investor contribution integration test",
    },
  });

  return administrator;
}

export async function fundInvestorWallet({
  walletId,
  administratorUserId,
  amountSatang = DEFAULT_WALLET_BALANCE,
}: {
  walletId: string;
  administratorUserId: string;
  amountSatang?: bigint;
}) {
  return postOpeningBalance({
    walletId,
    administratorUserId,
    amountSatang,
    idempotencyKey: `test-opening-balance-${randomUUID()}`,
    reason: "Initial simulated balance for integration testing",
  });
}

export async function activateEscrowAccountForTests() {
  const account = await prisma.platformAccount.findUniqueOrThrow({
    where: { accountCode: ESCROW_ACCOUNT_CODE },
    select: { id: true, status: true },
  });
  const wallet = await prisma.wallet.upsert({
    where: { ownerPlatformAccountId: account.id },
    update: {},
    create: { ownerPlatformAccountId: account.id, currency: CURRENCY, balanceSatang: 0n, status: "CLOSED" },
    select: { id: true, status: true },
  });
  await prisma.platformAccount.update({ where: { id: account.id }, data: { status: "ACTIVE" } });
  await prisma.wallet.update({ where: { id: wallet.id }, data: { status: "ACTIVE" } });

  let cleaned = false;
  return {
    accountId: account.id,
    walletId: wallet.id,
    cleanup: async () => {
      if (cleaned) return;
      await prisma.wallet.update({ where: { id: wallet.id }, data: { status: wallet.status } });
      await prisma.platformAccount.update({ where: { id: account.id }, data: { status: account.status } });
      cleaned = true;
    },
  };
}

export async function createInvestorContributionFixture({
  administratorUserId,
}:{
  administratorUserId: string;
}) {

  const suffix = randomUUID();

  const idempotencyKey = `test-contribution-${suffix}`;

  const investorUser = await prisma.user.create({
    data: {
      email: `investor-${suffix}@example.test`,
    },
  });

  const borrowerUser = await prisma.user.create({
    data: {
      email: `borrower-${suffix}@example.test`,
    },
  });

  const investorProfile = await prisma.investorProfile.create({
    data: {
      userId: investorUser.id,
      displayName: `Test Investor ${suffix}`,
    },
  });

  const investorWallet = await prisma.wallet.create({
    data: {
      ownerUserId: investorUser.id,
      balanceSatang: 0n,
      currency: CURRENCY,
      status: "ACTIVE",
    },
  });

  const borrowerProfile = await prisma.borrowerProfile.create({
    data: {
      userId: borrowerUser.id,
      legalName: `Test Borrower ${suffix}`,
      address: {
        country: "Thailand",
        province: "Pathum Thani",
      },
    },
  });

  const application = await prisma.loanApplication.create({
    data: {
      borrowerProfileId: borrowerProfile.id,
    },
  });

  const applicationVersion = await prisma.applicationVersion.create({
    data: {
      applicationId: application.id,
      versionNumber: 1,
      submittedData: {
        schemaVersion: 1,
        testFixture: true,
      },
      requestedPrincipalSatang: DEFAULT_LOAN_PRINCIPAL,
      requestedTermMonths: 3,
      createdByUserId: borrowerUser.id,
    },
  });

  await prisma.loanApplication.update({
    where: { id: application.id },
    data: { currentVersionId: applicationVersion.id },
  });

  const acceptedAt = new Date();

  const offer = await prisma.loanOffer.create({
    data: {
      applicationId: application.id,
      applicationVersionId: applicationVersion.id,
      principalSatang: DEFAULT_LOAN_PRINCIPAL,
      annualInterestRate: new Prisma.Decimal("0.12"),
      termMonths: 3,
      expiresAt: new Date(Date.now() + 86_400_000),
      status: "ACCEPTED",
      acceptedAt,
      createdByUserId: borrowerUser.id,
    },
  });

  const loan = await prisma.loan.create({
    data: {
      borrowerProfileId: borrowerProfile.id,
      applicationId: application.id,
      acceptedOfferId: offer.id,
      principalSatang: DEFAULT_LOAN_PRINCIPAL,
      annualInterestRate: new Prisma.Decimal("0.12"),
      termMonths: 3,
      fundingDeadline: new Date(Date.now() + 86_400_000),
    },
  });

  const platformAccount = await prisma.platformAccount.upsert({
    where: { accountCode: ESCROW_ACCOUNT_CODE },
    update: { status: "ACTIVE" },
    create: {
      accountCode: ESCROW_ACCOUNT_CODE,
      accountName: "Shared Simulated Escrow",
      accountType: "LIABILITY",
      currency: CURRENCY,
      status: "ACTIVE",
    },
  });

  const escrowWallet = await prisma.wallet.upsert({
    where: {
      ownerPlatformAccountId: platformAccount.id,
    },
    update: {
      status: "ACTIVE",
      currency: CURRENCY,
    },
    create: {
      ownerPlatformAccountId: platformAccount.id,
      balanceSatang: 0n,
      currency: CURRENCY,
      status: "ACTIVE",
    },
  });

  const escrowAccount = await prisma.escrowAccount.create({
    data: {
      loanId: loan.id,
      platformWalletId: escrowWallet.id,
    },
  });



  return {
    idempotencyKey,
    amountSatang: DEFAULT_AMOUNT,
    investorUser,
    borrowerUser,
    investorProfile,
    investorWallet,
    borrowerProfile,
    application,
    applicationVersion,
    offer,
    loan,
    platformAccount,
    escrowWallet,
    escrowAccount,
  };
}


export async function createAdditionalInvestorForLoan({
  loanId,
  administratorUserId,
  amountSatang = DEFAULT_AMOUNT,
}: {
  loanId: string;
  administratorUserId: string;
  amountSatang?: bigint;
}) {
  const suffix = randomUUID();

  const investorUser = await prisma.user.create({
    data: {
      email: `investor-${suffix}@example.test`,
    },
  });

  const investorProfile = await prisma.investorProfile.create({
    data: {
      userId: investorUser.id,
      displayName: `Test Investor ${suffix}`,
    },
  });

  const investorWallet = await prisma.wallet.create({
    data: {
      ownerUserId: investorUser.id,
      balanceSatang: 0n,
      currency: CURRENCY,
      status: "ACTIVE",
    },
  });

  await fundInvestorWallet({
    walletId: investorWallet.id,
    administratorUserId,
    amountSatang,
  });

  return {
    investorUser,
    investorProfile,
    investorWallet,
    amountSatang,
    loanId,
    idempotencyKey: `test-second-investor-${suffix}`,
  };
}
