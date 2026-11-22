import { apiGet, type ApiPagination, type ApiSuccessEnvelope } from "./api-client";

export const DEFAULT_INVESTOR_MARKETPLACE_PAGE_SIZE = 10;

export interface InvestorMarketplaceOpportunity {
  id: string;
  status: string;
  principalSatang: string;
  fundedSatang: string;
  remainingFundingSatang: string;
  annualInterestRate: string;
  termMonths: number;
  fundingDeadline: string;
  createdAt: string;
  borrowerOverview?: {
    loanPurpose: string;
    employmentCategory: string;
    roleTenureBand: string | null;
    companyName: string | null;
    companyType: string | null;
  } | null;
}

export interface InvestorMarketplacePage {
  page: number;
  limit: number;
  sortBy: "createdAt" | "fundingDeadline";
  sortOrder: "asc" | "desc";
}

export type InvestorMarketplaceFetcher = <T>(path: string, options?: { signal?: AbortSignal }) => Promise<ApiSuccessEnvelope<T>>;

export function getInvestorMarketplacePath(query: InvestorMarketplacePage): string {
  const params = new URLSearchParams({
    page: String(query.page),
    limit: String(query.limit),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
  return `/api/investor/marketplace?${params.toString()}`;
}

export function getInvestorMarketplaceDetailPath(loanId: string): string {
  return `/api/investor/marketplace/${encodeURIComponent(loanId)}`;
}

export async function loadInvestorMarketplace(
  query: InvestorMarketplacePage,
  fetcher: InvestorMarketplaceFetcher = apiGet,
  signal?: AbortSignal,
): Promise<ApiSuccessEnvelope<InvestorMarketplaceOpportunity[]>> {
  return fetcher<InvestorMarketplaceOpportunity[]>(getInvestorMarketplacePath(query), signal ? { signal } : undefined);
}

export async function loadInvestorMarketplaceDetail(
  loanId: string,
  fetcher: InvestorMarketplaceFetcher = apiGet,
  signal?: AbortSignal,
): Promise<ApiSuccessEnvelope<InvestorMarketplaceOpportunity>> {
  return fetcher<InvestorMarketplaceOpportunity>(getInvestorMarketplaceDetailPath(loanId), signal ? { signal } : undefined);
}

export function hasMarketplaceOpportunities(rows: readonly InvestorMarketplaceOpportunity[], pagination?: ApiPagination): boolean {
  return rows.length > 0 || (pagination?.total ?? 0) > 0;
}
