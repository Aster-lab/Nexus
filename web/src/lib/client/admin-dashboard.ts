import { apiGet, type ApiPagination, type ApiSuccessEnvelope } from "./api-client";

export type AdminDashboardFetcher = <T>(path: string, options?: { signal?: AbortSignal }) => Promise<ApiSuccessEnvelope<T>>;
export type AdminDashboardResource = "users" | "applications" | "loans" | "repayments" | "payout-allocations" | "audit-logs";

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
