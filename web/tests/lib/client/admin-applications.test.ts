import { describe, expect, it } from "vitest";
import type { ApiSuccessEnvelope } from "../../../src/lib/client/api-client";
import {
  getAdminApplicationsPath,
  getAdminApplicationPath,
  isAdminApplicationReviewable,
  loadAdminApplications,
  type AdminApplicationFetcher,
} from "../../../src/lib/client/admin-applications";

describe("WP9.6.2 administrator application client", () => {
  it("builds collection paths from supported status, pagination, and sorting fields", () => {
    expect(getAdminApplicationsPath({ page: 2, limit: 10, status: "SUBMITTED", sortBy: "submittedAt", sortOrder: "asc" }))
      .toBe("/api/admin/applications?page=2&limit=10&sortBy=submittedAt&sortOrder=asc&status=SUBMITTED");
    expect(getAdminApplicationPath("application/1")).toBe("/api/admin/applications/application%2F1");
  });

  it("loads only the server page and exposes final-decision controls only for backend-reviewable states", async () => {
    const detail = { id: "application-1", status: "UNDER_REVIEW" };
    const calls: string[] = [];
    const fetcher: AdminApplicationFetcher = async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => {
      calls.push(path);
      return { success: true, message: "Loaded", data: detail as T };
    };
    await loadAdminApplications({ page: 1, limit: 10, status: "ALL", sortBy: "updatedAt", sortOrder: "desc" }, fetcher);
    expect(calls).toEqual(["/api/admin/applications?page=1&limit=10&sortBy=updatedAt&sortOrder=desc"]);
    expect(isAdminApplicationReviewable("SUBMITTED")).toBe(true);
    expect(isAdminApplicationReviewable("UNDER_REVIEW")).toBe(true);
    expect(isAdminApplicationReviewable("INFORMATION_REQUESTED")).toBe(false);
    expect(isAdminApplicationReviewable("APPROVED")).toBe(false);
  });
});
