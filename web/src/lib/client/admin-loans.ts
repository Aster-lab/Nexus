import { apiGet, apiPost, type ApiPagination, type ApiPostOptions, type ApiSuccessEnvelope } from "./api-client";

export const ADMIN_LOAN_STATUSES = ["FUNDING", "FUNDED", "ACTIVE", "DELINQUENT", "DEFAULTED", "REPAID", "CANCELLED"] as const;

export interface AdminLoanListItem {
  id: string;
  status: typeof ADMIN_LOAN_STATUSES[number];
  principalSatang: string;
  fundedSatang: string;
  annualInterestRate: string;
  termMonths: number;
  fundingDeadline: string;
  fundedAt: string | null;
  disbursedAt: string | null;
  createdAt: string;
  borrowerProfile: { id: string; legalName: string };
}

export interface AdminLoanDetails extends AdminLoanListItem {
  disbursementConsentAt: string | null;
  borrowerProfile: AdminLoanListItem["borrowerProfile"] & { phone: string | null; user: { id: string; email: string; accountStatus: string } };
  escrowAccount: null | { id: string; status: string; heldSatang: string; platformWalletId: string };
  statusHistory: Array<{ previousStatus: string | null; newStatus: string; reason: string; changedByUserId: string; createdAt: string }>;
}

export interface AdminLoanFunding {
  loanId: string;
  status: string;
  principalSatang: string;
  fundedSatang: string;
  remainingFundingSatang: string;
  fundingDeadline: string;
  fundedAt: string | null;
  escrow: null | {
    id: string;
    status: string;
    heldSatang: string;
    platformWalletId: string;
    transactions: Array<{ id: string; type: string; amountSatang: string; ledgerTransactionId: string; createdAt: string }>;
  };
}

export interface AdminLoanRepayment {
  id: string;
  loanId: string;
  installmentId: string;
  ledgerTransactionId: string;
  principalSatang: string;
  interestSatang: string;
  feeSatang: string;
  totalSatang: string;
  status: string;
  receivedAt: string;
  installment: { installmentNumber: number; dueDate: string; status: string; paidPrincipalSatang: string; paidInterestSatang: string };
  payoutAllocations: Array<{ id: string; investmentId: string; principalSatang: string; interestSatang: string; recoverySatang: string }>;
  ledgerTransaction: { status: string; postedAt: string | null };
}

export interface AdminLoansQuery {
  page: number;
  limit: number;
  status: "ALL" | typeof ADMIN_LOAN_STATUSES[number];
  sortBy: "createdAt" | "fundingDeadline" | "principalSatang";
  sortOrder: "asc" | "desc";
}

export type AdminLoanFetcher = <T>(path: string, options?: { signal?: AbortSignal }) => Promise<ApiSuccessEnvelope<T>>;
export type AdminLoanPoster = <T, TBody>(path: string, body: TBody, options?: ApiPostOptions) => Promise<ApiSuccessEnvelope<T>>;

export function getAdminLoansPath(query: AdminLoansQuery): string {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit), sortBy: query.sortBy, sortOrder: query.sortOrder });
  if (query.status !== "ALL") params.set("status", query.status);
  return `/api/admin/loans?${params.toString()}`;
}

export function getAdminLoanPath(loanId: string): string { return `/api/admin/loans/${encodeURIComponent(loanId)}`; }
export function getAdminLoanFundingPath(loanId: string): string { return `${getAdminLoanPath(loanId)}/funding`; }
export function getAdminLoanDisbursementPath(loanId: string): string { return `${getAdminLoanPath(loanId)}/disburse`; }
export function getAdminLoanRepaymentsPath(loanId: string, limit = 20): string {
  const params = new URLSearchParams({ page: "1", limit: String(limit), sortBy: "receivedAt", sortOrder: "desc", loanId });
  return `/api/admin/repayments?${params.toString()}`;
}

export async function loadAdminLoans(query: AdminLoansQuery, fetcher: AdminLoanFetcher = apiGet, signal?: AbortSignal) {
  return fetcher<AdminLoanListItem[]>(getAdminLoansPath(query), signal ? { signal } : undefined);
}

export async function loadAdminLoan(loanId: string, fetcher: AdminLoanFetcher = apiGet, signal?: AbortSignal) {
  return fetcher<AdminLoanDetails>(getAdminLoanPath(loanId), signal ? { signal } : undefined);
}

export async function loadAdminLoanFunding(loanId: string, fetcher: AdminLoanFetcher = apiGet, signal?: AbortSignal) {
  return fetcher<AdminLoanFunding>(getAdminLoanFundingPath(loanId), signal ? { signal } : undefined);
}

export async function loadAdminLoanRepayments(loanId: string, fetcher: AdminLoanFetcher = apiGet, signal?: AbortSignal): Promise<ApiSuccessEnvelope<AdminLoanRepayment[]>> {
  return fetcher<AdminLoanRepayment[]>(getAdminLoanRepaymentsPath(loanId), signal ? { signal } : undefined);
}

export async function requestAdminLoanDisbursement(
  loanId: string,
  reason: string,
  idempotencyKey: string,
  poster: AdminLoanPoster = apiPost,
): Promise<ApiSuccessEnvelope<{ loanId: string; ledgerTransactionId: string; status: string; postedAt: string }>> {
  return poster(getAdminLoanDisbursementPath(loanId), { reason }, { idempotencyKey });
}

export function canAdminDisburseLoan(status: string, borrowerConsentAt: string | null): boolean {
  return status === "FUNDED" && borrowerConsentAt !== null;
}

export function getAdminLoanPagination(response: ApiSuccessEnvelope<unknown[]>): ApiPagination | undefined { return response.pagination; }
