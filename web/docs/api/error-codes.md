# API Error Codes

Except for the service-to-service prediction persistence callback documented in [ML integration](ml-integration-api.md), API errors use HTTP status plus this envelope:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [{ "path": "field", "message": "Invalid value" }]
  }
}
```

`details` is omitted when there are no field-level details. Internal exceptions, SQL, stack traces, and credentials are not returned.

## Common codes

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_JSON` | Request body is not valid JSON. |
| 400 | `VALIDATION_ERROR` | Body, path parameter, query parameter, enum, amount, or required header failed validation. |
| 401 | `UNAUTHENTICATED` | A valid active session is required. |
| 403 | `FORBIDDEN` | Authenticated user lacks the required role/profile or authorization. |
| 404 | `NOT_FOUND` | Resource is missing or is not visible to the caller. |
| 405 | `METHOD_NOT_ALLOWED` | Operation is intentionally unsupported, such as investor-initiated payout. |
| 409 | `CONFLICT` | State, unique constraint, serialization, or resource conflict. |
| 409 | `IDEMPOTENCY_KEY_CONFLICT` | Key is associated with a different logical financial operation. |
| 409 | `APPLICATION_NOT_EDITABLE`, `APPLICATION_NOT_REVIEWABLE`, `APPLICATION_NOT_SUBMITTABLE` | Application state does not allow the requested transition. |
| 409 | `OFFER_NOT_AVAILABLE`, `OFFER_ALREADY_ACCEPTED` | Offer state prevents acceptance. |
| 409 | `LOAN_NOT_ELIGIBLE`, `ALREADY_DISBURSED`, `BORROWER_CONSENT_REQUIRED`, `REQUEST_ALREADY_APPROVED`, `INVALID_APPROVAL`, `INVALID_REQUEST`, `INVALID_DISBURSEMENT_REQUEST` | Loan/disbursement lifecycle state prevents the operation or requires borrower confirmation. |
| 409 | `INVESTOR_PREFERENCES_REQUIRED`, `INVESTOR_PREFERENCES_INVALID` | Recommendation request cannot use the investor's saved preferences. |
| 409 | `ALLOCATION_ALREADY_PAID` | Allocation already has a payout. |
| 422 | `APPLICATION_POLICY_VIOLATION` | Requested amount or term falls outside the active application policy. |
| 422 | `OFFER_EXPIRED` | Offer has expired. |
| 422 | `LOAN_NOT_FULLY_FUNDED` | Loan is not fully funded for disbursement. |
| 422 | `BUSINESS_RULE_VIOLATION` | The requested operation violates current business/financial eligibility. |
| 422 | `INSUFFICIENT_FUNDS` | Borrower wallet does not have enough available balance for an otherwise payable repayment. |
| 422 | `INVESTMENT_REJECTED` | Contribution service rejected the investment request. |
| 503 | `SERVICE_UNAVAILABLE` | Required application policy or upstream service is unavailable. |
| 500 | `INTERNAL_ERROR` | Unexpected error; details are intentionally hidden. |
| 502 | `INVALID_ML_RESPONSE` | ML service returned malformed or invalid result data. |
| 503 | `ML_SERVICE_UNAVAILABLE`, `ML_MODEL_UNAVAILABLE` | ML service/configuration/model is unavailable. |
| 504 | `ML_SERVICE_TIMEOUT` | ML operation exceeded the configured request timeout. |

Additional application and disbursement codes are mapped in `src/lib/api/errors.ts`; clients should branch on stable `code` values and HTTP status, not message text. New service codes should be added here when introduced.

## Error handling guidance

- Do not retry a `400`, `403`, or `422` unchanged.
- For `409`, refresh resource state or resolve the idempotency conflict before retrying.
- For timeouts or transient `503` errors on an idempotent financial operation, retry with the same idempotency key.
- Do not infer whether a write committed from a timeout alone. Query by returned operation/reference where possible or repeat the same idempotent request.
- Treat unknown `500` errors as failed requests with no internal details exposed; use server-side logs/correlation tooling for investigation.
