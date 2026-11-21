import { apiGet, type ApiPagination } from "./api-client";
import type { RoleWalletTransaction, WalletQuery } from "./borrower-wallet";

export interface InvestorWalletResult {
  wallet: null | { id: string; balanceSatang: string; currency: string; status: string; createdAt: string; updatedAt: string };
  transactions: RoleWalletTransaction[];
  pagination: ApiPagination;
}
export type InvestorWalletFetcher = <T>(path: string) => Promise<{ data: T }>;

export function getInvestorWalletPath(query: WalletQuery): string {
  return `/api/investor/wallet?${new URLSearchParams({ page: String(query.page), limit: String(query.limit), sortBy: "createdAt", sortOrder: query.sortOrder })}`;
}
export async function loadInvestorWallet(query: WalletQuery, fetcher: InvestorWalletFetcher = apiGet): Promise<InvestorWalletResult> {
  return (await fetcher<InvestorWalletResult>(getInvestorWalletPath(query))).data;
}
