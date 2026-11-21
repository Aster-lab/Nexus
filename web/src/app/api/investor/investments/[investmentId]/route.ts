import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../../../lib/api/errors";
import { requireInvestor } from "../../../../../lib/api/investor";
import { apiSuccessResponse } from "../../../../../lib/api/responses";
import { validateRouteParams } from "../../../../../lib/api/validation";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const historyQuerySchema = z.object({
  contributionPage: z.coerce.number().int().min(1).default(1),
  contributionLimit: z.coerce.number().int().min(1).max(100).default(10),
  allocationPage: z.coerce.number().int().min(1).default(1),
  allocationLimit: z.coerce.number().int().min(1).max(100).default(10),
}).strict();

function parseHistoryQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  const allowed = new Set(["contributionPage", "contributionLimit", "allocationPage", "allocationLimit"]);
  for (const key of params.keys()) {
    if (!allowed.has(key)) throw new ApiError("VALIDATION_ERROR", `Unsupported query parameter: ${key}`, 400);
    if (params.getAll(key).length !== 1) throw new ApiError("VALIDATION_ERROR", `Query parameter ${key} must appear once.`, 400);
  }
  const parsed = historyQuerySchema.safeParse(Object.fromEntries(params.entries()));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid investment history pagination parameters", 400);
  return parsed.data;
}

function pageMetadata(page: number, limit: number, total: number) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasPreviousPage: page > 1, hasNextPage: page < totalPages };
}

export async function GET(request: Request, context: { params: Promise<{ investmentId: string }> }): Promise<Response> {
  try {
    const identity = await requireInvestor(request);
    const { investmentId } = validateRouteParams(await context.params, z.object({ investmentId: z.string().uuid() }).strict());
    const history = parseHistoryQuery(request);
    const row = await prisma.investment.findFirst({
      where: { id: investmentId, investorProfileId: identity.investorProfile.id },
      include: {
        loan: { select: { id: true, status: true, principalSatang: true, annualInterestRate: true, termMonths: true } },
        contributions: {
          orderBy: { createdAt: "desc" },
          skip: (history.contributionPage - 1) * history.contributionLimit,
          take: history.contributionLimit,
          select: { id: true, amountSatang: true, createdAt: true, ledgerTransaction: { select: { id: true, status: true } } },
        },
        payoutAllocation: {
          orderBy: { createdAt: "desc" },
          skip: (history.allocationPage - 1) * history.allocationLimit,
          take: history.allocationLimit,
          select: { id: true, principalSatang: true, interestSatang: true, recoverySatang: true, repaymentId: true, investorPayout: { select: { id: true, status: true, principalSatang: true, interestSatang: true, ledgerTransactionId: true, completedAt: true } } },
        },
      },
    });
    if (!row) throw new ApiError("NOT_FOUND", "The requested investment was not found.", 404);
    const [contributionCount, allocationCount, postedContributions] = await Promise.all([
      prisma.investmentContribution.count({ where: { investmentId: row.id } }),
      prisma.payoutAllocation.count({ where: { investmentId: row.id } }),
      prisma.investmentContribution.aggregate({ where: { investmentId: row.id, ledgerTransaction: { status: "POSTED" } }, _sum: { amountSatang: true } }),
    ]);
    return apiSuccessResponse({
      ...row,
      totalContributedSatang: (postedContributions._sum.amountSatang ?? 0n).toString(),
      contributionCount,
      hasMoreContributions: contributionCount > (history.contributionPage - 1) * history.contributionLimit + row.contributions.length,
      allocationCount,
      hasMoreAllocations: allocationCount > (history.allocationPage - 1) * history.allocationLimit + row.payoutAllocation.length,
      contributionPagination: pageMetadata(history.contributionPage, history.contributionLimit, contributionCount),
      allocationPagination: pageMetadata(history.allocationPage, history.allocationLimit, allocationCount),
      loan: { ...row.loan, principalSatang: row.loan.principalSatang.toString(), annualInterestRate: row.loan.annualInterestRate.toString() },
      contributions: row.contributions.map((item) => ({ ...item, amountSatang: item.amountSatang.toString() })),
      payoutAllocation: row.payoutAllocation.map((item) => ({
        ...item,
        principalSatang: item.principalSatang.toString(),
        interestSatang: item.interestSatang.toString(),
        recoverySatang: item.recoverySatang.toString(),
        investorPayout: item.investorPayout ? {
          ...item.investorPayout,
          principalSatang: item.investorPayout.principalSatang.toString(),
          interestSatang: item.investorPayout.interestSatang.toString(),
        } : null,
      })),
    });
  } catch (error) { return apiErrorResponseFrom(error); }
}
