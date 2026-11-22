import { apiGet, type ApiPagination, type ApiSuccessEnvelope } from "./api-client";

export const ADMIN_APPLICATION_STATUSES = [
  "DRAFT", "SUBMITTED", "UNDER_REVIEW", "INFORMATION_REQUESTED", "APPROVED", "REJECTED", "WITHDRAWN", "CLOSED",
] as const;

export interface AdminApplicationListItem {
  id: string;
  status: typeof ADMIN_APPLICATION_STATUSES[number];
  borrowerProfileId: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  currentVersion: null | {
    id: string;
    versionNumber: number;
    requestedPrincipalSatang: string;
    requestedTermMonths: number;
    submittedAt: string | null;
  };
}

export interface AdminApplicationDetails extends AdminApplicationListItem {
  closedAt: string | null;
  borrowerProfile: {
    id: string;
    legalName: string;
    phone: string | null;
    user: { id: string; email: string; accountStatus: string };
  };
  currentVersion: null | AdminApplicationListItem["currentVersion"] & {
    submittedData: unknown;
  };
  financialReviews: Array<{
    id: string;
    decision: string;
    reason: string;
    notes: string | null;
    reviewerUserId: string;
    createdAt: string;
  }>;
  informationRequests: Array<{ id: string; status: string; requestDetails: unknown; dueAt: string | null; createdAt: string }>;
  loanOffers: Array<{
    id: string;
    status: "ISSUED" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";
    principalSatang: string;
    annualInterestRate: string;
    termMonths: number;
    expiresAt: string;
    createdAt: string;
    loan: { id: string; status: string } | null;
  }>;
}

export interface AdminApplicationsQuery {
  page: number;
  limit: number;
  status: "ALL" | typeof ADMIN_APPLICATION_STATUSES[number];
  sortBy: "createdAt" | "updatedAt" | "submittedAt";
  sortOrder: "asc" | "desc";
}

export type AdminApplicationFetcher = <T>(path: string, options?: { signal?: AbortSignal }) => Promise<ApiSuccessEnvelope<T>>;

export function getAdminApplicationsPath(query: AdminApplicationsQuery): string {
  const params = new URLSearchParams({
    page: String(query.page),
    limit: String(query.limit),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
  if (query.status !== "ALL") params.set("status", query.status);
  return `/api/admin/applications?${params.toString()}`;
}

export function getAdminApplicationPath(applicationId: string): string {
  return `/api/admin/applications/${encodeURIComponent(applicationId)}`;
}

export async function loadAdminApplications(
  query: AdminApplicationsQuery,
  fetcher: AdminApplicationFetcher = apiGet,
  signal?: AbortSignal,
): Promise<ApiSuccessEnvelope<AdminApplicationListItem[]>> {
  return fetcher<AdminApplicationListItem[]>(getAdminApplicationsPath(query), signal ? { signal } : undefined);
}

export async function loadAdminApplication(
  applicationId: string,
  fetcher: AdminApplicationFetcher = apiGet,
  signal?: AbortSignal,
): Promise<ApiSuccessEnvelope<AdminApplicationDetails>> {
  return fetcher<AdminApplicationDetails>(getAdminApplicationPath(applicationId), signal ? { signal } : undefined);
}

export function isAdminApplicationReviewable(status: string): boolean {
  return status === "SUBMITTED" || status === "UNDER_REVIEW";
}

export function getAdminApplicationReviewabilityMessage(status: string): string {
  if (isAdminApplicationReviewable(status)) return "A final decision is available for this submitted application.";
  return "This application is not in a state that accepts a final decision.";
}

export function getAdminApplicationPagination(response: ApiSuccessEnvelope<unknown[]>): ApiPagination | undefined {
  return response.pagination;
}
