import { describe, expect, it, vi } from "vitest";
import type { ApiSuccessEnvelope } from "../../../src/lib/client/api-client";
import {
  acceptBorrowerOffer,
  createOfferAcceptanceLock,
  getBorrowerOfferPath,
  getBorrowerOffersPath,
  hasBorrowerOfferRows,
  loadBorrowerOffer,
  loadBorrowerOffers,
  type BorrowerOfferFetcher,
  type BorrowerOfferPoster,
} from "../../../src/lib/client/borrower-offers";

describe("WP9.4.4 borrower offers client", () => {
  it("distinguishes empty offer lists from paginated results", () => {
    expect(hasBorrowerOfferRows([], { page: 1, limit: 10, total: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false })).toBe(false);
    expect(hasBorrowerOfferRows([{
      id: "offer-1", applicationId: "application-1", principalSatang: "300000", annualInterestRate: "0.12",
      termMonths: 3, repaymentFrequency: "MONTHLY", expiresAt: "2026-11-28T00:00:00.000Z", status: "ISSUED",
      isExpired: false, acceptedAt: null, createdAt: "2026-11-21T00:00:00.000Z", permissions: { canAccept: true },
    }])).toBe(true);
    expect(hasBorrowerOfferRows([], { page: 2, limit: 10, total: 12, totalPages: 2, hasPreviousPage: true, hasNextPage: false })).toBe(true);
  });

  it("uses the paginated borrower offer endpoints for list and details", async () => {
    expect(getBorrowerOffersPath({ page: 2, limit: 10, sortOrder: "asc" }))
      .toBe("/api/borrower/offers?page=2&limit=10&sortBy=expiresAt&sortOrder=asc");
    expect(getBorrowerOfferPath("offer/1")).toBe("/api/borrower/offers/offer%2F1");
    const fetcher = vi.fn<BorrowerOfferFetcher>(async <T>(path: string): Promise<ApiSuccessEnvelope<T>> => ({
      success: true,
      data: (path.includes("offer%2F1") ? { id: "offer/1", status: "ISSUED" } : []) as T,
      message: "Loaded",
    }));
    await loadBorrowerOffers({ page: 2, limit: 10, sortOrder: "asc" }, fetcher as unknown as BorrowerOfferFetcher);
    await loadBorrowerOffer("offer/1", fetcher as unknown as BorrowerOfferFetcher);
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      "/api/borrower/offers?page=2&limit=10&sortBy=expiresAt&sortOrder=asc",
      "/api/borrower/offers/offer%2F1",
    ]);
  });

  it("posts acceptance once while a confirmation is already in flight", async () => {
    const post = vi.fn<BorrowerOfferPoster>(async <T, TBody>(_path: string, _body: TBody): Promise<ApiSuccessEnvelope<T>> => ({
      success: true, data: { offerId: "offer-1", loanId: "loan-1", status: "FUNDING" } as T, message: "Accepted",
    }));
    const lock = createOfferAcceptanceLock();
    const first = lock(() => acceptBorrowerOffer("offer-1", post as unknown as BorrowerOfferPoster));
    const duplicate = await lock(() => acceptBorrowerOffer("offer-1", post as unknown as BorrowerOfferPoster));
    expect(duplicate).toEqual({ accepted: false });
    expect(post).toHaveBeenCalledTimes(1);
    expect((await first).accepted).toBe(true);
    await expect(lock(() => acceptBorrowerOffer("offer-1", post as unknown as BorrowerOfferPoster))).resolves.toMatchObject({ accepted: true });
    expect(post).toHaveBeenCalledTimes(2);
  });
});
