import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../lib/api/errors";
import { authenticateApiRequest } from "../../../lib/api/authentication";
import { apiSuccessResponse } from "../../../lib/api/responses";
import { parsePagination } from "../../../lib/api/pagination";
import { prisma } from "../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notificationStatusSchema = z.enum(["UNREAD", "READ"]);

function safeActionPath(path: string | null, roles: string[]): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  try {
    const target = new URL(path, "https://nexus.invalid");
    if (target.origin !== "https://nexus.invalid" || target.pathname.startsWith("/api/")) return null;
    const section = /^\/(borrower|investor|admin)(?:\/|$)/.exec(target.pathname)?.[1];
    if (!section || !roles.includes(section.toUpperCase())) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    const pagination = parsePagination(new URL(request.url).searchParams, {
      sortFields: ["createdAt"], filterFields: ["status"], defaultLimit: 20, maxLimit: 100,
    });
    const rawStatus = pagination.filters?.status;
    const status = rawStatus === undefined ? undefined : notificationStatusSchema.safeParse(rawStatus);
    if (status && !status.success) throw new ApiError("VALIDATION_ERROR", "Unsupported notification status filter.", 400);
    const where = { userId: identity.userId, ...(status?.success ? { status: status.data } : {}) };
    const [rows, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: pagination.sortOrder }, { id: pagination.sortOrder }],
        skip: pagination.offset,
        take: pagination.limit,
        select: { id: true, category: true, title: true, content: true, actionPath: true, status: true, createdAt: true },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: identity.userId, status: "UNREAD" } }),
    ]);
    const totalPages = total === 0 ? 0 : Math.ceil(total / pagination.limit);
    return apiSuccessResponse({
      items: rows.map((row) => ({ ...row, actionPath: safeActionPath(row.actionPath, identity.roles) })),
      unreadCount,
      pagination: {
        page: pagination.page, limit: pagination.limit, total, totalPages,
        hasPreviousPage: pagination.page > 1, hasNextPage: pagination.page < totalPages,
      },
    }, { message: "Notifications loaded." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
