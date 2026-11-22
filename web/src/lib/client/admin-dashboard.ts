import { ApiClientError, apiGet, type ApiPagination, type ApiSuccessEnvelope } from "./api-client";

export type AdminDashboardFetcher = <T>(path: string, options?: { signal?: AbortSignal }) => Promise<ApiSuccessEnvelope<T>>;
export type AdminDashboardResource = "users" | "applications" | "loans" | "repayments" | "payout-allocations" | "audit-logs";

export type AdminDashboardSection<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };

export interface AdminDashboardAuditRow {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  outcome: string;
  createdAt: string;
}

export interface AdminDashboardRepaymentRow {
  id: string;
  loanId: string;
  installmentId: string;
  totalSatang: string;
  principalSatang: string;
  interestSatang: string;
  status: string;
  receivedAt: string;
  installment: { installmentNumber: number; dueDate: string; status: string };
  ledgerTransaction: { status: string; postedAt: string | null };
}

export interface AdminDashboardOverview {
  users: AdminDashboardSection<{ total: number; borrowers: number; investors: number }>;
  applications: AdminDashboardSection<{ total: number }>;
  loans: AdminDashboardSection<{ active: number }>;
  payouts: AdminDashboardSection<{ pending: number }>;
  repayments: AdminDashboardSection<AdminDashboardRepaymentRow[]>;
  audit: AdminDashboardSection<AdminDashboardAuditRow[]>;
}

const ADMIN_DASHBOARD_PATH = "/api/admin/dashboard/overview";
const ADMIN_DASHBOARD_CACHE_TTL_MS = 10_000;
const adminDashboardCache = new Map<string, { expiresAt: number; data: AdminDashboardOverview }>();

export async function loadAdminDashboardOverview(
  fetcher: AdminDashboardFetcher = apiGet,
  signal?: AbortSignal,
  cacheKey?: string,
): Promise<AdminDashboardOverview> {
  const cached = cacheKey ? adminDashboardCache.get(cacheKey) : undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  if (cached && cacheKey) adminDashboardCache.delete(cacheKey);

  try {
    const response = await fetcher<AdminDashboardOverview>(ADMIN_DASHBOARD_PATH, { signal });
    const data = response.data;
    const sections = ["users", "applications", "loans", "payouts", "repayments", "audit"] as const;
    if (!data || typeof data !== "object" || !sections.every((key) => data[key] && typeof data[key] === "object" && "status" in data[key])) {
      throw new ApiClientError(502, "INVALID_DASHBOARD_RESPONSE", "The server returned an unexpected administrator dashboard response.");
    }
    if (cacheKey && !signal?.aborted && sections.every((key) => data[key].status === "success")) {
      adminDashboardCache.set(cacheKey, { expiresAt: Date.now() + ADMIN_DASHBOARD_CACHE_TTL_MS, data });
    }
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The administrator dashboard could not be loaded. Retry or open the relevant section.";
    const failed = { status: "error" as const, message };
    return { users: failed, applications: failed, loans: failed, payouts: failed, repayments: failed, audit: failed };
  }
}

export function invalidateAdminDashboardCache(cacheKey?: string): void {
  if (cacheKey) adminDashboardCache.delete(cacheKey);
  else adminDashboardCache.clear();
}

export function getAdminDashboardPath(
  resource: AdminDashboardResource,
  params: Record<string, string | number>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) query.set(key, String(value));
  return `/api/admin/${resource}?${query.toString()}`;
}

function totalFrom<T>(response: ApiSuccessEnvelope<T>): number {
  const total = (response as ApiSuccessEnvelope<T> & { pagination?: ApiPagination }).pagination?.total;
  if (!Number.isSafeInteger(total) || (total ?? -1) < 0) {
    throw new Error("The administrator summary response did not include a valid pagination total.");
  }
  return total!;
}

export async function loadAdminDashboardUsers(fetcher: AdminDashboardFetcher = apiGet, signal?: AbortSignal) {
  const [users, borrowers, investors] = await Promise.all([
    fetcher<unknown[]>(getAdminDashboardPath("users", { limit: 1 }), { signal }),
    fetcher<unknown[]>(getAdminDashboardPath("users", { role: "BORROWER", limit: 1 }), { signal }),
    fetcher<unknown[]>(getAdminDashboardPath("users", { role: "INVESTOR", limit: 1 }), { signal }),
  ]);
  return { total: totalFrom(users), borrowers: totalFrom(borrowers), investors: totalFrom(investors) };
}

export async function loadAdminDashboardApplications(fetcher: AdminDashboardFetcher = apiGet, signal?: AbortSignal): Promise<{ total: number }> {
  const statuses = ["SUBMITTED", "UNDER_REVIEW", "INFORMATION_REQUESTED"] as const;
  const responses = await Promise.all(statuses.map((status) =>
    fetcher<unknown[]>(getAdminDashboardPath("applications", { status, limit: 1 }), { signal }),
  ));
  return { total: responses.reduce((sum, response) => sum + totalFrom(response), 0) };
}

export async function loadAdminDashboardLoans(fetcher: AdminDashboardFetcher = apiGet, signal?: AbortSignal): Promise<{ active: number }> {
  const response = await fetcher<unknown[]>(getAdminDashboardPath("loans", { status: "ACTIVE", limit: 1 }), { signal });
  return { active: totalFrom(response) };
}

export async function loadAdminDashboardPayouts(fetcher: AdminDashboardFetcher = apiGet, signal?: AbortSignal): Promise<{ pending: number }> {
  const response = await fetcher<unknown[]>(getAdminDashboardPath("payout-allocations", { limit: 1 }), { signal });
  return { pending: totalFrom(response) };
}

export async function loadAdminRecentRepayments(fetcher: AdminDashboardFetcher = apiGet, signal?: AbortSignal): Promise<AdminDashboardRepaymentRow[]> {
  const response = await fetcher<AdminDashboardRepaymentRow[]>(
    getAdminDashboardPath("repayments", { limit: 5, sortBy: "receivedAt", sortOrder: "desc" }),
    { signal },
  );
  return response.data;
}

export async function loadAdminRecentAuditLogs(fetcher: AdminDashboardFetcher = apiGet, signal?: AbortSignal): Promise<AdminDashboardAuditRow[]> {
  const response = await fetcher<AdminDashboardAuditRow[]>(
    getAdminDashboardPath("audit-logs", { limit: 5, sortBy: "createdAt", sortOrder: "desc" }),
    { signal },
  );
  return response.data;
}
