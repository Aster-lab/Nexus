import { ApiClientError, apiGet, type ApiPagination, type ApiSuccessEnvelope } from "./api-client";
import { formatSatang as formatSatangAmount } from "./financial-format";
import type { BorrowerWalletResult } from "./borrower-wallet";

export const BORROWER_DASHBOARD_PATHS = {
  overview: "/api/borrower/dashboard/overview",
  summary: "/api/borrower/dashboard",
  applications: "/api/borrower/applications?page=1&limit=5&sortBy=createdAt&sortOrder=desc",
  loans: "/api/borrower/loans?page=1&limit=5&sortBy=createdAt&sortOrder=desc",
  repayments: "/api/borrower/repayments?page=1&limit=5&sortBy=receivedAt&sortOrder=desc",
  wallet: "/api/borrower/wallet?page=1&limit=5&sortBy=createdAt&sortOrder=desc",
} as const;

export const BORROWER_DASHBOARD_REFRESH_EVENT = "nexus:borrower-dashboard-refresh";
const DASHBOARD_CACHE_TTL_MS = 10_000;

const borrowerDashboardCache = new Map<string, {
  expiresAt: number;
  data: BorrowerDashboardData;
}>();

export type DashboardResource<T> =
  | { status: "loading" }
  | { status: "success"; data: T[]; pagination?: ApiPagination }
  | { status: "error"; message: string };

export type DashboardValueResource<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };

export interface BorrowerDashboardInstallment {
  loanId: string;
  installmentId: string;
  installmentNumber: number;
  dueDate: string;
  remainingBalanceSatang: string;
}

export interface BorrowerDashboardSummary {
  activeLoanCount: number;
  totalOutstandingBalanceSatang: string;
  pendingApplicationCount: number;
  availableOfferCount: number;
  nextInstallment: BorrowerDashboardInstallment | null;
  upcomingInstallments: BorrowerDashboardInstallment[];
  overdueInstallments: BorrowerDashboardInstallment[];
  activeLoans: Array<{
    loanId: string;
    outstandingBalanceSatang: string;
    nextDueDate: string | null;
  }>;
}

export interface BorrowerApplicationSummary {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  currentVersion: { versionNumber: number; requestedPrincipalSatang: string; requestedTermMonths: number } | null;
}

export interface BorrowerLoanSummary {
  id: string;
  status: string;
  principalSatang: string;
  fundedSatang: string;
  annualInterestRate: string;
  termMonths: number;
  createdAt: string;
}

export interface BorrowerRepaymentSummary {
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
  installment: { installmentNumber: number; dueDate: string };
  ledgerTransaction: { status: string; postedAt: string | null };
}

export interface BorrowerDashboardData {
  summary: DashboardValueResource<BorrowerDashboardSummary>;
  applications: DashboardResource<BorrowerApplicationSummary>;
  loans: DashboardResource<BorrowerLoanSummary>;
  repayments: DashboardResource<BorrowerRepaymentSummary>;
  wallet: DashboardValueResource<BorrowerWalletResult>;
}

export type DashboardResourceKey = keyof BorrowerDashboardData;
export type DashboardResourceUpdate = (
  key: DashboardResourceKey,
  resource: BorrowerDashboardData[DashboardResourceKey],
) => void;

export type DashboardFetcher = <T>(
  path: string,
  options?: { signal?: AbortSignal },
) => Promise<ApiSuccessEnvelope<T>>;

