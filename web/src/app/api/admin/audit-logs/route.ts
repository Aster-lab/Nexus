import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { requireAdministrator } from "../../../../lib/api/administrator";
import { parsePagination } from "../../../../lib/api/pagination";
import { apiPaginatedResponse } from "../../../../lib/api/responses";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdministrator(request);
    const pagination = parsePagination(new URL(request.url).searchParams, { sortFields: ["createdAt"], filterFields: ["action", "targetType", "targetId", "actorUserId"] });
    const filters = pagination.filters ?? {};
    for (const key of ["targetId", "actorUserId"] as const) {
      if (filters[key] && !/^[0-9a-f-]{36}$/i.test(filters[key])) throw new ApiError("VALIDATION_ERROR", `Invalid ${key} filter.`, 400);
    }
    const where = { ...(filters.action ? { action: filters.action } : {}), ...(filters.targetType ? { targetType: filters.targetType } : {}), ...(filters.targetId ? { targetId: filters.targetId } : {}), ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}) };
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: pagination.sortOrder }, skip: pagination.offset, take: pagination.limit, select: { id: true, actorUserId: true, action: true, targetType: true, targetId: true, reason: true, oldValues: true, newValues: true, outcome: true, correlationId: true, createdAt: true } }),
      prisma.auditLog.count({ where }),
    ]);
    return apiPaginatedResponse(rows, pagination, total);
  } catch (error) { return apiErrorResponseFrom(error); }
}
