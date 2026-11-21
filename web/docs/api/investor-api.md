# Investor APIs

Investor routes require an authenticated session, active `INVESTOR` role, and active investor profile. Reads are scoped to the authenticated investor. Marketplace responses do not include borrower identity or submitted application data.

## Profile

- `GET /api/investor/profile`: returns own profile ID, display name, investor status, and timestamps.
- `PATCH /api/investor/profile`: strict body `{ "displayName": "Name" }`; display name must be 1–100 trimmed characters. Unknown properties are rejected.

## Marketplace

- `GET /api/investor/marketplace`: lists loans in `FUNDING` with a future funding deadline, open escrow, and remaining funding capacity. Pagination accepts `page`, `limit`, `sortBy=createdAt|fundingDeadline`, and `sortOrder`.
- `GET /api/investor/marketplace/{loanId}`: retrieves the same public information for one currently eligible loan.

Loan amounts are returned in satang strings, including `principalSatang`, `fundedSatang`, and `remainingFundingSatang`. Rate, term, status, and funding deadline are included. Borrower identity and internal risk data are not returned.

## Investments

- `GET /api/investor/investments`: list own investments with contribution and payout-allocation summaries; pagination supports `page`, `limit`, `sortBy=createdAt`, `sortOrder`.
- `GET /api/investor/investments/{investmentId}`: retrieve one owned investment and its persisted activity.
- `POST /api/investor/investments`: post an investment contribution through the funding service.

POST requires `Idempotency-Key` (1–255 characters) and this strict JSON body:

```json
{ "loanId": "<loan-uuid>", "amountSatang": "100000" }
```

`amountSatang` is a positive integer string. The service checks wallet state/funds, loan availability, funding deadline/capacity, and escrow constraints; the API does not post ledger entries or update balances directly. A matching retry reuses the original contribution; conflicting key reuse returns `409 IDEMPOTENCY_KEY_CONFLICT`.

The `201` response data contains `contributionId`, `investmentId`, `loanId`, `amountSatang`, `ledgerTransactionId`, `ledgerStatus`, and `createdAt`.

## Portfolio

`GET /api/investor/portfolio` returns the caller's aggregate persisted investment, outstanding principal, posted payout, investment-count, and wallet projection summaries. It does not forecast future interest or repair balances.

The response fields are `investorProfileId`, `investmentCounts` (`active`, `completed`), `totalInvestedPrincipalSatang`, `principalReceivedSatang`, `interestReceivedSatang`, `outstandingPrincipalSatang`, and `wallet` (`balanceSatang`, `currency`, `status`) or `null` when no wallet exists.

## Payouts and allocations

- `GET /api/investor/payouts`: paginated own payout history (`page`, `limit`, `sortBy=createdAt|completedAt`, `sortOrder`).
- `GET /api/investor/payouts/{payoutId}`: retrieve only an own payout.
- `POST /api/investor/payouts`: not allowed; returns `405 METHOD_NOT_ALLOWED`. Payout processing is an administrator/service workflow.
- `GET /api/investor/allocations`: paginated allocations for the caller's investments (`page`, `limit`, `sortBy=createdAt`, `sortOrder`).

Satang values are decimal strings. Investor payout/allocation history is read-only.
