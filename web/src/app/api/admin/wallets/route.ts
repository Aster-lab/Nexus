import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { requireAdministrator } from "../../../../lib/api/administrator";
import { parsePagination } from "../../../../lib/api/pagination";
import { apiPaginatedResponse } from "../../../../lib/api/responses";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const statuses = ["ACTIVE", "RESTRICTED", "CLOSED"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdministrator(request);
    const pagination = parsePagination(new URL(request.url).searchParams, { sortFields: ["createdAt", "balanceSatang"], filterFields: ["status", "currency", "ownerUserId", "ownerPlatformAccountId"], defaultLimit: 20, maxLimit: 100 });
    const filters = pagination.filters ?? {};
    if (filters.status && !statuses.includes(filters.status)) throw new ApiError("VALIDATION_ERROR", "Unsupported wallet status filter.", 400);
    for (const key of ["ownerUserId", "ownerPlatformAccountId"] as const) if (filters[key] && !uuid.test(filters[key])) throw new ApiError("VALIDATION_ERROR", `Invalid ${key} filter.`, 400);
    const where = {
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.currency ? { currency: filters.currency.toUpperCase() } : {}),
      ...(filters.ownerUserId ? { ownerUserId: filters.ownerUserId } : {}),
      ...(filters.ownerPlatformAccountId ? { ownerPlatformAccountId: filters.ownerPlatformAccountId } : {}),
    };
    const orderBy = pagination.sortBy === "balanceSatang" ? { balanceSatang: pagination.sortOrder } : { createdAt: pagination.sortOrder };
    const [rows, total] = await Promise.all([
      prisma.wallet.findMany({ where, orderBy, skip: pagination.offset, take: pagination.limit, select: { id: true, currency: true, balanceSatang: true, status: true, createdAt: true, updatedAt: true, ownerUser: { select: { id: true, email: true, borrowerProfile: { select: { legalName: true } }, investorProfile: { select: { id: true, displayName: true } } } }, ownerPlatformAccount: { select: { id: true, accountCode: true, accountName: true, accountType: true, status: true } } } }),
      prisma.wallet.count({ where }),
    ]);
    return apiPaginatedResponse(rows.map((row) => ({ ...row, balanceSatang: row.balanceSatang.toString() })), pagination, total);
  } catch (error) { return apiErrorResponseFrom(error); }
}
