import { requireInvestor } from "../../../../lib/api/investor";
import { apiErrorResponseFrom } from "../../../../lib/api/errors";
import { apiSuccessResponse } from "../../../../lib/api/responses";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireInvestor(request);
    const investorProfileId = identity.investorProfile.id;
    const [investmentCounts, contributions, payouts, wallet] = await Promise.all([
      prisma.investment.groupBy({
        by: ["status"],
        where: { investorProfileId },
        _count: { _all: true },
      }),
      prisma.investmentContribution.aggregate({
        where: { investment: { investorProfileId }, ledgerTransaction: { status: "POSTED" } },
        _sum: { amountSatang: true },
      }),
      prisma.investorPayout.aggregate({
        where: { investorProfileId, status: "COMPLETED", ledgerTransaction: { status: "POSTED" } },
        _sum: { principalSatang: true, interestSatang: true },
      }),
      prisma.wallet.findFirst({ where: { ownerUserId: identity.userId, ownerPlatformAccountId: null }, select: { balanceSatang: true, currency: true, status: true } }),
    ]);
    const invested = contributions._sum.amountSatang ?? 0n;
    const principalReceived = payouts._sum.principalSatang ?? 0n;
    const interestReceived = payouts._sum.interestSatang ?? 0n;
    const activeInvestmentCount = investmentCounts.find((row) => row.status === "ACTIVE")?._count._all ?? 0;
    const completedInvestmentCount = investmentCounts.find((row) => row.status === "COMPLETED")?._count._all ?? 0;
    return apiSuccessResponse({
      investorProfileId,
      investmentCounts: { active: activeInvestmentCount, completed: completedInvestmentCount },
      totalInvestedPrincipalSatang: invested.toString(),
      principalReceivedSatang: principalReceived.toString(),
      interestReceivedSatang: interestReceived.toString(),
      outstandingPrincipalSatang: (invested > principalReceived ? invested - principalReceived : 0n).toString(),
      wallet: wallet ? { balanceSatang: wallet.balanceSatang.toString(), currency: wallet.currency, status: wallet.status } : null,
    });
  } catch (error) { return apiErrorResponseFrom(error); }
}
