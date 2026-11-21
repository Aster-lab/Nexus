import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { requireAdministrator } from "../../../../lib/api/administrator";
import { parsePagination } from "../../../../lib/api/pagination";
import { apiPaginatedResponse } from "../../../../lib/api/responses";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const applicationStatuses = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "INFORMATION_REQUESTED", "APPROVED", "REJECTED", "WITHDRAWN", "CLOSED"];

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdministrator(request);
    const pagination = parsePagination(new URL(request.url).searchParams, { sortFields: ["createdAt", "updatedAt", "submittedAt"], filterFields: ["status"] });
    const status = pagination.filters?.status;
    if (status && !applicationStatuses.includes(status)) throw new ApiError("VALIDATION_ERROR", "Unsupported application status filter.", 400);
    const where = status ? { status: status as never } : {};
    const [rows, total] = await Promise.all([
      prisma.loanApplication.findMany({ where, orderBy: pagination.sortBy === "updatedAt" ? { updatedAt: pagination.sortOrder } : pagination.sortBy === "submittedAt" ? { submittedAt: pagination.sortOrder } : { createdAt: pagination.sortOrder }, skip: pagination.offset, take: pagination.limit, select: { id: true, status: true, borrowerProfileId: true, createdAt: true, updatedAt: true, submittedAt: true, currentVersion: { select: { id: true, versionNumber: true, requestedPrincipalSatang: true, requestedTermMonths: true, submittedAt: true } } } }),
      prisma.loanApplication.count({ where }),
    ]);
    return apiPaginatedResponse(rows.map((row) => ({ ...row, currentVersion: row.currentVersion ? { ...row.currentVersion, requestedPrincipalSatang: row.currentVersion.requestedPrincipalSatang.toString() } : null })), pagination, total);
  } catch (error) { return apiErrorResponseFrom(error); }
}
