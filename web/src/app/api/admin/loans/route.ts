import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { requireAdministrator } from "../../../../lib/api/administrator";
import { parsePagination } from "../../../../lib/api/pagination";
import { apiPaginatedResponse } from "../../../../lib/api/responses";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const statuses = ["FUNDING", "FUNDED", "ACTIVE", "DELINQUENT", "DEFAULTED", "REPAID", "CANCELLED"];

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdministrator(request);
    const pagination = parsePagination(new URL(request.url).searchParams, { sortFields: ["createdAt", "fundingDeadline", "principalSatang"], filterFields: ["status"] });
    const status = pagination.filters?.status;
    if (status && !statuses.includes(status)) throw new ApiError("VALIDATION_ERROR", "Unsupported loan status filter.", 400);
    const where = status ? { status: status as never } : {};
    const [rows, total] = await Promise.all([
      prisma.loan.findMany({ where, orderBy: pagination.sortBy === "fundingDeadline" ? { fundingDeadline: pagination.sortOrder } : pagination.sortBy === "principalSatang" ? { principalSatang: pagination.sortOrder } : { createdAt: pagination.sortOrder }, skip: pagination.offset, take: pagination.limit, select: { id: true, status: true, principalSatang: true, fundedSatang: true, annualInterestRate: true, termMonths: true, fundingDeadline: true, fundedAt: true, disbursedAt: true, createdAt: true, borrowerProfile: { select: { id: true, legalName: true } } } }),
      prisma.loan.count({ where }),
    ]);
    return apiPaginatedResponse(rows.map((row) => ({ ...row, principalSatang: row.principalSatang.toString(), fundedSatang: row.fundedSatang.toString(), annualInterestRate: row.annualInterestRate.toString() })), pagination, total);
  } catch (error) { return apiErrorResponseFrom(error); }
}
