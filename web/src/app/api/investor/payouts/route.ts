import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { requireInvestor } from "../../../../lib/api/investor";
import { parsePagination } from "../../../../lib/api/pagination";
import { apiPaginatedResponse } from "../../../../lib/api/responses";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireInvestor(request);
    const pagination = parsePagination(new URL(request.url).searchParams, { sortFields: ["createdAt"] });
    const where = { investorProfileId: identity.investorProfile.id };
    const [rows, total] = await Promise.all([
      prisma.investorPayout.findMany({ where, orderBy: { createdAt: pagination.sortOrder }, skip: pagination.offset, take: pagination.limit, select: { id: true, status: true, principalSatang: true, interestSatang: true, ledgerTransactionId: true, completedAt: true, createdAt: true, payoutAllocation: { select: { id: true, repaymentId: true, investmentId: true } } } }),
      prisma.investorPayout.count({ where }),
    ]);
    return apiPaginatedResponse(rows.map((row) => ({ ...row, principalSatang: row.principalSatang.toString(), interestSatang: row.interestSatang.toString() })), pagination, total);
  } catch (error) { return apiErrorResponseFrom(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireInvestor(request);
    throw new ApiError("METHOD_NOT_ALLOWED", "Investors cannot initiate payouts.", 405);
  } catch (error) { return apiErrorResponseFrom(error); }
}
