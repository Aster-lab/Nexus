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
    const [investments, contributions, payouts, wallet] = await Promise.all([
      prisma.investment.findMany({ where: { investorProfileId }, select: { id: true, status: true } }),
      prisma.investmentContribution.findMany({ where: { investment: { investorProfileId }, ledgerTransaction: { status: "POSTED" } }, select: { amountSatang: true } }),
      prisma.investorPayout.findMany({ where: { investorProfileId, status: "COMPLETED", ledgerTransaction: { status: "POSTED" } }, select: { principalSatang: true, interestSatang: true } }),
      prisma.wallet.findFirst({ where: { ownerUserId: identity.userId, ownerPlatformAccountId: null }, select: { balanceSatang: true, currency: true, status: true } }),
    ]);
    const invested = contributions.reduce((sum, row) => sum + row.amountSatang, 0n);
    const principalReceived = payouts.reduce((sum, row) => sum + row.principalSatang, 0n);
    const interestReceived = payouts.reduce((sum, row) => sum + row.interestSatang, 0n);
    return apiSuccessResponse({
      investorProfileId,
      investmentCounts: { active: investments.filter((row) => row.status === "ACTIVE").length, completed: investments.filter((row) => row.status === "COMPLETED").length },
      totalInvestedPrincipalSatang: invested.toString(),
      principalReceivedSatang: principalReceived.toString(),
      interestReceivedSatang: interestReceived.toString(),
      outstandingPrincipalSatang: (invested > principalReceived ? invested - principalReceived : 0n).toString(),
      wallet: wallet ? { balanceSatang: wallet.balanceSatang.toString(), currency: wallet.currency, status: wallet.status } : null,
    });
  } catch (error) { return apiErrorResponseFrom(error); }
}
