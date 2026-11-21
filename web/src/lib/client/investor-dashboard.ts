import { ApiClientError, apiGet, type ApiPagination, type ApiSuccessEnvelope } from "./api-client";

const RECENT_LIMIT = 5;

export const INVESTOR_DASHBOARD_PATHS = {
  portfolio: "/api/investor/portfolio",
  investments: `/api/investor/investments?page=1&limit=${RECENT_LIMIT}&sortBy=createdAt&sortOrder=desc`,
  payouts: `/api/investor/payouts?page=1&limit=${RECENT_LIMIT}&sortBy=createdAt&sortOrder=desc`,
} as const;

export const INVESTOR_DASHBOARD_REFRESH_EVENT = "nexus:investor-dashboard-refresh";

export type InvestorDashboardValue<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };

export type InvestorDashboardList<T> =
  | { status: "loading" }
  | { status: "success"; data: T[]; pagination?: ApiPagination }
  | { status: "error"; message: string };

export interface InvestorDashboardPortfolio {
  investorProfileId: string;
  investmentCounts: { active: number; completed: number };
  totalInvestedPrincipalSatang: string;
  principalReceivedSatang: string;
  interestReceivedSatang: string;
  outstandingPrincipalSatang: string;
  wallet: { balanceSatang: string; currency: string; status: string } | null;
}

export interface InvestorDashboardInvestment {
  id: string;
  status: string;
  createdAt: string;
  totalContributedSatang: string;
  loan: { id: string; status: string; principalSatang: string; annualInterestRate: string; termMonths: number };
  contributions: Array<{ id: string; amountSatang: string; createdAt: string; ledgerTransaction: { status: string } }>;
  payoutAllocation: Array<{ id: string; principalSatang: string; interestSatang: string }>;
}

export interface InvestorDashboardPayout {
  id: string;
  status: string;
  principalSatang: string;
  interestSatang: string;
  ledgerTransactionId: string | null;
  completedAt: string | null;
  createdAt: string;
  payoutAllocation: { id: string; repaymentId: string; investmentId: string };
}

export interface InvestorDashboardData {
  portfolio: InvestorDashboardValue<InvestorDashboardPortfolio>;
  investments: InvestorDashboardList<InvestorDashboardInvestment>;
  payouts: InvestorDashboardList<InvestorDashboardPayout>;
}

export type InvestorDashboardKey = keyof InvestorDashboardData;
export type InvestorDashboardFetcher = <T>(path: string, options?: { signal?: AbortSignal }) => Promise<ApiSuccessEnvelope<T>>;

export function createInitialInvestorDashboardData(): InvestorDashboardData {
  return { portfolio: { status: "loading" }, investments: { status: "loading" }, payouts: { status: "loading" } };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return "We could not load this section. Check your connection and retry.";
}

export async function loadInvestorDashboardResource<K extends InvestorDashboardKey>(
  key: K,
  fetcher: InvestorDashboardFetcher = apiGet,
  signal?: AbortSignal,
): Promise<InvestorDashboardData[K]> {
  const path = INVESTOR_DASHBOARD_PATHS[key];
  try {
    if (key === "portfolio") {
      const response = await fetcher<InvestorDashboardPortfolio>(path, { signal });
      if (!response.data || typeof response.data !== "object" || Array.isArray(response.data)) {
        return { status: "error", message: "The server returned an unexpected portfolio summary." } as InvestorDashboardData[K];
      }
      return { status: "success", data: response.data } as InvestorDashboardData[K];
    }
    const response = await fetcher<InvestorDashboardInvestment[] | InvestorDashboardPayout[]>(path, { signal });
    if (!Array.isArray(response.data)) {
      return { status: "error", message: "The server returned an unexpected list response." } as InvestorDashboardData[K];
    }
    return { status: "success", data: response.data, ...(response.pagination ? { pagination: response.pagination } : {}) } as InvestorDashboardData[K];
  } catch (error) {
    return { status: "error", message: errorMessage(error) } as InvestorDashboardData[K];
  }
}

export async function loadInvestorDashboard(
  fetcher: InvestorDashboardFetcher = apiGet,
  signal?: AbortSignal,
  onResource?: <K extends InvestorDashboardKey>(key: K, resource: InvestorDashboardData[K]) => void,
): Promise<InvestorDashboardData> {
  const keys: InvestorDashboardKey[] = ["portfolio", "investments", "payouts"];
  const entries = await Promise.all(keys.map(async (key) => {
    const resource = await loadInvestorDashboardResource(key, fetcher, signal);
    onResource?.(key, resource);
    return [key, resource] as const;
  }));
  return Object.assign(createInitialInvestorDashboardData(), Object.fromEntries(entries));
}

export function notifyInvestorDashboardMutationComplete(
  target: EventTarget | null = typeof window === "undefined" ? null : window,
): void {
  target?.dispatchEvent(new Event(INVESTOR_DASHBOARD_REFRESH_EVENT));
}

export function subscribeInvestorDashboardRefresh(
  refresh: () => void,
  target: EventTarget | null = typeof window === "undefined" ? null : window,
): () => void {
  if (!target) return () => undefined;
  target.addEventListener(INVESTOR_DASHBOARD_REFRESH_EVENT, refresh);
  return () => target.removeEventListener(INVESTOR_DASHBOARD_REFRESH_EVENT, refresh);
}
