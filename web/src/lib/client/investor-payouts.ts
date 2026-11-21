import { apiGet, type ApiPagination, type ApiSuccessEnvelope } from "./api-client";

export const DEFAULT_INVESTOR_PAYOUT_PAGE_SIZE = 10;

export interface InvestorPayoutAllocationReference {
  id: string;
  repaymentId: string;
  investmentId: string;
}

export interface InvestorPayoutRecord {
  id: string;
  status: string;
  principalSatang: string;
  interestSatang: string;
  ledgerTransactionId: string | null;
  completedAt: string | null;
  createdAt: string;
  payoutAllocation: InvestorPayoutAllocationReference;
}

export interface InvestorPayoutDetails extends Omit<InvestorPayoutRecord, "payoutAllocation"> {
  walletId: string;
  payoutAllocationId: string;
  payoutAllocation: {
    repaymentId: string;
    investmentId: string;
    repayment: { loanId: string; ledgerTransactionId: string };
  };
}

export interface InvestorPayoutsQuery {
  page: number;
  limit: number;
  sortOrder: "asc" | "desc";
}

export type InvestorPayoutFetcher = <T>(path: string, options?: { signal?: AbortSignal }) => Promise<ApiSuccessEnvelope<T>>;

export function getInvestorPayoutsPath(query: InvestorPayoutsQuery): string {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit), sortBy: "createdAt", sortOrder: query.sortOrder });
  return `/api/investor/payouts?${params.toString()}`;
}

export function getInvestorPayoutPath(payoutId: string): string {
  return `/api/investor/payouts/${encodeURIComponent(payoutId)}`;
}

export async function loadInvestorPayouts(
  query: InvestorPayoutsQuery,
  fetcher: InvestorPayoutFetcher = apiGet,
  signal?: AbortSignal,
): Promise<ApiSuccessEnvelope<InvestorPayoutRecord[]>> {
  return fetcher<InvestorPayoutRecord[]>(getInvestorPayoutsPath(query), signal ? { signal } : undefined);
}

export async function loadInvestorPayout(
  payoutId: string,
  fetcher: InvestorPayoutFetcher = apiGet,
  signal?: AbortSignal,
): Promise<ApiSuccessEnvelope<InvestorPayoutDetails>> {
  return fetcher<InvestorPayoutDetails>(getInvestorPayoutPath(payoutId), signal ? { signal } : undefined);
}

export function hasInvestorPayouts(rows: readonly InvestorPayoutRecord[], pagination?: ApiPagination): boolean {
  return rows.length > 0 || (pagination?.total ?? 0) > 0;
}

export function isCompletedInvestorPayout(payout: Pick<InvestorPayoutRecord, "status" | "ledgerTransactionId">): boolean {
  return payout.status === "COMPLETED" && payout.ledgerTransactionId !== null;
}
