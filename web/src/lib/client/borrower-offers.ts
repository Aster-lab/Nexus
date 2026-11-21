import { apiGet, apiPost, type ApiPagination, type ApiPostOptions, type ApiSuccessEnvelope } from "./api-client";

export const DEFAULT_BORROWER_OFFERS_PAGE_SIZE = 10;

export interface BorrowerOffer {
  id: string;
  applicationId: string;
  principalSatang: string;
  annualInterestRate: string;
  termMonths: number;
  repaymentFrequency: string;
  expiresAt: string;
  status: string;
  isExpired: boolean;
  acceptedAt: string | null;
  createdAt: string;
  permissions: { canAccept: boolean };
}

export interface BorrowerOfferDetails extends BorrowerOffer {
  platformFee: {
    rateBasisPoints: number;
    calculationBasis: string;
    calculationTiming: string;
    walletDeduction: boolean;
    treatment: string;
    currency: string;
  };
  repaymentTerms: {
    calculationMethod: string;
    calculationFrequency: string;
    currency: string;
  };
  loanId: string | null;
}

export interface BorrowerOfferPage {
  page: number;
  limit: number;
  sortOrder: "asc" | "desc";
}

export type BorrowerOfferFetcher = <T>(
  path: string,
  options?: { signal?: AbortSignal },
) => Promise<ApiSuccessEnvelope<T>>;

export type BorrowerOfferPoster = <T, TBody>(
  path: string,
  body: TBody,
  options?: ApiPostOptions,
) => Promise<ApiSuccessEnvelope<T>>;

export interface BorrowerOfferAcceptanceResult {
  offerId: string;
  loanId: string;
  status: string;
  principalSatang: string;
  fundedSatang: string;
  annualInterestRate: string;
  termMonths: number;
  fundingDeadline: string;
}

export function getBorrowerOffersPath(page: BorrowerOfferPage): string {
  const params = new URLSearchParams({
    page: String(page.page),
    limit: String(page.limit),
    sortBy: "expiresAt",
    sortOrder: page.sortOrder,
  });
  return `/api/borrower/offers?${params.toString()}`;
}

export function getBorrowerOfferPath(offerId: string): string {
  return `/api/borrower/offers/${encodeURIComponent(offerId)}`;
}

export async function loadBorrowerOffers(
  page: BorrowerOfferPage,
  fetcher: BorrowerOfferFetcher = apiGet,
  signal?: AbortSignal,
): Promise<ApiSuccessEnvelope<BorrowerOffer[]>> {
  return fetcher<BorrowerOffer[]>(getBorrowerOffersPath(page), signal ? { signal } : undefined);
}

export async function loadBorrowerOffer(
  offerId: string,
  fetcher: BorrowerOfferFetcher = apiGet,
  signal?: AbortSignal,
): Promise<ApiSuccessEnvelope<BorrowerOfferDetails>> {
  return fetcher<BorrowerOfferDetails>(getBorrowerOfferPath(offerId), signal ? { signal } : undefined);
}

export async function acceptBorrowerOffer(
  offerId: string,
  poster: BorrowerOfferPoster = apiPost,
): Promise<ApiSuccessEnvelope<BorrowerOfferAcceptanceResult>> {
  return poster<BorrowerOfferAcceptanceResult, Record<string, never>>(getBorrowerOfferPath(offerId) + "/accept", {});
}

export function createOfferAcceptanceLock() {
  let active = false;
  return async function run<T>(operation: () => Promise<T>): Promise<{ accepted: false } | { accepted: true; result: T }> {
    if (active) return { accepted: false };
    active = true;
    try {
      return { accepted: true, result: await operation() };
    } finally {
      active = false;
    }
  };
}

export function hasBorrowerOfferRows(rows: readonly BorrowerOffer[], pagination?: ApiPagination): boolean {
  return rows.length > 0 || (pagination?.total ?? 0) > 0;
}

export function formatOfferDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
