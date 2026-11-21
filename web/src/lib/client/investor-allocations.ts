import { apiGet, type ApiPagination, type ApiSuccessEnvelope } from "./api-client";

export const DEFAULT_INVESTOR_ALLOCATIONS_PAGE_SIZE = 10;

export interface InvestorAllocationRecord {
  id: string;
  principalSatang: string;
  interestSatang: string;
  recoverySatang: string;
  allocationMethod: string;
  createdAt: string;
  investmentId: string;
  repaymentId: string;
  repayment: { status: string; receivedAt: string; loanId: string; ledgerTransactionId: string };
  investorPayout: null | {
    id: string;
    status: string;
    principalSatang: string;
    interestSatang: string;
    ledgerTransactionId: string | null;
    completedAt: string | null;
  };
}

export interface InvestorAllocationsQuery {
  page: number;
  limit: number;
  sortOrder: "asc" | "desc";
}

export type InvestorAllocationsFetcher = <T>(path: string, options?: { signal?: AbortSignal }) => Promise<ApiSuccessEnvelope<T>>;

export function getInvestorAllocationsPath(query: InvestorAllocationsQuery): string {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit), sortBy: "createdAt", sortOrder: query.sortOrder });
  return `/api/investor/allocations?${params.toString()}`;
}

export async function loadInvestorAllocations(
  query: InvestorAllocationsQuery,
  fetcher: InvestorAllocationsFetcher = apiGet,
  signal?: AbortSignal,
): Promise<ApiSuccessEnvelope<InvestorAllocationRecord[]>> {
  return fetcher<InvestorAllocationRecord[]>(getInvestorAllocationsPath(query), signal ? { signal } : undefined);
}

export function hasInvestorAllocations(rows: readonly InvestorAllocationRecord[], pagination?: ApiPagination): boolean {
  return rows.length > 0 || (pagination?.total ?? 0) > 0;
}
