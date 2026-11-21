import { describe, expect, it, vi } from "vitest";
import { apiGet, apiPost, ApiClientError, apiRequest } from "../../../src/lib/client/api-client";

describe("WP9 shared browser API client", () => {
  it("returns standard success data and requests fresh same-origin session cookies", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      success: true,
      data: { id: "application-1" },
      message: "Loaded",
    }));
    const result = await apiGet<{ id: string }>("/api/borrower/applications", { fetcher });

    expect(result).toEqual({ success: true, data: { id: "application-1" }, message: "Loaded" });
    expect(fetcher).toHaveBeenCalledWith("/api/borrower/applications", expect.objectContaining({
      credentials: "same-origin",
      cache: "no-store",
      method: "GET",
    }));
  });

  it("preserves pagination metadata for collection screens", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      success: true,
      data: [{ id: "loan-1" }],
      message: "Loaded",
      pagination: { page: 2, limit: 10, total: 11, totalPages: 2, hasPreviousPage: true, hasNextPage: false },
    }));
    const result = await apiRequest<Array<{ id: string }>>("/api/investor/marketplace?page=2", { fetcher });
    expect(result.pagination).toMatchObject({ page: 2, total: 11, hasPreviousPage: true, hasNextPage: false });
  });

  it("throws a safe structured error for API error envelopes", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      success: false,
      error: { code: "IDEMPOTENCY_KEY_CONFLICT", message: "Request conflicts.", details: [{ path: "amountSatang" }] },
    }, { status: 409 }));

    await expect(apiGet("/api/borrower/loans", { fetcher })).rejects.toMatchObject({
      name: "ApiClientError",
      status: 409,
      code: "IDEMPOTENCY_KEY_CONFLICT",
      message: "Request conflicts.",
      details: [{ path: "amountSatang" }],
    });
  });

  it("exposes unauthorized status without redirecting or retrying implicitly", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Sign in required." },
    }, { status: 401 }));
    const onUnauthorized = vi.fn();
    await expect(apiGet("/api/auth/me", { fetcher, onUnauthorized })).rejects.toBeInstanceOf(ApiClientError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(onUnauthorized).toHaveBeenCalledWith(expect.objectContaining({ status: 401, code: "UNAUTHENTICATED" }));
  });

  it("sends JSON writes and preserves the caller's idempotency key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      success: true,
      data: { repaymentId: "repayment-1" },
      message: "Posted",
    }, { status: 201 }));
    await apiPost<{ repaymentId: string }, { loanId: string; amountSatang: string }>(
      "/api/borrower/repayments",
      { loanId: "loan-1", amountSatang: "125000" },
      { idempotencyKey: "repayment-attempt-1", fetcher },
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [requestPath, init] = fetcher.mock.calls[0];
    expect(requestPath).toBe("/api/borrower/repayments");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ loanId: "loan-1", amountSatang: "125000" }),
    });
    const headers = new Headers(init?.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("Idempotency-Key")).toBe("repayment-attempt-1");
  });

  it("rejects URLs outside the same-origin API namespace", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(apiRequest("https://example.invalid/api/private", { fetcher })).rejects.toThrow("API path must be a same-origin /api URL");
    await expect(apiRequest("//example.invalid/api/private", { fetcher })).rejects.toThrow("API path must be a same-origin /api URL");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects malformed server responses without exposing their body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("private internal details", { status: 502 }));
    await expect(apiGet("/api/ml/borrower-evaluation", { fetcher })).rejects.toMatchObject({
      status: 502,
      code: "INVALID_API_RESPONSE",
      message: "The server returned an invalid response.",
    });
  });
});