export function createInitialBorrowerDashboardData(): BorrowerDashboardData {
  return {
    summary: { status: "loading" },
    applications: { status: "loading" },
    loans: { status: "loading" },
    repayments: { status: "loading" },
    wallet: { status: "loading" },
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return "We could not load this section. Check your connection and retry.";
}

async function loadList<T>(path: string, fetcher: DashboardFetcher, signal?: AbortSignal): Promise<DashboardResource<T>> {
  try {
    const response = await fetcher<T>(path, { signal });
    if (!Array.isArray(response.data)) {
      return { status: "error", message: "The server returned an unexpected list response." };
    }
    return {
      status: "success",
      data: response.data as T[],
      ...(response.pagination ? { pagination: response.pagination } : {}),
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

async function loadSummary(fetcher: DashboardFetcher, signal?: AbortSignal): Promise<DashboardValueResource<BorrowerDashboardSummary>> {
  try {
    const response = await fetcher<BorrowerDashboardSummary>(BORROWER_DASHBOARD_PATHS.summary, { signal });
    if (!response.data || typeof response.data !== "object" || Array.isArray(response.data)) {
      return { status: "error", message: "The server returned an unexpected dashboard summary." };
    }
    return { status: "success", data: response.data };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

export async function loadBorrowerDashboardResource<K extends DashboardResourceKey>(
  key: K,
  fetcher: DashboardFetcher = apiGet,
  signal?: AbortSignal,
): Promise<BorrowerDashboardData[K]> {
  if (key === "summary") return await loadSummary(fetcher, signal) as BorrowerDashboardData[K];
  if (key === "wallet") {
    try {
      const response = await fetcher<BorrowerWalletResult>(BORROWER_DASHBOARD_PATHS.wallet, { signal });
      if (!response.data || typeof response.data !== "object" || !Array.isArray(response.data.transactions)) {
        return { status: "error", message: "The server returned an unexpected wallet response." } as BorrowerDashboardData[K];
      }
      return { status: "success", data: response.data } as BorrowerDashboardData[K];
    } catch (error) {
      return { status: "error", message: errorMessage(error) } as BorrowerDashboardData[K];
    }
  }
  return await loadList(
    BORROWER_DASHBOARD_PATHS[key],
    fetcher,
    signal,
  ) as BorrowerDashboardData[K];
}

export async function loadBorrowerDashboard(
  fetcher: DashboardFetcher = apiGet,
  signal?: AbortSignal,
  onResource?: DashboardResourceUpdate,
  cacheKey?: string,
): Promise<BorrowerDashboardData> {
  const keys: DashboardResourceKey[] = ["summary", "applications", "loans", "repayments", "wallet"];
  const cached = cacheKey ? borrowerDashboardCache.get(cacheKey) : undefined;
  if (cached && cached.expiresAt > Date.now()) {
    for (const key of keys) onResource?.(key, cached.data[key]);
    return cached.data;
  }
  if (cached && cacheKey) borrowerDashboardCache.delete(cacheKey);

  let data: BorrowerDashboardData;
  try {
    const response = await fetcher<BorrowerDashboardData>(BORROWER_DASHBOARD_PATHS.overview, { signal });
    const overview = response.data;
    if (!overview || typeof overview !== "object" ||
      !keys.every((key) => overview[key] && typeof overview[key] === "object" && "status" in overview[key])) {
      throw new ApiClientError(502, "INVALID_DASHBOARD_RESPONSE", "The server returned an unexpected dashboard response.");
    }
    data = overview;
  } catch (error) {
    const message = errorMessage(error);
    data = {
      summary: { status: "error", message },
      applications: { status: "error", message },
      loans: { status: "error", message },
      repayments: { status: "error", message },
      wallet: { status: "error", message },
    };
  }
  for (const key of keys) onResource?.(key, data[key]);
  if (cacheKey && !signal?.aborted && keys.every((key) => data[key].status === "success")) {
    borrowerDashboardCache.set(cacheKey, { expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS, data });
  }
  return data;
}

export function invalidateBorrowerDashboardCache(cacheKey?: string): void {
  if (cacheKey) borrowerDashboardCache.delete(cacheKey);
  else borrowerDashboardCache.clear();
}

export function notifyBorrowerDashboardMutationComplete(
  target: EventTarget | null = typeof window === "undefined" ? null : window,
): void {
  invalidateBorrowerDashboardCache();
  target?.dispatchEvent(new Event(BORROWER_DASHBOARD_REFRESH_EVENT));
}

export function subscribeBorrowerDashboardRefresh(
  refresh: () => void,
  target: EventTarget | null = typeof window === "undefined" ? null : window,
): () => void {
  if (!target) return () => undefined;
  const listener = () => refresh();
  target.addEventListener(BORROWER_DASHBOARD_REFRESH_EVENT, listener);
  return () => target.removeEventListener(BORROWER_DASHBOARD_REFRESH_EVENT, listener);
}

export function formatSatang(satang: string): string {
  return formatSatangAmount(satang);
}

export function formatDashboardDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}

export function formatDashboardStatus(value: string): string {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
