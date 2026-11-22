import { describe, expect, it, vi } from "vitest";
import { ApiClientError, type ApiSuccessEnvelope } from "../../../src/lib/client/api-client";
import { formatDashboardStatus } from "../../../src/lib/client/borrower-dashboard";
import {
  buildBorrowerApplicationSnapshot,
  createBorrowerApplicationDraft,
  createApplicationSubmissionLock,
  getApplicationListPath,
  getApplicationErrorMessage,
  getApplicationPurpose,
  hasApplicationRows,
  loadBorrowerApplications,
  loadBorrowerApplication,
  submitBorrowerApplicationRequest,
  updateBorrowerApplication,
  validateBorrowerApplicationForm,
  type BorrowerApplicationFormValues,
  type BorrowerApplicationPoster,
  type BorrowerApplicationFetcher,
  type BorrowerApplicationPatcher,
} from "../../../src/lib/client/borrower-applications";

const validForm: BorrowerApplicationFormValues = {
  legalName: "Nexus Borrower",
  phone: "0812345678",
  addressLine1: "12 Example Road",
  addressLine2: "",
  subdistrict: "",
  district: "",
  province: "Bangkok",
  postalCode: "10000",
  countryCode: "TH",
  employmentStatus: "EMPLOYED",
  employerName: "Example Co",
  occupation: "Analyst",
  monthsInRole: "12",
  companyName: "",
  companyType: "",
  amountBaht: "1,000.00",
  termMonths: "12",
  purpose: "education",
};

