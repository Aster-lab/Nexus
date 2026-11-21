import { requireInvestor } from "../../../../lib/api/investor";
import { apiErrorResponseFrom } from "../../../../lib/api/errors";
import { parsePagination } from "../../../../lib/api/pagination";
import { apiPaginatedResponse } from "../../../../lib/api/responses";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireInvestor(request);
    const pagination = parsePagination(new URL(request.url).searchParams, { sortFields: ["createdAt"] });
    const where = { investment: { investorProfileId: identity.investorProfile.id } };
    const [rows, total] = await Promise.all([
      prisma.payoutAllocation.findMany({ where, orderBy: { createdAt: pagination.sortOrder }, skip: pagination.offset, take: pagination.limit, select: { id: true, principalSatang: true, interestSatang: true, recoverySatang: true, allocationMethod: true, createdAt: true, investmentId: true, repaymentId: true, repayment: { select: { status: true, receivedAt: true, loanId: true, ledgerTransactionId: true } }, investorPayout: { select: { id: true, status: true, principalSatang: true, interestSatang: true, ledgerTransactionId: true, completedAt: true } } } }),
      prisma.payoutAllocation.count({ where }),
    ]);
    return apiPaginatedResponse(rows.map((row) => ({ ...row, principalSatang: row.principalSatang.toString(), interestSatang: row.interestSatang.toString(), recoverySatang: row.recoverySatang.toString(), investorPayout: row.investorPayout ? { ...row.investorPayout, principalSatang: row.investorPayout.principalSatang.toString(), interestSatang: row.investorPayout.interestSatang.toString() } : null })), pagination, total);
  } catch (error) { return apiErrorResponseFrom(error); }
}
