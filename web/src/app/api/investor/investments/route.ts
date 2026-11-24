import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { requireInvestor } from "../../../../lib/api/investor";
import { parsePagination } from "../../../../lib/api/pagination";
import { apiPaginatedResponse, apiSuccessResponse } from "../../../../lib/api/responses";
import { postInvestorContribution, InvestorContributionError } from "../../../../lib/services/investor-contribution.service";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const inputSchema = z.object({ loanId: z.string().uuid(), amountSatang: z.string().regex(/^[1-9][0-9]*$/).max(20) }).strict();

function contributionError(error: unknown): never {
  if (error instanceof InvestorContributionError) {
    const conflict = error.code === "IDEMPOTENCY_KEY_CONFLICT";
    const forbidden = error.code === "OWN_LOAN_INVESTMENT_FORBIDDEN";
    throw new ApiError(forbidden ? error.code : conflict ? "IDEMPOTENCY_KEY_CONFLICT" : "INVESTMENT_REJECTED", error.message, forbidden ? 403 : conflict ? 409 : 422);
  }
  throw error;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireInvestor(request);
    const pagination = parsePagination(new URL(request.url).searchParams, { sortFields: ["createdAt"] });
    const where = { investorProfileId: identity.investorProfile.id };
    const [rows, total] = await Promise.all([
      prisma.investment.findMany({
        where,
        orderBy: { createdAt: pagination.sortOrder },
        skip: pagination.offset,
        take: pagination.limit,
        include: {
          loan: { select: { id: true, status: true, principalSatang: true, annualInterestRate: true, termMonths: true } },
          contributions: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, amountSatang: true, createdAt: true, ledgerTransaction: { select: { status: true } } },
          },
          payoutAllocation: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, principalSatang: true, interestSatang: true },
          },
        },
      }),
      prisma.investment.count({ where }),
    ]);
    const investmentIds = rows.map((row) => row.id);
    const [postedContributionTotals, contributionCounts, allocationCounts] = await Promise.all([
      prisma.investmentContribution.groupBy({
        by: ["investmentId"],
        where: { investmentId: { in: investmentIds }, ledgerTransaction: { status: "POSTED" } },
        _sum: { amountSatang: true },
      }),
      prisma.investmentContribution.groupBy({
        by: ["investmentId"],
        where: { investmentId: { in: investmentIds } },
        _count: { _all: true },
      }),
      prisma.payoutAllocation.groupBy({
        by: ["investmentId"],
        where: { investmentId: { in: investmentIds } },
        _count: { _all: true },
      }),
    ]);
    const postedTotalByInvestment = new Map(postedContributionTotals.map((item) => [item.investmentId, item._sum.amountSatang ?? 0n]));
    const contributionCountByInvestment = new Map(contributionCounts.map((item) => [item.investmentId, item._count._all]));
    const allocationCountByInvestment = new Map(allocationCounts.map((item) => [item.investmentId, item._count._all]));
    return apiPaginatedResponse(rows.map((row) => ({
      ...row,
      totalContributedSatang: (postedTotalByInvestment.get(row.id) ?? 0n).toString(),
      contributionCount: contributionCountByInvestment.get(row.id) ?? 0,
      hasMoreContributions: (contributionCountByInvestment.get(row.id) ?? 0) > row.contributions.length,
      payoutAllocationCount: allocationCountByInvestment.get(row.id) ?? 0,
      hasMorePayoutAllocations: (allocationCountByInvestment.get(row.id) ?? 0) > row.payoutAllocation.length,
      loan: { ...row.loan, principalSatang: row.loan.principalSatang.toString(), annualInterestRate: row.loan.annualInterestRate.toString() },
      contributions: row.contributions.map((contribution) => ({ ...contribution, amountSatang: contribution.amountSatang.toString() })),
      payoutAllocation: row.payoutAllocation.map((allocation) => ({ ...allocation, principalSatang: allocation.principalSatang.toString(), interestSatang: allocation.interestSatang.toString() })),
    })), pagination, total);
  } catch (error) { return apiErrorResponseFrom(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireInvestor(request);
    const body = await request.json().catch(() => { throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.", 400); });
    const input = inputSchema.parse(body);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 255) throw new ApiError("VALIDATION_ERROR", "A valid Idempotency-Key header is required.", 400);
    let record: Awaited<ReturnType<typeof postInvestorContribution>>;
    try {
      record = await postInvestorContribution({ userId: identity.userId, loanId: input.loanId, amountSatang: BigInt(input.amountSatang), idempotencyKey });
    } catch (error) { contributionError(error); }
    return apiSuccessResponse({ contributionId: record.id, investmentId: record.investmentId, loanId: record.investment.loanId, amountSatang: record.amountSatang.toString(), ledgerTransactionId: record.ledgerTransactionId, ledgerStatus: record.ledgerTransaction.status, createdAt: record.createdAt }, { status: 201, message: "Investment contribution posted successfully." });
  } catch (error) { return apiErrorResponseFrom(error); }
}
