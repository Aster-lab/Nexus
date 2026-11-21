import { apiGet, type ApiPagination, type ApiSuccessEnvelope } from "./api-client";

export const DEFAULT_INVESTOR_PORTFOLIO_PAGE_SIZE = 10;

export interface InvestorInvestmentContribution {
  id: string;
  amountSatang: string;
  createdAt: string;
  ledgerTransaction: { id: string; status: string };
}

export interface InvestorInvestmentPayout {
  id: string;
  status: string;
  principalSatang: string;
  interestSatang: string;
  ledgerTransactionId: string | null;
  completedAt: string | null;
}

export interface InvestorInvestmentAllocation {
  id: string;
  principalSatang: string;
  interestSatang: string;
  recoverySatang: string;
  repaymentId: string;
  investorPayout: InvestorInvestmentPayout | null;
}

export interface InvestorInvestmentListRecord {
  id: string;
  status: string;
  createdAt: string;
  totalContributedSatang: string;
  contributionCount?: number;
  hasMoreContributions?: boolean;
  payoutAllocationCount?: number;
  hasMorePayoutAllocations?: boolean;
  loan: { id: string; status: string; principalSatang: string; annualInterestRate: string; termMonths: number };
  contributions: InvestorInvestmentContribution[];
  payoutAllocation: Array<{ id: string; principalSatang: string; interestSatang: string }>;
}

export interface InvestorInvestmentRecord extends Omit<InvestorInvestmentListRecord, "payoutAllocation" | "contributionCount" | "hasMoreContributions" | "payoutAllocationCount" | "hasMorePayoutAllocations"> {
  payoutAllocation: InvestorInvestmentAllocation[];
  contributionCount: number;
  hasMoreContributions: boolean;
  allocationCount: number;
  hasMoreAllocations: boolean;
  contributionPagination: ApiPagination;
  allocationPagination: ApiPagination;
}

export interface InvestorInvestmentHistoryQuery {
  contributionPage: number;
  allocationPage: number;
  contributionLimit?: number;
  allocationLimit?: number;
}

export interface InvestorInvestmentListQuery {
  page: number;
  limit: number;
  sortOrder: "asc" | "desc";
}

export type InvestorPortfolioFetcher = <T>(path: string, options?: { signal?: AbortSignal }) => Promise<ApiSuccessEnvelope<T>>;

export function getInvestorInvestmentsPath(query: InvestorInvestmentListQuery): string {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit), sortBy: "createdAt", sortOrder: query.sortOrder });
  return `/api/investor/investments?${params.toString()}`;
}

export function getInvestorInvestmentPath(investmentId: string, history?: InvestorInvestmentHistoryQuery): string {
  const base = `/api/investor/investments/${encodeURIComponent(investmentId)}`;
  if (!history) return base;
  const params = new URLSearchParams({
    contributionPage: String(history.contributionPage),
    contributionLimit: String(history.contributionLimit ?? 10),
    allocationPage: String(history.allocationPage),
    allocationLimit: String(history.allocationLimit ?? 10),
  });
  return `${base}?${params.toString()}`;
}

export async function loadInvestorInvestments(
  query: InvestorInvestmentListQuery,
  fetcher: InvestorPortfolioFetcher = apiGet,
  signal?: AbortSignal,
): Promise<ApiSuccessEnvelope<InvestorInvestmentListRecord[]>> {
  return fetcher<InvestorInvestmentListRecord[]>(getInvestorInvestmentsPath(query), signal ? { signal } : undefined);
}

export async function loadInvestorInvestment(
  investmentId: string,
  fetcher: InvestorPortfolioFetcher = apiGet,
  signal?: AbortSignal,
  history?: InvestorInvestmentHistoryQuery,
): Promise<ApiSuccessEnvelope<InvestorInvestmentRecord>> {
  return fetcher<InvestorInvestmentRecord>(getInvestorInvestmentPath(investmentId, history), signal ? { signal } : undefined);
}

export function hasInvestorInvestments(rows: readonly InvestorInvestmentListRecord[], pagination?: ApiPagination): boolean {
  return rows.length > 0 || (pagination?.total ?? 0) > 0;
}
