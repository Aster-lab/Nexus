import { ApiClientError, apiGet, apiPatch, apiPost, type ApiPagination, type ApiPostOptions, type ApiSuccessEnvelope } from "./api-client";
import type { ApplicationSnapshot } from "../contracts/application";

export const BORROWER_APPLICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "INFORMATION_REQUESTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
  "CLOSED",
] as const;

export const BORROWER_APPLICATION_TERMS = [3, 6, 9, 12, 18, 24] as const;
export const MIN_APPLICATION_AMOUNT_SATANG = 100_000;
export const MAX_APPLICATION_AMOUNT_SATANG = 5_000_000;
export const DEFAULT_APPLICATION_PAGE_SIZE = 10;

export interface BorrowerApplicationFormValues {
  legalName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  countryCode: string;
  employmentStatus: string;
  employerName: string;
  occupation: string;
  monthsInRole: string;
  amountBaht: string;
  termMonths: string;
  purpose: string;
}

export type BorrowerApplicationFormErrors = Partial<Record<keyof BorrowerApplicationFormValues, string>>;

export interface BorrowerApplicationListItem {
  id: string;
  status: typeof BORROWER_APPLICATION_STATUSES[number];
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  currentVersion: null | {
    id: string;
    versionNumber: number;
    requestedPrincipalSatang: string;
    requestedTermMonths: number;
    purpose: string | null;
  };
}

export interface BorrowerApplicationDetails extends Omit<BorrowerApplicationListItem, "currentVersion"> {
  borrowerProfileId: string;
  createdAt: string;
  closedAt: string | null;
  permissions: { canEdit: boolean; canSubmit: boolean };
  currentVersion: null | {
    id: string;
    versionNumber: number;
    requestedPrincipalSatang: string;
    requestedTermMonths: number;
    submittedData: ApplicationSnapshot;
  };
  financialReviews: Array<{ id: string; decision: string; reason: string; createdAt: string }>;
  informationRequests: Array<{ id: string; requestDetails: unknown; status: string; createdAt: string }>;
}

export interface BorrowerApplicationListFilters {
  status: "ALL" | typeof BORROWER_APPLICATION_STATUSES[number];
  page: number;
  limit: number;
  sortOrder: "asc" | "desc";
}

export type BorrowerApplicationFetcher = <T>(
  path: string,
  options?: { signal?: AbortSignal },
) => Promise<ApiSuccessEnvelope<T>>;

export type BorrowerApplicationPoster = <T, TBody>(
  path: string,
  body: TBody,
  options?: ApiPostOptions,
) => Promise<ApiSuccessEnvelope<T>>;

export type BorrowerApplicationPatcher = <T, TBody>(
  path: string,
  body: TBody,
) => Promise<ApiSuccessEnvelope<T>>;

export function parseBahtAmountToSatang(value: string): bigint | null {
  const normalized = value.trim();
  const validAmount = normalized.includes(",")
    ? /^(?:0|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(normalized)
    : /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized);
  if (!validAmount) return null;

  const [whole, fraction = ""] = normalized.replaceAll(",", "").split(".");
  try {
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  } catch {
    return null;
  }
}

export function validateBorrowerApplicationForm(values: BorrowerApplicationFormValues): BorrowerApplicationFormErrors {
  const errors: BorrowerApplicationFormErrors = {};
  if (!values.legalName.trim()) errors.legalName = "Enter the borrower name required for the application.";
  if (!values.addressLine1.trim()) errors.addressLine1 = "Enter the primary address line.";
  if (!values.employmentStatus.trim()) errors.employmentStatus = "Enter the employment status required by the application.";

  const amountSatang = parseBahtAmountToSatang(values.amountBaht);
  if (amountSatang === null) {
    errors.amountBaht = "Enter an amount in THB with up to two decimal places.";
  } else if (amountSatang < BigInt(MIN_APPLICATION_AMOUNT_SATANG)) {
    errors.amountBaht = "The requested amount must be at least ฿1,000.";
  } else if (amountSatang > BigInt(MAX_APPLICATION_AMOUNT_SATANG)) {
    errors.amountBaht = "The requested amount cannot exceed ฿50,000.";
  }

  if (!BORROWER_APPLICATION_TERMS.some((term) => String(term) === values.termMonths)) {
    errors.termMonths = "Choose one of the available loan terms.";
  }
  if (!values.purpose.trim()) errors.purpose = "Enter the purpose for this loan request.";

  if (values.monthsInRole.trim() && !/^(0|[1-9]\d*)$/.test(values.monthsInRole.trim())) {
    errors.monthsInRole = "Enter a whole number of months or leave this field blank.";
  } else if (values.monthsInRole.trim() && !Number.isSafeInteger(Number(values.monthsInRole))) {
    errors.monthsInRole = "Enter a safe whole-number month value.";
  }
  return errors;
}

function nullableText(value: string): string | null {
  const normalized = value.trim();
  return normalized || null;
}

