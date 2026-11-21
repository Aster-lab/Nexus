import { apiGet, apiPatch, type ApiPagination } from "./api-client";

export const ADMIN_USER_STATUSES = ["ACTIVE", "RESTRICTED", "DEACTIVATION_PENDING", "DEACTIVATED"] as const;
export type AdminUserStatus = typeof ADMIN_USER_STATUSES[number];
export type AdminUsersQuery = { page: number; limit: number; accountStatus: "ALL" | AdminUserStatus; role: "ALL" | "BORROWER" | "INVESTOR"; sortBy: "createdAt" | "email"; sortOrder: "asc" | "desc" };
export interface AdminUserRow {
  id: string; email: string; accountStatus: AdminUserStatus; emailVerifiedAt: string | null; createdAt: string; updatedAt: string;
  borrowerProfile: { id: string; legalName: string } | null;
  investorProfile: { id: string; displayName: string; investorStatus: string } | null;
  roles: Array<{ role: { code: string; name: string }; grantedAt: string }>;
}

export function getAdminUsersPath(query: AdminUsersQuery): string {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit), sortBy: query.sortBy, sortOrder: query.sortOrder });
  if (query.accountStatus !== "ALL") params.set("accountStatus", query.accountStatus);
  if (query.role !== "ALL") params.set("role", query.role);
  return `/api/admin/users?${params}`;
}
export function getAdminUserPath(userId: string): string { return `/api/admin/users/${encodeURIComponent(userId)}`; }
export async function loadAdminUsers(query: AdminUsersQuery) {
  const response = await apiGet<AdminUserRow[]>(getAdminUsersPath(query));
  return { data: response.data, pagination: response.pagination as ApiPagination | undefined };
}
export async function updateAdminUserStatus(userId: string, accountStatus: AdminUserStatus, patcher = apiPatch) {
  const response = await patcher<{ id: string; email: string; accountStatus: AdminUserStatus; deactivatedAt: string | null; updatedAt: string }, { accountStatus: AdminUserStatus }>(getAdminUserPath(userId), { accountStatus });
  return response.data;
}
