import { ApiClientError, apiGet, apiPost, type ApiPostOptions, type ApiSuccessEnvelope } from "./api-client";

export const REPAYMENT_HISTORY_PATH = "/api/borrower/repayments?page=1&limit=20&sortBy=receivedAt&sortOrder=desc";

export interface BorrowerPayableInstallment {
  installmentId: string;
  installmentNumber: number;
  dueDate: string;
  status: string;
  remainingPrincipalSatang: string;
  remainingInterestSatang: string;
  remainingBalanceSatang: string;
}

export interface BorrowerPayableSummary {
  loanId: string;
  scheduleVersionId: string;
  payableAmountSatang: string;
  installments: BorrowerPayableInstallment[];
}

export interface BorrowerRepaymentResult {
  loanId: string;
  ledgerTransactionId: string;
  totalSatang: string;
  repayments: Array<{
    installmentId: string;
    principalSatang: string;
    interestSatang: string;
    feeSatang: string;
    totalSatang: string;
  }>;
  receipt: {
    receiptId: string;
    loanId: string;
    ledgerTransactionId: string;
    status: string;
    receiptTimestamp: string;
    totalReceivedSatang: string;
    repaymentIds: string[];
    repayments: Array<{
      repaymentId: string;
      installmentId: string;
      installmentNumber: number;
      principalSatang: string;
      interestSatang: string;
      totalSatang: string;
      remainingBalanceSatang: string;
    }>;
  };
}

export interface BorrowerRepaymentHistoryItem {
  id: string;
  loanId: string;
  installmentId: string;
  ledgerTransactionId: string;
  principalSatang: string;
  interestSatang: string;
  totalSatang: string;
  status: string;
  receivedAt: string;
  installment: { installmentNumber: number; dueDate: string };
  ledgerTransaction: { status: string; postedAt: string | null };
}

export interface BorrowerWalletSnapshot {
  wallet: { id: string; balanceSatang: string; currency: string; status: string } | null;
}

export type RepaymentFetcher = <T>(path: string, options?: { signal?: AbortSignal }) => Promise<ApiSuccessEnvelope<T>>;
export type BorrowerRepaymentPoster = <T, TBody>(path: string, body: TBody, options?: ApiPostOptions) => Promise<ApiSuccessEnvelope<T>>;

export function getBorrowerPayablePath(loanId: string): string {
  return `/api/borrower/loans/${encodeURIComponent(loanId)}/payable`;
}

export function getRepaymentHistoryPath(): string {
  return REPAYMENT_HISTORY_PATH;
}

export function getPaginatedRepaymentHistoryPath(page: number, limit = 20): string {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), sortBy: "receivedAt", sortOrder: "desc" });
  return `/api/borrower/repayments?${params.toString()}`;
}

export async function loadBorrowerPayable(loanId: string, fetcher: RepaymentFetcher = apiGet): Promise<ApiSuccessEnvelope<BorrowerPayableSummary>> {
  return fetcher<BorrowerPayableSummary>(getBorrowerPayablePath(loanId));
}

export async function loadBorrowerRepaymentHistory(fetcher: RepaymentFetcher = apiGet): Promise<ApiSuccessEnvelope<BorrowerRepaymentHistoryItem[]>> {
  return fetcher<BorrowerRepaymentHistoryItem[]>(getRepaymentHistoryPath());
}

export async function loadBorrowerRepaymentHistoryPage(
  page: number,
  fetcher: RepaymentFetcher = apiGet,
): Promise<ApiSuccessEnvelope<BorrowerRepaymentHistoryItem[]>> {
  return fetcher<BorrowerRepaymentHistoryItem[]>(getPaginatedRepaymentHistoryPath(page));
}

export async function loadBorrowerWallet(fetcher: RepaymentFetcher = apiGet): Promise<ApiSuccessEnvelope<BorrowerWalletSnapshot>> {
  return fetcher<BorrowerWalletSnapshot>("/api/borrower/wallet");
}

export function parseRepaymentAmountToSatang(value: string): string | null {
  const normalized = value.trim();
  const valid = normalized.includes(",")
    ? /^(?:0|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(normalized)
    : /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized);
  if (!valid) return null;
  const [whole, fraction = ""] = normalized.replaceAll(",", "").split(".");
  try { return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))).toString(); }
  catch { return null; }
}

export type RepaymentAmountValidationCode = "REQUIRED" | "FORMAT" | "PRECISION" | "POSITIVE" | "ABOVE_PAYABLE" | "NOT_PAYABLE";

export function validateRepaymentAmount(value: string, payableAmountSatang: string): { code: RepaymentAmountValidationCode | null; amountSatang?: string } {
  if (!value.trim()) return { code: "REQUIRED" };
  if (/^-/.test(value.trim())) return { code: "FORMAT" };
  if (/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{3,})$/.test(value.trim())) return { code: "PRECISION" };
  const amountSatang = parseRepaymentAmountToSatang(value);
  if (amountSatang === null) return { code: "FORMAT" };
  if (BigInt(amountSatang) <= 0n) return { code: "POSITIVE" };
  if (!/^(0|[1-9]\d*)$/.test(payableAmountSatang) || BigInt(payableAmountSatang) <= 0n) return { code: "NOT_PAYABLE" };
  if (BigInt(amountSatang) > BigInt(payableAmountSatang)) return { code: "ABOVE_PAYABLE" };
  return { code: null, amountSatang };
}

export async function submitBorrowerRepayment(
  body: { loanId: string; amountSatang: string },
  idempotencyKey: string,
  poster: BorrowerRepaymentPoster = apiPost,
  options: Omit<ApiPostOptions, "idempotencyKey"> = {},
): Promise<ApiSuccessEnvelope<BorrowerRepaymentResult>> {
  return poster<BorrowerRepaymentResult, typeof body>("/api/borrower/repayments", body, { ...options, idempotencyKey });
}

export function isRepaymentOutcomeUncertain(error: unknown): boolean {
  if (error instanceof ApiClientError) return error.status === 0 || error.status >= 500;
  if (error instanceof Error && error.name === "AbortError") return true;
  // An unexpected response or client-side failure after posting began cannot prove rollback.
  return true;
}

export function createRepaymentSubmissionLock() {
  let active = false;
  return async function run<T>(operation: () => Promise<T>): Promise<{ submitted: false } | { submitted: true; result: T }> {
    if (active) return { submitted: false };
    active = true;
    try { return { submitted: true, result: await operation() }; }
    finally { active = false; }
  };
}
