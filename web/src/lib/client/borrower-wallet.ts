import { apiGet, type ApiPagination } from "./api-client";

export interface RoleWalletTransaction {
  ledgerEntryId: string; ledgerTransactionId: string; transactionType: string; referenceType: string | null; referenceId: string | null;
  description: string; direction: "DEBIT" | "CREDIT"; amountSatang: string; currency: string; status: string; postedAt: string | null;
  repayments?: Array<{ id: string; loanId: string; status: string }>;
}
export interface BorrowerWalletResult {
  wallet: null | { id: string; balanceSatang: string; currency: string; status: string; createdAt: string; updatedAt: string };
  transactions: RoleWalletTransaction[];
  pagination?: ApiPagination;
}
export type WalletQuery = { page: number; limit: number; sortOrder: "asc" | "desc" };
export type WalletFetcher = <T>(path: string) => Promise<{ data: T }>;

export function getBorrowerWalletPath(query: WalletQuery): string {
  return `/api/borrower/wallet?${new URLSearchParams({ page: String(query.page), limit: String(query.limit), sortBy: "createdAt", sortOrder: query.sortOrder })}`;
}
export async function loadBorrowerWallet(query: WalletQuery, fetcher: WalletFetcher = apiGet): Promise<BorrowerWalletResult> {
  const response = await fetcher<BorrowerWalletResult>(getBorrowerWalletPath(query));
  return response.data;
}
