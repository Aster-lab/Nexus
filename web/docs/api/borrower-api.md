# Borrower APIs

All borrower routes require an authenticated session with the `BORROWER` role and borrower profile. Resource lookups are scoped to that profile; non-owned applications, loans, repayments, and receipts are not disclosed. API success and error shapes are in [the overview](api-overview.md).

## Applications

| Method and path | Behavior |
| --- | --- |
| `GET /api/borrower/applications` | List own applications. Pagination: `page`, `limit`, `sortBy=createdAt`, `sortOrder`. |
| `POST /api/borrower/applications` | Create a validated DRAFT application. |
| `GET /api/borrower/applications/{applicationId}` | Retrieve an owned application and current version. |
| `PATCH /api/borrower/applications/{applicationId}` | Update an editable DRAFT by creating a new application version. |
| `POST /api/borrower/applications/{applicationId}/financial-information` | Append validated income, expense, debt, credit, and source-provenance records to the current DRAFT version. |
| `POST /api/borrower/applications/{applicationId}/submit` | Submit the current DRAFT version. Empty body. |

Create/update bodies use the strict `application_snapshot.v1` contract:

```json
{
  "schema_version": "application_snapshot.v1",
  "borrower": {
    "legal_name": "Example Borrower",
    "phone": null,
    "address": {
      "line1": "12 Example Road",
      "line2": null,
      "subdistrict": null,
      "district": null,
      "province": "Bangkok",
      "postal_code": "10000",
      "country_code": "TH"
    }
  },
  "employment": {
    "employment_status": "EMPLOYED",
    "employer_name": "Example Co",
    "occupation": "Analyst",
    "months_in_role": 24
  },
  "requested_loan": {
    "purpose": "education",
    "amount_satang": 10000000,
    "term_months": 12
  }
}
```

The current effective active loan offer policy controls permitted amount and term. The caller cannot set borrower identity. Submitted application versions are immutable.

Financial information uses the strict `BorrowerFinancialInformationSchema`. Credit data accepts the historical `borrower_credit.v1` shape and the expanded `borrower_credit.v2` shape. V2 captures bureau account openings over 24 months and bankcard/revolving balances and credit limits. These values are needed to build the NEXUS-native prediction feature snapshot; bureau values must carry `CREDIT_BUREAU` source provenance and `VERIFIED` status before the feature builder will use them. Financial records may be appended only while the application is a DRAFT.

A create response is `201` and wraps the created application in the shared envelope. The result includes the application ID/status and current persisted version; satang fields are strings in API responses.

## Offers

| Method and path | Behavior |
| --- | --- |
| `GET /api/borrower/offers` | List unexpired issued offers for the caller's approved applications. Pagination: `page`, `limit`, `sortBy=createdAt|expiresAt`, `sortOrder`. |
| `POST /api/borrower/offers/{offerId}/accept` | Accept an eligible offer once and create the funding loan. Empty body. The loan funding deadline uses the offer expiry timestamp. |

## Loans and schedules

| Method and path | Behavior |
| --- | --- |
| `GET /api/borrower/loans` | Paginated list of the caller's loans; `sortBy=createdAt` is supported. |
| `GET /api/borrower/loans/{loanId}` | Owned loan status and persisted terms. |
| `GET /api/borrower/loans/{loanId}/schedule` | Current persisted schedule only; this route does not generate or recalculate a schedule. |

## Repayments and receipts

### `POST /api/borrower/repayments`

Requires the `Idempotency-Key` header (1–255 characters). The key is scoped by the repayment service; matching retries reuse the original logical result, while incompatible reuse is rejected.

```http
POST /api/borrower/repayments
Idempotency-Key: repay-<unique-request-id>
Content-Type: application/json
```

```json
{ "loanId": "<loan-uuid>", "amountSatang": "125000" }
```

`amountSatang` is a positive integer string (up to 18 digits). On success, the response includes the loan and ledger transaction references, total amount, persisted installment repayment rows, and receipt details. Monetary satang values are strings. Success status is `201`.

Representative response data:

```json
{
  "loanId": "<loan-uuid>",
  "ledgerTransactionId": "<posted-transaction-uuid>",
  "totalSatang": "125000",
  "repayments": [
    { "installmentId": "<installment-uuid>", "principalSatang": "100000", "interestSatang": "25000", "feeSatang": "0", "totalSatang": "125000" }
  ],
  "receipt": {
    "receiptId": "<receipt-reference>",
    "status": "POSTED",
    "totalReceivedSatang": "125000",
    "repaymentIds": ["<repayment-uuid>"]
  }
}
```

### `GET /api/borrower/repayments/{repaymentId}/receipt`

Returns the persisted receipt after verifying the repayment belongs to the borrower's loan and the ledger transaction is posted. Receipt data includes receipt ID/time, loan and transaction references, total received, repayment references, principal/interest breakdown, and remaining installment balances.

Common errors include `400` validation, `401` unauthenticated, `403` forbidden, `404` non-owned/not found, `409` idempotency/state conflict, and `422 BUSINESS_RULE_VIOLATION` for an amount that cannot be applied to the payable balance.
