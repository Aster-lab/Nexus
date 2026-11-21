import { describe, expect, it, vi } from "vitest";
import { ApiClientError, type ApiPostOptions, type ApiSuccessEnvelope } from "../../../src/lib/client/api-client";
import {
  createRepaymentSubmissionLock,
  getBorrowerPayablePath,
  getPaginatedRepaymentHistoryPath,
  getRepaymentHistoryPath,
  isRepaymentOutcomeUncertain,
  loadBorrowerPayable,
  loadBorrowerRepaymentHistory,
  loadBorrowerRepaymentHistoryPage,
  parseRepaymentAmountToSatang,
  submitBorrowerRepayment,
  validateRepaymentAmount,
  type BorrowerRepaymentPoster,
  type RepaymentFetcher,
} from "../../../src/lib/client/borrower-repayments";

describe("WP9.4.6 borrower repayment client", () => {
  it("validates positive THB values to satang precision and against the server payable amount", () => {
    expect(validateRepaymentAmount("", "100000").code).toBe("REQUIRED");
    expect(validateRepaymentAmount("0", "100000").code).toBe("POSITIVE");
    expect(validateRepaymentAmount("-1", "100000").code).toBe("FORMAT");
    expect(validateRepaymentAmount("1.001", "100000").code).toBe("PRECISION");
    expect(validateRepaymentAmount("1000.01", "100000").code).toBe("ABOVE_PAYABLE");
    expect(validateRepaymentAmount("1000.00", "100000")).toEqual({ code: null, amountSatang: "100000" });
    expect(parseRepaymentAmountToSatang("1,000.25")).toBe("100025");
  });

  it("loads payable and history from the existing API contracts", async () => {
    expect(getBorrowerPayablePath("loan-1")).toBe("/api/borrower/loans/loan-1/payable");
    expect(getRepaymentHistoryPath()).toBe("/api/borrower/repayments?page=1&limit=20&sortBy=receivedAt&sortOrder=desc");
    expect(getPaginatedRepaymentHistoryPath(2)).toBe("/api/borrower/repayments?page=2&limit=20&sortBy=receivedAt&sortOrder=desc");
    const fetcher = vi.fn<RepaymentFetcher>(async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => ({
      success: true,
      data: (path.includes("/payable") ? { loanId: "loan-1", payableAmountSatang: "100000", installments: [] } : []) as T,
      message: "Loaded",
    }));
    const payable = await loadBorrowerPayable("loan-1", fetcher as unknown as RepaymentFetcher);
    const history = await loadBorrowerRepaymentHistory(fetcher as unknown as RepaymentFetcher);
    const historyPage = await loadBorrowerRepaymentHistoryPage(2, fetcher as unknown as RepaymentFetcher);
    expect(payable.data.payableAmountSatang).toBe("100000");
    expect(history.data).toEqual([]);
    expect(historyPage.data).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenLastCalledWith(getPaginatedRepaymentHistoryPath(2));
  });

  it("submits the documented body with the API client's supported idempotency option", async () => {
    const posterMock = vi.fn(async <T, TBody>(_path: string, _body: TBody, _options?: ApiPostOptions): Promise<ApiSuccessEnvelope<T>> => ({
      success: true,
      data: { ledgerTransactionId: "ledger-1", totalSatang: "100000", receipt: { repaymentIds: ["repayment-1"] } } as T,
      message: "Repayment posted successfully.",
    }));
    const poster = posterMock as unknown as BorrowerRepaymentPoster;
    await submitBorrowerRepayment({ loanId: "loan-1", amountSatang: "100000" }, "repay-key-1", poster);
    expect(poster).toHaveBeenCalledWith("/api/borrower/repayments", { loanId: "loan-1", amountSatang: "100000" }, { idempotencyKey: "repay-key-1" });
    const controller = new AbortController();
    await submitBorrowerRepayment({ loanId: "loan-1", amountSatang: "100000" }, "repay-key-2", poster, { signal: controller.signal });
    expect(posterMock.mock.calls[1]?.[2]).toMatchObject({ idempotencyKey: "repay-key-2", signal: controller.signal });
  });

  it("distinguishes uncertain network/server outcomes and prevents duplicate in-flight submissions", async () => {
    expect(isRepaymentOutcomeUncertain(new ApiClientError(0, "NETWORK_ERROR", "offline"))).toBe(true);
    expect(isRepaymentOutcomeUncertain(new ApiClientError(503, "SERVICE_UNAVAILABLE", "uncertain"))).toBe(true);
    expect(isRepaymentOutcomeUncertain(new ApiClientError(422, "BUSINESS_RULE_VIOLATION", "invalid"))).toBe(false);
    expect(isRepaymentOutcomeUncertain(new Error("unexpected response"))).toBe(true);
    const lock = createRepaymentSubmissionLock();
    let resolve!: (value: string) => void;
    const request = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const first = lock(request);
    await expect(lock(request)).resolves.toEqual({ submitted: false });
    expect(request).toHaveBeenCalledTimes(1);
    resolve("posted");
    await expect(first).resolves.toEqual({ submitted: true, result: "posted" });
  });
});
