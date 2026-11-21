import { apiGet, type ApiPagination } from "./api-client";

export interface AdminAuditLogRow {
  id: string; actorUserId: string | null; action: string; targetType: string; targetId: string | null;
  reason: string | null; oldValues: unknown; newValues: unknown; outcome: string; correlationId: string | null; createdAt: string;
}
export type AdminAuditLogsQuery = { page: number; limit: number; action: string; targetType: string; targetId: string; actorUserId: string; sortOrder: "asc" | "desc" };

export function getAdminAuditLogsPath(query: AdminAuditLogsQuery): string {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit), sortBy: "createdAt", sortOrder: query.sortOrder });
  for (const key of ["action", "targetType", "targetId", "actorUserId"] as const) if (query[key].trim()) params.set(key, query[key].trim());
  return `/api/admin/audit-logs?${params}`;
}
export async function loadAdminAuditLogs(query: AdminAuditLogsQuery) {
  const response = await apiGet<AdminAuditLogRow[]>(getAdminAuditLogsPath(query));
  return { data: response.data, pagination: response.pagination as ApiPagination | undefined };
}
