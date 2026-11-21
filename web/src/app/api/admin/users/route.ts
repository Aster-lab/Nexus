import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { requireAdministrator } from "../../../../lib/api/administrator";
import { parsePagination } from "../../../../lib/api/pagination";
import { apiPaginatedResponse } from "../../../../lib/api/responses";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const statuses = ["ACTIVE", "RESTRICTED", "DEACTIVATION_PENDING", "DEACTIVATED"];

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdministrator(request);
    const pagination = parsePagination(new URL(request.url).searchParams, { sortFields: ["createdAt", "email"], filterFields: ["accountStatus", "role"] });
    const status = pagination.filters?.accountStatus;
    const role = pagination.filters?.role;
    if (status && !statuses.includes(status)) throw new ApiError("VALIDATION_ERROR", "Unsupported account status filter.", 400);
    if (role && !/^[A-Z][A-Z0-9_]{1,29}$/.test(role)) throw new ApiError("VALIDATION_ERROR", "Invalid role filter.", 400);
    const where = { ...(status ? { accountStatus: status as never } : {}), ...(role ? { roles: { some: { revokedAt: null, role: { code: role } } } } : {}) };
    const [rows, total] = await Promise.all([
      prisma.user.findMany({ where, orderBy: pagination.sortBy === "email" ? { email: pagination.sortOrder } : { createdAt: pagination.sortOrder }, skip: pagination.offset, take: pagination.limit, select: { id: true, email: true, accountStatus: true, emailVerifiedAt: true, createdAt: true, updatedAt: true, borrowerProfile: { select: { id: true, legalName: true } }, investorProfile: { select: { id: true, displayName: true, investorStatus: true } }, roles: { where: { revokedAt: null }, select: { role: { select: { code: true, name: true } }, grantedAt: true } } } }),
      prisma.user.count({ where }),
    ]);
    return apiPaginatedResponse(rows, pagination, total);
  } catch (error) { return apiErrorResponseFrom(error); }
}
