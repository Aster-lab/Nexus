import { apiGet, type ApiPagination, type ApiSuccessEnvelope } from "./api-client";

export interface AdminRepaymentRecord {
  id: string;
  loanId: string;
  installmentId: string;
  ledgerTransactionId: string;
  principalSatang: string;
  interestSatang: string;
  feeSatang: string;
  totalSatang: string;
  status: "POSTED" | "REVERSED";
  receivedAt: string;
  createdAt: string;
  loan: { borrowerProfileId: string; status: string };
  installment: { installmentNumber: number; dueDate: string; status: string; paidPrincipalSatang: string; paidInterestSatang: string };
  payoutAllocationCount: number;
  ledgerTransaction: { status: string; postedAt: string | null };
}

export interface AdminRepaymentsQuery {
  page: number;
  limit: number;
  status: "ALL" | "POSTED" | "REVERSED";
  loanId: string;
  sortBy: "receivedAt" | "createdAt";
  sortOrder: "asc" | "desc";
}

export type AdminRepaymentFetcher = <T>(path: string, options?: { signal?: AbortSignal }) => Promise<ApiSuccessEnvelope<T>>;

export interface AdminRepaymentAllocationRecord {
  id: string;
  repaymentId: string;
  investmentId: string;
  principalSatang: string;
  interestSatang: string;
  recoverySatang: string;
  allocationMethod: string;
  createdAt: string;
}

export function getAdminRepaymentsPath(query: AdminRepaymentsQuery): string {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit), sortBy: query.sortBy, sortOrder: query.sortOrder });
  if (query.status !== "ALL") params.set("status", query.status);
  if (query.loanId.trim()) params.set("loanId", query.loanId.trim());
  return `/api/admin/repayments?${params.toString()}`;
}

export async function loadAdminRepayments(query: AdminRepaymentsQuery, fetcher: AdminRepaymentFetcher = apiGet, signal?: AbortSignal): Promise<ApiSuccessEnvelope<AdminRepaymentRecord[]>> {
  return fetcher<AdminRepaymentRecord[]>(getAdminRepaymentsPath(query), signal ? { signal } : undefined);
}

export function getAdminRepaymentAllocationsPath(repaymentId: string, page = 1, limit = 10): string {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return `/api/admin/repayments/${encodeURIComponent(repaymentId)}/allocations?${params.toString()}`;
}

export async function loadAdminRepaymentAllocations(repaymentId: string, page = 1, limit = 10, fetcher: AdminRepaymentFetcher = apiGet, signal?: AbortSignal): Promise<ApiSuccessEnvelope<AdminRepaymentAllocationRecord[]>> {
  return fetcher<AdminRepaymentAllocationRecord[]>(getAdminRepaymentAllocationsPath(repaymentId, page, limit), signal ? { signal } : undefined);
}

export function getAdminRepaymentsPagination(response: ApiSuccessEnvelope<unknown[]>): ApiPagination | undefined { return response.pagination; }

export function isValidAdminLoanIdFilter(value: string): boolean {
  return value.trim() === "" || /^[0-9a-f-]{36}$/i.test(value.trim());
}
