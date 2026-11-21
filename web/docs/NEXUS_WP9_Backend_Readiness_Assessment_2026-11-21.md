# WP9 Backend Readiness Assessment

**Assessment date:** 2026-11-21  
**Scope:** Backend readiness for the WP9 frontend integration work  
**Execution policy:** Source and test files were reviewed statically. No application code, tests, typecheck, lint, build, or scripts were run.

## Readiness summary

The backend now exposes missing borrower and administrator APIs for offer issuance, payable summaries, and wallet activity. Local credentials and configurable OpenID Connect authentication have also been implemented. The remaining risk-evaluation path cannot safely generate the model's complete feature snapshot from the approved application and financial-information fields currently stored.

WP9 is **not ready for the full end-to-end risk-evaluation journey** until the missing model features and model-native monetary units are resolved. Local password enrollment/reset also remains outside the current authentication routes.

## Work completed

### Administrator loan offer issuance

- Added `POST /api/admin/applications/{applicationId}/offers`.
- The route requires an authenticated administrator and accepts a principal amount, term, and issuance reason. It does not accept a client-supplied interest rate or expiry.
- Added a transactional service that checks active administrator authorization, locks the application row, verifies that the current application version is approved, and reads the active loan-offer and loan-interest policies.
- The service validates principal and term against the active offer policy, derives the rate from the interest policy, and derives expiry from the policy validity period.
- An unexpired offer for the current version, an already accepted offer, or an existing loan prevents another offer from being issued.
- Offer creation and the `LOAN_OFFER_ISSUED` success audit entry share one serializable database transaction.
- Added API error mappings for ineligible applications, policy unavailability/violations, and duplicate offers.
- Added API integration coverage for policy-compliant issuance, persisted offer references, and audit actor/details. The test was not run.

### Borrower payable summary

- Added `GET /api/borrower/loans/{loanId}/payable`.
- The API scopes the query to the authenticated borrower's own active or delinquent, disbursed loan. A missing or foreign loan returns a non-disclosing 404.
- The read helper uses the same UTC due-date boundary, payable installment statuses, and remaining principal/interest calculations as repayment submission.
- Amounts are returned as decimal integer strings in satang. The endpoint is informational; repayment submission continues to recheck eligibility and outstanding amount inside its posting transaction.
- Expanded API test expectations to reconcile the response against persisted due installments. The test was not run.

### Borrower wallet and activity

- Added `GET /api/borrower/wallet`.
- The endpoint only reads the authenticated borrower's wallet and ledger entries linked to posted transactions. It does not expose another user's wallet and does not write or repair financial data.
- Wallet amounts and entry amounts are serialized as satang strings. Activity is paginated and includes direction, transaction/reference details, posted status, timestamp, and pagination metadata.
- Expanded API test expectations to compare wallet balance and activity against persisted wallet/ledger records. The test was not run.

## Remaining blockers

### Authentication account provisioning

Local login now accepts active users whose password is stored with the versioned scrypt hash. OAuth uses a configurable OIDC provider, requires a verified email, and links only to one existing active NEXUS user. It does not auto-provision accounts or assign roles. API requests accept the existing hashed Nexus session or a validated NextAuth session and recheck the active account and roles.

The local sign-in path is implemented in `POST /api/auth/login` and `POST /api/auth/logout`; it uses scrypt, an opaque eight-hour Nexus session, hashed session persistence, same-origin checks when an Origin header is supplied, and logout revocation. OAuth is served by NextAuth's callback route with PKCE/state. Deployment must configure `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXUS_OIDC_ISSUER`, `NEXUS_OIDC_CLIENT_ID`, and `NEXUS_OIDC_CLIENT_SECRET` to enable OAuth.

The repository still has no user registration, password enrollment, or password reset workflow. Existing local accounts need a scrypt hash provisioned through an approved account-management path before they can use local login. No public registration or email-verification policy was inferred.

### Borrower ML feature generation — additional inputs and units required

The owner chose application and borrower financial information as feature sources. Those contracts provide requested amount and term, income items with frequency, debt balances/payment amounts with frequency, and credit bureau score/inquiry/delinquency summary. They do not provide exact values for `acc_open_past_24mths`, `bc_util`, `sub_grade_num`, or `revol_util`; inquiries are not account openings, a score is not a documented sub-grade mapping, and debt balances without credit limits cannot yield utilization.

The existing risk contract also records unresolved monetary units for `annual_income` and `loan_amount`. Application and financial amounts are stored in satang/THB, while the model's native training units have not been approved for conversion. No complete `FeatureSnapshot` generator was added because producing defaults, proxies, or unit-mismatched values would create unsupported underwriting inputs. The current evaluation endpoint continues to reject a missing snapshot safely.

To complete this decision, the feature contract needs approved fields for opened accounts over 24 months, bankcard balance/limit, revolving balance/limit, and the model sub-grade, plus an approved mapping/source and a monetary-unit strategy (convert/retrain the model for NEXUS amounts or obtain model-native amounts).

## Files changed

- `src/lib/services/administrator-loan-offer.service.ts`
- `src/app/api/admin/applications/[applicationId]/offers/route.ts`
- `src/lib/api/errors.ts`
- `src/lib/services/repayment/repayment-submitrepayment.ts`
- `src/app/api/borrower/loans/[loanId]/payable/route.ts`
- `src/app/api/borrower/wallet/route.ts`
- `src/lib/auth.ts`
- `src/lib/auth/password.ts`
- `src/lib/auth/local-credentials.ts`
- `src/lib/auth/oauth-identity.ts`
- `src/lib/api/authentication.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/logout/route.ts`
- `src/app/api/auth/[...nextauth]/route.ts`
- `docs/api/authentication.md`
- `tests/api/authentication.integration.test.ts`
- `tests/api/admin-api.integration.test.ts`
- `tests/api/borrower-api.integration.test.ts`

## Validation status

Validation was limited to reading the affected source, schema, policy contracts, and test setup. No code or test command was run, as requested. The new and expanded API tests, typecheck, lint, and build still need to be run when you authorize execution.
