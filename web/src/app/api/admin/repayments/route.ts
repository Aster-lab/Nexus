import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { requireAdministrator } from "../../../../lib/api/administrator";
import { parsePagination } from "../../../../lib/api/pagination";
import { apiPaginatedResponse } from "../../../../lib/api/responses";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const statuses = ["POSTED", "REVERSED"];

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdministrator(request);
    const pagination = parsePagination(new URL(request.url).searchParams, { sortFields: ["receivedAt", "createdAt"], filterFields: ["status", "loanId"] });
    const status = pagination.filters?.status;
    const loanId = pagination.filters?.loanId;
    if (status && !statuses.includes(status)) throw new ApiError("VALIDATION_ERROR", "Unsupported repayment status filter.", 400);
    if (loanId && !/^[0-9a-f-]{36}$/i.test(loanId)) throw new ApiError("VALIDATION_ERROR", "Invalid loanId filter.", 400);
    const where = { ...(status ? { status: status as never } : {}), ...(loanId ? { loanId } : {}) };
    const [rows, total] = await Promise.all([
      prisma.repayment.findMany({ where, orderBy: pagination.sortBy === "createdAt" ? { createdAt: pagination.sortOrder } : { receivedAt: pagination.sortOrder }, skip: pagination.offset, take: pagination.limit, select: { id: true, loanId: true, installmentId: true, ledgerTransactionId: true, principalSatang: true, interestSatang: true, feeSatang: true, totalSatang: true, status: true, receivedAt: true, createdAt: true, loan: { select: { borrowerProfileId: true, status: true } }, installment: { select: { installmentNumber: true, dueDate: true, status: true, paidPrincipalSatang: true, paidInterestSatang: true } }, payoutAllocations: { select: { id: true, investmentId: true, principalSatang: true, interestSatang: true, recoverySatang: true } }, ledgerTransaction: { select: { status: true, postedAt: true } } } }),
      prisma.repayment.count({ where }),
    ]);
    return apiPaginatedResponse(rows.map((row) => ({ ...row, principalSatang: row.principalSatang.toString(), interestSatang: row.interestSatang.toString(), feeSatang: row.feeSatang.toString(), totalSatang: row.totalSatang.toString(), installment: { ...row.installment, paidPrincipalSatang: row.installment.paidPrincipalSatang.toString(), paidInterestSatang: row.installment.paidInterestSatang.toString() }, payoutAllocations: row.payoutAllocations.map((allocation) => ({ ...allocation, principalSatang: allocation.principalSatang.toString(), interestSatang: allocation.interestSatang.toString(), recoverySatang: allocation.recoverySatang.toString() })) })), pagination, total);
  } catch (error) { return apiErrorResponseFrom(error); }
}
