import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  apiError,
  apiPaginatedResponse,
  apiPaginatedSuccess,
  apiSuccess,
  apiSuccessResponse,
} from "../../../src/lib/api/responses";
import { apiErrorResponseFrom, mapApiError, ApiError } from "../../../src/lib/api/errors";
import { FinancialAuthorizationError } from "../../../src/lib/services/financial-authorization.service";
import {
  parseJsonBody,
  validateQuery,
  validateRouteParams,
} from "../../../src/lib/api/validation";
import { parsePagination } from "../../../src/lib/api/pagination";
import { createAuthenticatedApiRequest } from "../../helpers/api";

const uuidSchema = z.object({ id: z.string().uuid() }).strict();
const bodySchema = z.object({ amountSatang: z.number().int().positive() }).strict();

describe("API-01 shared API foundation", () => {
  it("API-01-01 returns the standard success envelope", async () => {
    const response = apiSuccessResponse({ id: "loan-1" }, { message: "Loaded" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { id: "loan-1" },
      message: "Loaded",
    });
  });

  it("API-01-02 maps malformed JSON to a safe 400 validation response", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{bad",
    });
    try {
      await parseJsonBody(request, bodySchema);
      throw new Error("Expected malformed JSON to be rejected");
    } catch (error) {
      const response = apiErrorResponseFrom(error);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: { code: "INVALID_JSON", message: "Request body must contain valid JSON." },
      });
    }
  });

  it("API-01-03 rejects missing required body fields", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    await expect(parseJsonBody(request, bodySchema)).rejects.toMatchObject({
      code: "VALIDATION_ERROR", status: 400,
    });
  });

  it("API-01-04 validates dynamic route parameters", () => {
    expect(() => validateRouteParams({ id: "not-a-uuid" }, uuidSchema)).toThrow(ApiError);
    expect(validateRouteParams({ id: "7bc1f22a-f435-4e20-9262-15c9cfd5c119" }, uuidSchema).id)
      .toBe("7bc1f22a-f435-4e20-9262-15c9cfd5c119");
  });

  it("API-01-05 rejects invalid and unsupported query parameters", () => {
    const schema = z.object({ page: z.coerce.number().int().positive() }).strict();
    expect(() => validateQuery("http://localhost/api/test?page=no", schema)).toThrow(ApiError);
    expect(() => validateQuery("http://localhost/api/test?page=1&ownerUserId=victim", schema))
      .toThrow(ApiError);
  });

  it("API-01-06 maps a known service error and API not-found error to documented HTTP statuses", () => {
    const serviceError = mapApiError(new FinancialAuthorizationError());
    expect(serviceError.status).toBe(403);
    expect(serviceError.body.error).toEqual({
      code: "FORBIDDEN",
      message: "You are not authorized to perform this action.",
    });

    const mapped = mapApiError(new ApiError("NOT_FOUND", "Loan not found", 404));
    expect(mapped.status).toBe(404);
    expect(mapped.body.error.code).toBe("NOT_FOUND");
  });

  it("API-01-07 hides unexpected internal exception details", () => {
    const mapped = mapApiError(new Error("secret stack and token"));
    expect(mapped.status).toBe(500);
    expect(mapped.body).toEqual({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
    });
  });

  it("API-01-08 hides database details and maps known conflicts", () => {
    const databaseError = Object.assign(new Error("postgres password and SQL query"), { code: "P2002" });
    const mapped = mapApiError(databaseError);
    expect(mapped.status).toBe(409);
    expect(JSON.stringify(mapped.body)).not.toMatch(/password|SQL|postgres/i);
    expect(mapped.body.error.code).toBe("CONFLICT");

    const unexpectedDatabaseError = Object.assign(
      new Error("connection string contains password=secret"),
      { code: "P1001" },
    );
    const unexpected = mapApiError(unexpectedDatabaseError);
    expect(unexpected.status).toBe(500);
    expect(JSON.stringify(unexpected.body)).not.toMatch(/password|secret|connection string/i);
  });

  it("API-01-09 returns validated pagination metadata and page window", async () => {
    const page = parsePagination(
      new URLSearchParams("page=2&limit=10&sortBy=createdAt&sortOrder=asc"),
      { sortFields: ["createdAt", "amountSatang"] },
    );
    expect(page).toEqual({
      page: 2, limit: 10, offset: 10, sortBy: "createdAt", sortOrder: "asc",
    });
    expect(() => parsePagination(new URLSearchParams("page=0"))).toThrow(ApiError);
    expect(() => parsePagination(new URLSearchParams("sortBy=secretField"), {
      sortFields: ["createdAt"],
    })).toThrow(ApiError);
    const filtered = parsePagination(new URLSearchParams("status=OPEN"), {
      filterFields: ["status"],
    });
    expect(filtered.filters).toEqual({ status: "OPEN" });
    expect(apiPaginatedSuccess([], page, 25).pagination).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasPreviousPage: true,
      hasNextPage: true,
    });
    const response = apiPaginatedResponse([{ id: "row-1" }], page, 25);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: [{ id: "row-1" }],
      pagination: { page: 2, limit: 10, total: 25, totalPages: 3 },
    });
  });

  it("creates authenticated test requests with opaque session cookies, not trusted identity headers", () => {
    const request = createAuthenticatedApiRequest("http://localhost/api/test", {
      userId: "user-1",
      role: "BORROWER",
      sessionCookie: "opaque-session-token",
    });
    expect(request.headers.get("cookie")).toContain("nexus_session=opaque-session-token");
    expect(request.headers.has("x-user-id")).toBe(false);
    expect(request.headers.has("x-user-role")).toBe(false);
  });

  it("builds the standard error envelope without leaking supplied internals", () => {
    const response = apiError("VALIDATION_ERROR", "Invalid request data", [
      { path: "amountSatang", message: "Expected positive integer" },
    ]);
    expect(response).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: [{ path: "amountSatang", message: "Expected positive integer" }],
      },
    });
    expect(apiSuccess({ ok: true })).toEqual({ success: true, data: { ok: true }, message: "Request completed successfully" });
  });
});