export function buildBorrowerApplicationSnapshot(values: BorrowerApplicationFormValues): ApplicationSnapshot {
  const errors = validateBorrowerApplicationForm(values);
  if (Object.keys(errors).length > 0) throw new TypeError("Correct the application fields before continuing.");
  const amountSatang = parseBahtAmountToSatang(values.amountBaht);
  if (amountSatang === null) throw new TypeError("The requested amount is invalid.");

  return {
    schema_version: "application_snapshot.v1",
    borrower: {
      legal_name: values.legalName.trim(),
      phone: nullableText(values.phone),
      address: {
        line1: values.addressLine1.trim(),
        line2: nullableText(values.addressLine2),
        subdistrict: nullableText(values.subdistrict),
        district: nullableText(values.district),
        province: nullableText(values.province),
        postal_code: nullableText(values.postalCode),
        country_code: nullableText(values.countryCode),
      },
    },
    employment: {
      employment_status: values.employmentStatus.trim(),
      employer_name: nullableText(values.employerName),
      occupation: nullableText(values.occupation),
      months_in_role: values.monthsInRole.trim() ? Number(values.monthsInRole) : null,
    },
    requested_loan: {
      purpose: values.purpose,
      amount_satang: Number(amountSatang),
      term_months: Number(values.termMonths),
    },
  };
}

export function getApplicationListPath(filters: BorrowerApplicationListFilters): string {
  const params = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit),
    sortBy: "createdAt",
    sortOrder: filters.sortOrder,
  });
  if (filters.status !== "ALL") params.set("status", filters.status);
  return `/api/borrower/applications?${params.toString()}`;
}

export async function loadBorrowerApplications(
  filters: BorrowerApplicationListFilters,
  fetcher: BorrowerApplicationFetcher = apiGet,
  signal?: AbortSignal,
): Promise<ApiSuccessEnvelope<BorrowerApplicationListItem[]>> {
  return fetcher<BorrowerApplicationListItem[]>(getApplicationListPath(filters), signal ? { signal } : undefined);
}

export async function createBorrowerApplicationDraft(
  snapshot: ApplicationSnapshot,
  fetcher: BorrowerApplicationPoster = apiPost,
): Promise<ApiSuccessEnvelope<{ id: string; status: string; borrowerProfileId: string }>> {
  return fetcher<{ id: string; status: string; borrowerProfileId: string }, ApplicationSnapshot>(
    "/api/borrower/applications",
    snapshot,
  );
}

export async function loadBorrowerApplication(
  applicationId: string,
  fetcher: BorrowerApplicationFetcher = apiGet,
): Promise<ApiSuccessEnvelope<BorrowerApplicationDetails>> {
  return fetcher<BorrowerApplicationDetails>(`/api/borrower/applications/${encodeURIComponent(applicationId)}`);
}

export async function updateBorrowerApplication(
  applicationId: string,
  snapshot: ApplicationSnapshot,
  patcher: BorrowerApplicationPatcher = apiPatch,
): Promise<ApiSuccessEnvelope<BorrowerApplicationDetails>> {
  return patcher<BorrowerApplicationDetails, ApplicationSnapshot>(
    `/api/borrower/applications/${encodeURIComponent(applicationId)}`,
    snapshot,
  );
}

export async function submitBorrowerApplicationRequest(
  applicationId: string,
  poster: BorrowerApplicationPoster = apiPost,
): Promise<ApiSuccessEnvelope<BorrowerApplicationDetails>> {
  return poster<BorrowerApplicationDetails, Record<string, never>>(
    `/api/borrower/applications/${encodeURIComponent(applicationId)}/submit`,
    {},
  );
}

export function getApplicationPurpose(snapshot: unknown): string | null {
  if (typeof snapshot === "string" && snapshot.trim()) return snapshot;
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) return null;
  const requestedLoan = (snapshot as { requested_loan?: unknown }).requested_loan;
  if (typeof requestedLoan !== "object" || requestedLoan === null || Array.isArray(requestedLoan)) return null;
  const purpose = (requestedLoan as { purpose?: unknown }).purpose;
  return typeof purpose === "string" && purpose.trim() ? purpose : null;
}

export function getApplicationErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    const details = (error.details ?? []).flatMap((detail) => {
      if (typeof detail !== "object" || detail === null || Array.isArray(detail)) return [];
      const item = detail as { path?: unknown; message?: unknown };
      if (typeof item.message !== "string") return [];
      return [`${typeof item.path === "string" && item.path ? `${item.path}: ` : ""}${item.message}`];
    });
    return details.length ? `${error.message} ${details.join(" ")}` : error.message;
  }
  return "We could not complete the application request. Please try again.";
}

export function createApplicationSubmissionLock() {
  let active = false;
  return async function run<T>(operation: () => Promise<T>): Promise<{ submitted: false } | { submitted: true; result: T }> {
    if (active) return { submitted: false };
    active = true;
    try {
      return { submitted: true, result: await operation() };
    } finally {
      active = false;
    }
  };
}

export function hasApplicationRows<T>(rows: readonly T[], pagination?: ApiPagination): boolean {
  return rows.length > 0 || (pagination?.total ?? 0) > 0;
}
