# NEXUS WP9.5-E — Investment Submission

**Date:** 2026-11-21  
**Scope:** Investor contribution form and confirmation flow.  
**Status:** Implemented; source reviewed. Tests were authored first and remain unrun per instruction.

## Delivered

Added an investment submission route at `/investor/marketplace/{loanId}/invest` and linked to it from the opportunity detail page. The form loads the latest currently eligible opportunity through `GET /api/investor/marketplace/{loanId}` and the wallet balance/status from the existing portfolio summary API. It displays the backend-reported remaining funding amount and active THB wallet balance before the investor can proceed.

The investor enters an amount, reviews a confirmation summary, and submits the existing contract:

```json
{ "loanId": "<loan-uuid>", "amountSatang": "<positive-integer-string>" }
```

The shared API client sends the supported `Idempotency-Key` header. No request fields, endpoints, or backend services were added.

## Validation and financial controls

- Converts THB values to integer satang with `BigInt`, avoiding floating-point calculations.
- Rejects empty, malformed, non-positive, more-than-two-decimal, over-wallet, over-capacity, and unsupported request-length input.
- Does not invent a minimum investment amount. The 20-digit satang string bound matches the actual API schema; wallet funds, current opportunity capacity, loan eligibility, escrow, and service policies are rechecked by the backend.
- Disables the investment action without an active THB investor wallet or when the opportunity is not currently in `FUNDING` status.
- Uses an explicit confirmation dialog and an in-flight ref guard to block repeated clicks.
- Does not optimistically deduct the wallet. Success appears only when the backend response contains a `POSTED` ledger status and ledger transaction reference.
- On a confirmed contribution, shows contribution/investment/transaction references, refreshes portfolio/opportunity data, and emits the investor dashboard refresh event.

## Uncertain request recovery

The form generates one secure UUID-based idempotency key per logical investment request and stores the loan, satang amount, and key in session storage before posting. A 30-second abort, network failure, malformed/unconfirmed response, or server error is treated as uncertain. The page preserves the exact request and offers only an explicit retry with the same key and amount. It does not auto-replay the write or permit changing the amount while the result is uncertain. Definitive client/API errors clear the pending request and allow a new attempt.

A successful post followed by a refresh failure continues to show the confirmed contribution and clearly warns that the portfolio/opportunity refresh did not fully complete.

## Tests authored before implementation

- `tests/lib/client/investor-investments.test.ts` checks exact satang parsing, precision and positive validation, wallet/capacity bounds, API request body and idempotency key preservation, secure key shape, and uncertain-versus-definitive error classification.
- `tests/components/investor-investment-form.test.tsx` checks accessible loading before wallet and opportunity data are confirmed.
- Existing `tests/api/investor-api.integration.test.ts` covers successful contribution posting through the funding service, invalid values, missing idempotency, idempotent reuse, conflicting keys, and foreign investment access (`API-04-05` through `API-04-10`).

No tests, typecheck, lint, build, or browser session were run.

## Files changed

- `src/lib/client/investor-investments.ts`
- `src/components/investor/investor-investment-form.tsx`
- `src/components/investor/investor-marketplace.tsx` — adds the contribution entry link.
- `src/app/investor/marketplace/[loanId]/invest/page.tsx`
- `tests/lib/client/investor-investments.test.ts`
- `tests/components/investor-investment-form.test.tsx`

## Review boundary and remaining scope

The UI is a convenience boundary only. The contribution service remains authoritative for wallet funds, eligibility, capacity, escrow, and posting. The investor cannot create payout records or edit wallet balances. Portfolio/detail, allocation, payout/wallet pages, and end-to-end investor regression remain WP9.5-F through WP9.5-I.
