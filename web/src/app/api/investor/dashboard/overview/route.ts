import { apiErrorResponseFrom } from "../../../../../lib/api/errors";
import { requireInvestor } from "../../../../../lib/api/investor";
import { apiSuccessResponse } from "../../../../../lib/api/responses";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function section<T>(load: () => Promise<T>) {
  try { return { status: "success" as const, data: await load() }; }
  catch { return { status: "error" as const, message: "We could not load this section. Check your connection and retry." }; }
}

export async function GET(request: Request): Promise<Response> {
  const startedAt = performance.now();
  let authDuration = 0;
  const withTimings = (response: Response) => {
    const total = performance.now() - startedAt;
    response.headers.set("Server-Timing", `auth;dur=${authDuration.toFixed(1)}, data;dur=${Math.max(0, total - authDuration).toFixed(1)}, app;dur=${total.toFixed(1)}`);
    return response;
  };
  try {
    const identity = await requireInvestor(request);
    authDuration = performance.now() - startedAt;
    const investorProfileId = identity.investorProfile.id;
    const userId = identity.userId;

    const [portfolio, investments, payouts, wallet] = await Promise.all([
      section(async () => {
        const [investmentCounts, contributions, completedPayouts, userWallet] = await Promise.all([
          prisma.investment.groupBy({ by: ["status"], where: { investorProfileId }, _count: { _all: true } }),
          prisma.investmentContribution.aggregate({ where: { investment: { investorProfileId }, ledgerTransaction: { status: "POSTED" } }, _sum: { amountSatang: true } }),
          prisma.investorPayout.aggregate({ where: { investorProfileId, status: "COMPLETED", ledgerTransaction: { status: "POSTED" } }, _sum: { principalSatang: true, interestSatang: true } }),
          prisma.wallet.findFirst({ where: { ownerUserId: userId, ownerPlatformAccountId: null }, select: { balanceSatang: true, currency: true, status: true } }),
        ]);
        const invested = contributions._sum.amountSatang ?? 0n;
        const principalReceived = completedPayouts._sum.principalSatang ?? 0n;
        const active = investmentCounts.find((row) => row.status === "ACTIVE")?._count._all ?? 0;
        const completed = investmentCounts.find((row) => row.status === "COMPLETED")?._count._all ?? 0;
        return {
          investorProfileId,
          investmentCounts: { active, completed },
          totalInvestedPrincipalSatang: invested.toString(),
          principalReceivedSatang: principalReceived.toString(),
          interestReceivedSatang: (completedPayouts._sum.interestSatang ?? 0n).toString(),
          outstandingPrincipalSatang: (invested > principalReceived ? invested - principalReceived : 0n).toString(),
          wallet: userWallet ? { balanceSatang: userWallet.balanceSatang.toString(), currency: userWallet.currency, status: userWallet.status } : null,
        };
      }),
      section(async () => (await prisma.investment.findMany({
        where: { investorProfileId }, orderBy: { createdAt: "desc" }, take: 5,
        select: { id: true, status: true, createdAt: true, loan: { select: { id: true } } },
      }))),
      section(async () => (await prisma.investorPayout.findMany({
        where: { investorProfileId }, orderBy: { createdAt: "desc" }, take: 5,
        select: { id: true, status: true, principalSatang: true, interestSatang: true, ledgerTransactionId: true, completedAt: true, createdAt: true, payoutAllocation: { select: { id: true, repaymentId: true, investmentId: true } } },
      })).map((row) => ({ ...row, principalSatang: row.principalSatang.toString(), interestSatang: row.interestSatang.toString() }))),
      section(async () => {
        const [record, entries, total] = await Promise.all([
          prisma.wallet.findUnique({ where: { ownerUserId: userId }, select: { id: true, currency: true, balanceSatang: true, status: true, createdAt: true, updatedAt: true } }),
          prisma.ledgerEntry.findMany({
            where: { wallet: { ownerUserId: userId }, ledgerTransaction: { status: "POSTED", postedAt: { not: null } } },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 5,
            select: { id: true, entryType: true, amountSatang: true, currency: true, createdAt: true, ledgerTransaction: { select: { id: true, transactionType: true, referenceType: true, referenceId: true, description: true, status: true, postedAt: true, repayments: { select: { id: true, loanId: true, status: true } } } } },
          }),
          prisma.ledgerEntry.count({ where: { wallet: { ownerUserId: userId }, ledgerTransaction: { status: "POSTED", postedAt: { not: null } } } }),
        ]);
        return {
          wallet: record ? { ...record, balanceSatang: record.balanceSatang.toString() } : null,
          pagination: { page: 1, limit: 5, total, totalPages: total === 0 ? 0 : Math.ceil(total / 5), hasPreviousPage: false, hasNextPage: total > 5 },
          transactions: entries.map((entry) => ({
            ledgerEntryId: entry.id, ledgerTransactionId: entry.ledgerTransaction.id,
            transactionType: entry.ledgerTransaction.transactionType, referenceType: entry.ledgerTransaction.referenceType,
            referenceId: entry.ledgerTransaction.referenceId, description: entry.ledgerTransaction.description,
            repayments: entry.ledgerTransaction.repayments, direction: entry.entryType,
            amountSatang: entry.amountSatang.toString(), currency: entry.currency,
            status: entry.ledgerTransaction.status, postedAt: entry.ledgerTransaction.postedAt?.toISOString() ?? null,
          })),
        };
      }),
    ]);

    return withTimings(apiSuccessResponse({ portfolio, investments, payouts, wallet }, { message: "Investor dashboard loaded." }));
  } catch (error) {
    if (authDuration === 0) authDuration = performance.now() - startedAt;
    return withTimings(apiErrorResponseFrom(error));
  }
}
