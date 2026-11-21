import { ApiClientError, apiGet, type ApiPagination, type ApiSuccessEnvelope } from "./api-client";
import { formatSatang as formatSatangAmount } from "./financial-format";

export const BORROWER_DASHBOARD_PATHS = {
  summary: "/api/borrower/dashboard",
  applications: "/api/borrower/applications?page=1&limit=5&sortBy=createdAt&sortOrder=desc",
  loans: "/api/borrower/loans?page=1&limit=5&sortBy=createdAt&sortOrder=desc",
  repayments: "/api/borrower/repayments?page=1&limit=5&sortBy=receivedAt&sortOrder=desc",
} as const;

export const BORROWER_DASHBOARD_REFRESH_EVENT = "nexus:borrower-dashboard-refresh";

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
): Promise<BorrowerDashboardData> {
  const keys: DashboardResourceKey[] = ["summary", "applications", "loans", "repayments"];
  const entries = await Promise.all(keys.map(async (key) => {
    const resource = await loadBorrowerDashboardResource(key, fetcher, signal);
    onResource?.(key, resource);
    return [key, resource] as const;
  }));
  return Object.assign(createInitialBorrowerDashboardData(), Object.fromEntries(entries));
}

export function notifyBorrowerDashboardMutationComplete(
  target: EventTarget | null = typeof window === "undefined" ? null : window,
): void {
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
