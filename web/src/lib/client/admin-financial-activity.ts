import { apiGet, type ApiPagination } from "./api-client";

export type AdminWalletQuery = { page: number; limit: number; status: "ALL" | "ACTIVE" | "RESTRICTED" | "CLOSED"; currency: string; ownerUserId: string; ownerPlatformAccountId: string; sortBy: "createdAt" | "balanceSatang"; sortOrder: "asc" | "desc" };
export type AdminLedgerQuery = { page: number; limit: number; status: "ALL" | "DRAFT" | "POSTED" | "REVERSED"; transactionType: string; referenceType: string; referenceId: string; sortBy: "createdAt" | "postedAt"; sortOrder: "asc" | "desc" };
export interface AdminWalletRow {
  id: string; currency: string; balanceSatang: string; status: string; createdAt: string; updatedAt: string;
  ownerUser: null | { id: string; email: string; borrowerProfile: null | { legalName: string }; investorProfile: null | { id: string; displayName: string } };
  ownerPlatformAccount: null | { id: string; accountCode: string; accountName: string; accountType: string; status: string };
  openingBalance: null | { id: string; amountSatang: string; postedAt: string; reason: string };
}
export interface AdminLedgerEntryRow {
  id: string; walletId: string | null; platformAccountId: string | null; entryType: string; amountSatang: string; currency: string;
  wallet: null | { ownerUser: null | { id: string; email: string }; ownerPlatformAccount: null | { accountCode: string; accountName: string } };
  platformAccount: null | { accountCode: string; accountName: string };
  accountMappings: Array<{ entryType: string; amountSatang: string; platformAccount: { accountCode: string; accountName: string } }>;
}
export interface AdminLedgerTransactionRow {
  id: string; transactionType: string; status: string; referenceType: string | null; referenceId: string | null; description: string; createdAt: string; postedAt: string | null; reversedTransactionId: string | null; entries: AdminLedgerEntryRow[];
}
export type AdminFinancialFetcher = <T>(path: string) => Promise<{ data: T; pagination?: ApiPagination }>;

export function getAdminWalletsPath(query: AdminWalletQuery): string {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit), sortBy: query.sortBy, sortOrder: query.sortOrder });
  if (query.status !== "ALL") params.set("status", query.status);
  if (query.currency.trim()) params.set("currency", query.currency.trim().toUpperCase());
  if (query.ownerUserId.trim()) params.set("ownerUserId", query.ownerUserId.trim());
  if (query.ownerPlatformAccountId.trim()) params.set("ownerPlatformAccountId", query.ownerPlatformAccountId.trim());
  return `/api/admin/wallets?${params}`;
}
export function getAdminLedgerTransactionsPath(query: AdminLedgerQuery): string {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit), sortBy: query.sortBy, sortOrder: query.sortOrder });
  if (query.status !== "ALL") params.set("status", query.status);
  if (query.transactionType.trim()) params.set("transactionType", query.transactionType.trim());
  if (query.referenceType.trim()) params.set("referenceType", query.referenceType.trim());
  if (query.referenceId.trim()) params.set("referenceId", query.referenceId.trim());
  return `/api/admin/ledger-transactions?${params}`;
}
export async function loadAdminWallets(query: AdminWalletQuery, fetcher: AdminFinancialFetcher = apiGet) {
  const response = await fetcher<AdminWalletRow[]>(getAdminWalletsPath(query));
  return { data: response.data, pagination: response.pagination };
}
export async function loadAdminLedgerTransactions(query: AdminLedgerQuery, fetcher: AdminFinancialFetcher = apiGet) {
  const response = await fetcher<AdminLedgerTransactionRow[]>(getAdminLedgerTransactionsPath(query));
  return { data: response.data, pagination: response.pagination };
}