describe("WP9.4.2 borrower application client", () => {
  it("uses the owned detail endpoint and supports persisted edit and submit requests", async () => {
    const detail = { id: "app/a", status: "DRAFT", permissions: { canEdit: true, canSubmit: true } };
    const fetcher = vi.fn<BorrowerApplicationFetcher>(async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => ({
      success: true, data: detail as T, message: "Loaded",
    }));
    const loaded = await loadBorrowerApplication("app/a", fetcher as unknown as BorrowerApplicationFetcher);
    expect(fetcher).toHaveBeenCalledWith("/api/borrower/applications/app%2Fa");
    expect(loaded.data).toMatchObject({ id: "app/a", permissions: { canEdit: true, canSubmit: true } });

    const patcher = vi.fn<BorrowerApplicationPatcher>(async <T, TBody>(path: string, _body: TBody): Promise<ApiSuccessEnvelope<T>> => ({ success: true, data: detail as T, message: "Saved" }));
    await updateBorrowerApplication("app-1", buildBorrowerApplicationSnapshot(validForm), patcher as unknown as BorrowerApplicationPatcher);
    expect(patcher).toHaveBeenCalledWith("/api/borrower/applications/app-1", buildBorrowerApplicationSnapshot(validForm));
    const poster = vi.fn<BorrowerApplicationPoster>(async <T, TBody>(path: string, _body: TBody): Promise<ApiSuccessEnvelope<T>> => ({ success: true, data: { ...detail, status: "SUBMITTED" } as T, message: "Submitted" }));
    const submitted = await submitBorrowerApplicationRequest("app-1", poster as unknown as BorrowerApplicationPoster);
    expect(poster).toHaveBeenCalledWith("/api/borrower/applications/app-1/submit", {});
    expect(submitted.data.status).toBe("SUBMITTED");
  });

  it("builds only the actual application_snapshot.v1 request fields", () => {
    expect(buildBorrowerApplicationSnapshot(validForm)).toEqual({
      schema_version: "application_snapshot.v1",
      borrower: {
        legal_name: "Nexus Borrower",
        phone: "0812345678",
        address: {
          line1: "12 Example Road",
          line2: null,
          subdistrict: null,
          district: null,
          province: "Bangkok",
          postal_code: "10000",
          country_code: "TH",
        },
      },
      employment: {
        employment_status: "EMPLOYED",
        employer_name: "Example Co",
        occupation: "Analyst",
        months_in_role: 12,
      },
      requested_loan: { purpose: "education", amount_satang: 100_000, term_months: 12 },
    });
  });

  it("creates a draft through the existing borrower applications endpoint", async () => {
    const snapshot = buildBorrowerApplicationSnapshot(validForm);
    const posted: Array<{ path: string; body: unknown }> = [];
    const poster = vi.fn(async <T, TBody>(path: string, body: TBody): Promise<ApiSuccessEnvelope<T>> => {
      posted.push({ path, body });
      return {
        success: true,
        data: { id: "application-1", status: "DRAFT", borrowerProfileId: "borrower-1" } as T,
        message: "Application draft created.",
      };
    }) as unknown as BorrowerApplicationPoster;

    const result = await createBorrowerApplicationDraft(snapshot, poster);

    expect(poster).toHaveBeenCalledWith("/api/borrower/applications", snapshot);
    expect(posted).toEqual([{ path: "/api/borrower/applications", body: snapshot }]);
    expect(result.data).toMatchObject({ id: "application-1", status: "DRAFT" });
  });

  it("rejects amounts below and above the current application policy range", () => {
    expect(validateBorrowerApplicationForm({ ...validForm, amountBaht: "999.99" }).amountBaht).toBeTruthy();
    expect(validateBorrowerApplicationForm({ ...validForm, amountBaht: "50000.01" }).amountBaht).toBeTruthy();
    expect(validateBorrowerApplicationForm({ ...validForm, amountBaht: "1000.00" }).amountBaht).toBeUndefined();
    expect(validateBorrowerApplicationForm({ ...validForm, amountBaht: "50000" }).amountBaht).toBeUndefined();
  });

  it("rejects unsupported terms and missing contract-required fields", () => {
    expect(validateBorrowerApplicationForm({ ...validForm, termMonths: "5" }).termMonths).toBeTruthy();
    expect(validateBorrowerApplicationForm({ ...validForm, purpose: "family expenses" }).purpose).toBeUndefined();
    expect(validateBorrowerApplicationForm({ ...validForm, legalName: "", addressLine1: "", employmentStatus: "", purpose: "" })).toMatchObject({
      legalName: expect.any(String),
      addressLine1: expect.any(String),
      employmentStatus: expect.any(String),
      purpose: expect.any(String),
    });
  });

  it("loads one server-filtered application page using only API-supported sorting", async () => {
    expect(getApplicationListPath({ status: "DRAFT", page: 2, limit: 10, sortOrder: "asc" }))
      .toBe("/api/borrower/applications?page=2&limit=10&sortBy=createdAt&sortOrder=asc&status=DRAFT");
    const paths: string[] = [];
    const fetcher = vi.fn<BorrowerApplicationFetcher>(async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => {
      paths.push(path);
      return {
        success: true,
        data: [{ id: "application-2" }] as unknown as T,
        message: "Loaded",
        pagination: {
          page: 2,
          limit: 10,
          total: 11,
          totalPages: 2,
          hasPreviousPage: true,
          hasNextPage: false,
        },
      };
    });

    const result = await loadBorrowerApplications({ status: "DRAFT", page: 2, limit: 10, sortOrder: "asc" }, fetcher as unknown as BorrowerApplicationFetcher);

    expect(fetcher).toHaveBeenCalledWith(getApplicationListPath({ status: "DRAFT", page: 2, limit: 10, sortOrder: "asc" }), undefined);
    expect(result.data).toEqual([{ id: "application-2" }]);
    expect(result.pagination?.hasPreviousPage).toBe(true);
    expect(paths).toEqual([getApplicationListPath({ status: "DRAFT", page: 2, limit: 10, sortOrder: "asc" })]);
  });

  it("reads purpose only from the persisted request snapshot", () => {
    expect(getApplicationPurpose({ requested_loan: { purpose: "education" } })).toBe("education");
    expect(getApplicationPurpose("education")).toBe("education");
    expect(getApplicationPurpose({ requested_loan: { purpose: 12 } })).toBeNull();
    expect(getApplicationPurpose(null)).toBeNull();
  });

  it("formats application statuses without changing their meaning", () => {
    expect(formatDashboardStatus("INFORMATION_REQUESTED")).toBe("Information Requested");
    expect(formatDashboardStatus("DRAFT")).toBe("Draft");
  });

  it("distinguishes an empty list from a page that has more records", () => {
    expect(hasApplicationRows([], { page: 1, limit: 10, total: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false })).toBe(false);
    expect(hasApplicationRows([{ id: "application-1" }], { page: 1, limit: 10, total: 12, totalPages: 2, hasPreviousPage: false, hasNextPage: true })).toBe(true);
  });

  it("returns API validation messages and field details for display", () => {
    const error = new ApiClientError(422, "VALIDATION_ERROR", "The application could not be created.", [
      { path: "requested_loan.term_months", message: "is not allowed" },
    ]);
    expect(getApplicationErrorMessage(error)).toBe("The application could not be created. requested_loan.term_months: is not allowed");
  });

  it("prevents duplicate in-flight creates and unlocks after completion", async () => {
    const runOnce = createApplicationSubmissionLock();
    let release!: (value: string) => void;
    const operation = vi.fn(() => new Promise<string>((resolve) => { release = resolve; }));

    const first = runOnce(operation);
    const duplicate = await runOnce(operation);
    expect(duplicate).toEqual({ submitted: false });
    expect(operation).toHaveBeenCalledTimes(1);

    release("created");
    await expect(first).resolves.toEqual({ submitted: true, result: "created" });
    await expect(runOnce(async () => "retry")).resolves.toEqual({ submitted: true, result: "retry" });
  });
});
