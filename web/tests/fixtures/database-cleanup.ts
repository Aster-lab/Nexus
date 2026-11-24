
import { prisma } from "../../src/lib/prisma";

interface InvestorContributionFixture {
  idempotencyKey: string;
  investorUser: { id: string };
  borrowerUser: { id: string };
  investorProfile: { id: string };
  investorWallet: { id: string };
  borrowerProfile: { id: string };
  application: { id: string };
  applicationVersion: { id: string };
  offer: { id: string };
  loan: { id: string };
  escrowAccount: { id: string };
}

export async function cleanupInvestorContributionFixture(
  fixture: InvestorContributionFixture,
): Promise<void> {
  const postedContribution =
    await prisma.investmentContribution.findUnique({
      where: { idempotencyKey: fixture.idempotencyKey },
      select: { id: true },
    });

  if (postedContribution) return;

  await prisma.escrowAccount.deleteMany({
    where: { id: fixture.escrowAccount.id },
  });

  await prisma.loan.deleteMany({
    where: { id: fixture.loan.id },
  });

  await prisma.loanOffer.deleteMany({
    where: { id: fixture.offer.id },
  });

  await prisma.loanApplication.update({
    where: { id: fixture.application.id },
    data: { currentVersionId: null },
  });

  await prisma.applicationVersion.deleteMany({
    where: { id: fixture.applicationVersion.id },
  });

  await prisma.loanApplication.deleteMany({
    where: { id: fixture.application.id },
  });

  await prisma.borrowerProfile.deleteMany({
    where: { id: fixture.borrowerProfile.id },
  });

  await prisma.investorProfile.deleteMany({
    where: { id: fixture.investorProfile.id },
  });

  await prisma.wallet.deleteMany({
    where: { id: fixture.investorWallet.id },
  });

  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          fixture.investorUser.id,
          fixture.borrowerUser.id,
        ],
      },
    },
  });
}
