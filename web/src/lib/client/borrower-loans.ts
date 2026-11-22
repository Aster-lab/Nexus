import { apiGet, apiPost, type ApiPagination, type ApiSuccessEnvelope } from "./api-client";

export const DEFAULT_BORROWER_LOANS_PAGE_SIZE = 10;

export interface BorrowerLoan {
  id: string;
  status: string;
  principalSatang: string;
  originalPrincipalSatang: string;
  fundedSatang: string;
  annualInterestRate: string;
  termMonths: number;
  fundingDeadline: string;
  fundedAt: string | null;
  disbursedAt: string | null;
  createdAt: string;
  outstandingPrincipalSatang: string | null;
  outstandingBalanceSatang: string | null;
  installmentCount: number;
}

export interface BorrowerLoanDetails extends BorrowerLoan {
  disbursementConsentAt: string | null;
  outstandingInterestSatang: string | null;
  paidPrincipalSatang: string | null;
  paidInterestSatang: string | null;
  totalPaidSatang: string | null;
  maturityDate: string | null;
  scheduleVersionId: string | null;
}

export interface BorrowerDisbursementConsentResult {
  loanId: string;
  confirmedAt: string;
  alreadyConfirmed: boolean;
}

export interface BorrowerScheduleInstallment {
  id: string;
  installmentNumber: number;
  dueDate: string;
  scheduledPaymentDate: string;
  openingPrincipalSatang: string;
  principalDueSatang: string;
  interestDueSatang: string;
  paidPrincipalSatang: string;
  paidInterestSatang: string;
  totalDueSatang: string;
  paidAmountSatang: string;
  remainingAmountSatang: string;
  lastPaidAt: string | null;
  status: string;
}

export interface BorrowerRepaymentSchedule {
  scheduleId: string;
  versionId: string;
  installmentCount: number;
  maturityDate: string | null;
  installments: BorrowerScheduleInstallment[];
}

export interface BorrowerLoanPage {
  page: number;
  limit: number;
  sortOrder: "asc" | "desc";
}

export type BorrowerLoanFetcher = <T>(
  path: string,
  options?: { signal?: AbortSignal },
) => Promise<ApiSuccessEnvelope<T>>;

export function getBorrowerLoansPath(page: BorrowerLoanPage): string {
  const params = new URLSearchParams({
    page: String(page.page),
    limit: String(page.limit),
    sortBy: "createdAt",
    sortOrder: page.sortOrder,
  });
  return `/api/borrower/loans?${params.toString()}`;
}

export function getBorrowerLoanPath(loanId: string): string {
  return `/api/borrower/loans/${encodeURIComponent(loanId)}`;
}

export function getBorrowerSchedulePath(loanId: string): string {
  return `${getBorrowerLoanPath(loanId)}/schedule`;
}

export async function loadBorrowerLoans(
  page: BorrowerLoanPage,
  fetcher: BorrowerLoanFetcher = apiGet,
  signal?: AbortSignal,
): Promise<ApiSuccessEnvelope<BorrowerLoan[]>> {
  return fetcher<BorrowerLoan[]>(getBorrowerLoansPath(page), signal ? { signal } : undefined);
}

export async function loadBorrowerLoan(
  loanId: string,
  fetcher: BorrowerLoanFetcher = apiGet,
  signal?: AbortSignal,
): Promise<ApiSuccessEnvelope<BorrowerLoanDetails>> {
  return fetcher<BorrowerLoanDetails>(getBorrowerLoanPath(loanId), signal ? { signal } : undefined);
}

export async function loadBorrowerSchedule(
  loanId: string,
  fetcher: BorrowerLoanFetcher = apiGet,
  signal?: AbortSignal,
): Promise<ApiSuccessEnvelope<BorrowerRepaymentSchedule>> {
  return fetcher<BorrowerRepaymentSchedule>(getBorrowerSchedulePath(loanId), signal ? { signal } : undefined);
}

export async function confirmBorrowerDisbursement(
  loanId: string,
  fetcher: typeof fetch = fetch,
): Promise<ApiSuccessEnvelope<BorrowerDisbursementConsentResult>> {
  return apiPost<BorrowerDisbursementConsentResult, { confirmDisbursement: true }>(
    `${getBorrowerLoanPath(loanId)}/disbursement-consent`,
    { confirmDisbursement: true },
    { fetcher },
  );
}

export function hasBorrowerLoans(rows: readonly BorrowerLoan[], pagination?: ApiPagination): boolean {
  return rows.length > 0 || (pagination?.total ?? 0) > 0;
}
