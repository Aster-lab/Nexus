import { apiGet, apiPost, type ApiPagination, type ApiPostOptions, type ApiSuccessEnvelope } from "./api-client";

export const ADMIN_PAYOUT_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const;

export interface AdminPayoutEligibility { canProcess: boolean; code: string | null; message: string | null }

export interface AdminPendingPayoutAllocation {
  id: string;
  principalSatang: string;
  interestSatang: string;
  recoverySatang: string;
  amountSatang: string;
  allocationMethod: string;
  createdAt: string;
  investor: { investorProfileId: string; userId: string; displayName: string; status: string; walletStatus: string | null; walletCurrency: string | null };
  investment: { id: string; loanId: string };
  repayment: {
    id: string;
    loanId: string;
    status: string;
    receivedAt: string;
    ledgerTransaction: { id: string; status: string; postedAt: string | null };
    installment: { id: string; installmentNumber: number; dueDate: string };
  };
  eligibility: AdminPayoutEligibility;
}

export interface AdminPayoutRecord {
  id: string;
  investorProfileId: string;
  walletId: string;
  payoutAllocationId: string;
  principalSatang: string;
  interestSatang: string;
  status: typeof ADMIN_PAYOUT_STATUSES[number];
  ledgerTransactionId: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface AdminPayoutQueueQuery { page: number; limit: number; sortOrder: "asc" | "desc" }
export interface AdminPayoutHistoryQuery {
  page: number;
  limit: number;
  status: "ALL" | typeof ADMIN_PAYOUT_STATUSES[number];
  investorProfileId: string;
  sortBy: "createdAt" | "completedAt";
  sortOrder: "asc" | "desc";
}

export type AdminPayoutFetcher = <T>(path: string, options?: { signal?: AbortSignal }) => Promise<ApiSuccessEnvelope<T>>;
export type AdminPayoutPoster = <T, TBody>(path: string, body: TBody, options?: ApiPostOptions) => Promise<ApiSuccessEnvelope<T>>;

export function getAdminPendingPayoutAllocationsPath(query: AdminPayoutQueueQuery): string {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit), sortBy: "createdAt", sortOrder: query.sortOrder });
  return `/api/admin/payout-allocations?${params.toString()}`;
}

export function getAdminPayoutsPath(query: AdminPayoutHistoryQuery): string {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit), sortBy: query.sortBy, sortOrder: query.sortOrder });
  if (query.status !== "ALL") params.set("status", query.status);
  if (query.investorProfileId.trim()) params.set("investorProfileId", query.investorProfileId.trim());
  return `/api/admin/payouts?${params.toString()}`;
}

export async function loadAdminPendingPayoutAllocations(query: AdminPayoutQueueQuery, fetcher: AdminPayoutFetcher = apiGet, signal?: AbortSignal): Promise<ApiSuccessEnvelope<AdminPendingPayoutAllocation[]>> {
  return fetcher<AdminPendingPayoutAllocation[]>(getAdminPendingPayoutAllocationsPath(query), signal ? { signal } : undefined);
}

export async function loadAdminPayouts(query: AdminPayoutHistoryQuery, fetcher: AdminPayoutFetcher = apiGet, signal?: AbortSignal): Promise<ApiSuccessEnvelope<AdminPayoutRecord[]>> {
  return fetcher<AdminPayoutRecord[]>(getAdminPayoutsPath(query), signal ? { signal } : undefined);
}

export async function processAdminPayout(
  payoutAllocationId: string,
  idempotencyKey: string,
  poster: AdminPayoutPoster = apiPost,
): Promise<ApiSuccessEnvelope<{ investorPayoutId: string; payoutAllocationId: string; ledgerTransactionId: string; amountSatang: string; status: string }>> {
  return poster("/api/admin/payouts", { payoutAllocationId }, { idempotencyKey });
}

export function canAdminProcessPayout(eligibility: AdminPayoutEligibility): boolean { return eligibility.canProcess && eligibility.code === null; }
export function getAdminPayoutHistoryPagination(response: ApiSuccessEnvelope<unknown[]>): ApiPagination | undefined { return response.pagination; }
