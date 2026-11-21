# NEXUS — Remaining Major Phases to MVP Completion

**Date:** 21 November 2026  
**Purpose:** Ordered work plan from current backend/API implementation through a demonstrable, role-based NEXUS MVP.  
**Planning basis:** Current WP8 readiness report, WP9 Frontend Integration plan, and the 20 November remaining-work roadmap.

## Current position

WP6 repayment processing, WP7 investor payouts, and WP8 APIs have substantial implementation and test coverage in the repository. WP9 remains planned. WP8 is not runtime-accepted: reported test/type fixes have not all been rerun, a full production build has not been recorded, and frontend integration has not been exercised.

Known items to carry into the work:

- The API-05-07 funding response, API-03-15 repayment error mapping, and platform-account seed test were fixed after a user-reported test run. These fixes still need a focused rerun.
- The empty marketplace page now exports a valid component but renders no content. It is a placeholder, not a finished marketplace UI.
- The TypeScript issues in the marketplace page and recommendation candidate type were patched but `npx tsc` has not been rerun.
- A targeted ESLint check passed for the platform-policy seed test after replacing explicit `any`; the user's full lint output still contained 15 unrelated unused-variable warnings.
- API-02 validates persisted sessions but no login/session issuer was found. A trusted authentication provider or session-issuance implementation must be selected before the UI can support a complete sign-in journey.
- Borrower evaluation requires an existing validated `FeatureSnapshot`; the current backend does not generate one from an application. The UI journey needs either a feature-generation integration or an explicit manual-review path when no snapshot is available.
- The current admin API inventory has application decisions but no obvious administrator offer-issuance endpoint. Confirm whether an existing workflow issues offers; add the missing workflow/API only if the audit confirms it is needed.
- Investor wallet projection is available in portfolio data. Confirm whether the borrower UI requires a wallet balance or transaction-history view that has no corresponding borrower API.

## Phase 1 — Close backend readiness and resolve integration blockers

**Objective:** Establish a stable, evidenced backend/API baseline before wiring UI workflows.

### Work

1. Rerun the three correlated failures after their fixes: administrator API, borrower API, and platform-account seed test.
2. Rerun `npx tsc` after the marketplace page and recommendation typing changes.
3. Review and clear the remaining full-lint warnings, or record an agreed warning baseline.
4. Run the focused WP6 repayment, allocation, receipt, idempotency, atomicity, authorization/audit, and reconciliation suites.
5. Run the focused WP7 payout and reconciliation suites.
6. Confirm session issuance/authentication provider ownership and configuration.
7. Confirm application-to-feature-snapshot generation and how unavailable ML evaluation is handled.
8. Confirm offer issuance and any borrower wallet read requirements against the existing services and frontend acceptance scope.

### Completion gate

- Correlated fixes pass their focused checks.
- TypeScript and lint results are recorded.
- WP6 and WP7 financial invariants have runtime evidence: balanced ledger, reconciled wallet projections, atomic commits/rollbacks, no duplicate posting, immutable posted history.
- Session issuance and feature-snapshot dependencies have an implementation owner and agreed interface.
- Any offer or borrower-wallet API gap is either closed or explicitly excluded from the MVP acceptance path.

## Phase 2 — Audit the frontend and map every workflow to an API

**Objective:** Understand the existing UI and define a concrete integration plan before adding screens or changing navigation.

### Work

- Inventory Next.js routes, page components, shared components, mock data, hardcoded financial values, and existing test tooling.
- Classify every page/action by borrower, investor, or administrator role.
- Map application, offer, loan, schedule, repayment, receipt, marketplace, contribution, portfolio, payout, reconciliation, audit, and account actions to WP8 APIs.
- Identify mismatches between UI needs and API response/query contracts; document approved gaps rather than adding frontend-only business logic.
- Replace the current empty marketplace placeholder with the integrated marketplace in the investor phase.
- Produce a UI-to-API matrix and implementation sequence.

### Completion gate

- Each MVP workflow has a route/page, role, API endpoint, expected request/response, and error/loading/empty state.
- Missing APIs/services and authentication dependencies are explicit and prioritized.

## Phase 3 — Build the shared application shell, API client, and authentication navigation

**Objective:** Establish reusable integration patterns used by all three roles.

### Work

- Implement a typed shared API client for the common success/error envelopes and paginated responses.
- Handle session cookies, expired sessions, `401`, `403`, validation errors, conflicts, and network failures consistently.
- Add shared loading, submitting, success, error, empty, and pagination components.
- Build responsive application layout and role-aware navigation.
- Integrate the confirmed session issuer/provider with `/api/auth/me` and `/api/users/me`.
- Prevent repeated submissions in the UI for financial operations while retaining backend idempotency as the source of safety.

### Completion gate

- Signed-in user and role navigation derive from the authenticated backend identity.
- No client-supplied role or user ID is treated as authorization.
- Shared client handles success, error, expired-session, and pagination behavior consistently.

## Phase 4 — Deliver the borrower application-to-repayment journey

**Objective:** Let a borrower complete the supported application, acceptance, loan servicing, and repayment flow using real backend data.

### Work

- Application draft creation/editing, validation, submission, status, and version/history display.
- ML evaluation state, risk/manual-review feedback, and persisted prediction display only as authorized.
- Offer list/detail, expiry, acceptance, and transition to the created funding loan.
- Loan detail and backend-generated schedule display.
- Repayment amount entry, partial/full submission with idempotency key, payable-balance/business errors, and receipt/history retrieval.
- Clearly distinguish a submitted request from a backend-confirmed posted repayment.

### Completion gate

- An authenticated borrower completes the supported application → review/offer → acceptance → loan/schedule → repayment → receipt flow without mock financial state.
- If offer issuance or feature generation is required but absent, its backend dependency is resolved before claiming the complete journey.

## Phase 5 — Deliver investor and administrator operations, including financial information

**Objective:** Complete investor discovery/investment and administrator platform operations with backend-controlled financial values.

### Investor work

- Marketplace list/detail with funding progress, recommendation explanations, stale/unavailable states, and borrower privacy.
- Contribution flow, confirmation, and duplicate prevention.
- Portfolio, investment details, allocation and payout history, wallet projection, and transaction references.
- Never permit investor-initiated payout or direct wallet changes.

### Administrator work

- Application review and decision, including information needed for any offer workflow.
- Loan/funding/escrow status and authorized disbursement.
- Repayment monitoring and investor payout processing.
- Read-only reconciliation, audit history, and permitted user account status actions.
- Clear separation of read-only reporting from financial write operations.

### Completion gate

- An investor can discover an eligible loan, contribute, and view persisted investment/allocation/payout state.
- An administrator can carry out supported review, disbursement, payout, reconciliation, audit, and user-status actions.
- No UI directly writes balances, ledger rows, payout amounts, or status projections.

## Phase 6 — Frontend UX, accessibility, and integrated workflow verification

**Objective:** Validate that all role journeys behave correctly across responsive layouts and real API outcomes.

### Work

- Complete frontend component, API-integration, and workflow tests before implementation of remaining screens.
- Cover auth/role boundaries, application validation, offer expiry, marketplace empty/stale cases, duplicate financial submissions, repayment errors, payout failures, and read-only reconciliation.
- Verify responsive layouts for desktop, tablet, and mobile.
- Verify accessible labels, keyboard navigation, status announcements, and clear simulated-money disclosures.
- Run a complete borrower → administrator → investor → disbursement → repayment → payout demo with deterministic data.

### Completion gate

- Every role’s critical path is exercised through UI and API.
- Failed, pending, and unavailable operations are not presented as successful.
- WP6, WP7, and WP8 regression remains green.

## Phase 7 — WP10 end-to-end release and operational readiness

**Objective:** Produce evidence that the integrated MVP is safe to demonstrate and deploy to its intended environment.

### Work

- Run the agreed API, financial-service, frontend, and end-to-end suites against the dedicated test database.
- Run TypeScript, full lint, migrations/schema checks, and production build; record command output and addressed warnings.
- Verify environment values are present in the target environment without exposing secrets; confirm Python service connectivity and timeouts.
- Confirm authentication/session issuance, test/demo accounts, deterministic data, and role permissions.
- Reconcile ledger transactions, wallets, escrow, repayments, installments, allocations, payouts, and clearing.
- Document known limitations, recovery steps, deferred features, and the simulated THB financial model.

### Completion gate

- Complete three-role demo succeeds from sign-in through investor payout.
- Required tests, typecheck, lint, migrations, and production build have recorded passing results.
- Financial reconciliation is clean or every discrepancy is documented and resolved before demo/release.

## Recommended dependency order

```text
Phase 1 Backend readiness and blockers
  → Phase 2 Frontend audit and API mapping
  → Phase 3 Shared API/auth shell
  → Phases 4 and 5 Role workflows
  → Phase 6 UX and integrated workflow verification
  → Phase 7 WP10 release readiness
```

Borrower and investor UI implementation can proceed in parallel after the shared client/auth shell, provided their backend dependencies are agreed. Administrator offer issuance and borrower feature-snapshot generation should be resolved before the end-to-end flow is declared complete.

## Post-MVP candidates

The roadmap identifies full notification delivery, support operations, advanced document scanning/retention workflows, advanced alert/reporting/ML analytics, real payment rails, production withdrawals, and formal disaster-recovery exercises as potential deferrals unless the demo or deployment acceptance criteria require them. NEXUS remains a simulated THB lending platform until real payment integration is explicitly scoped and approved.

## Completion definition

NEXUS MVP completion means a borrower, investor, and administrator can complete their authorized workflows through the frontend, with backend-confirmed financial data, persisted and reconciled ledger state, and passing recorded integration/regression checks. Code presence, authored tests, or a successful static review alone do not satisfy this gate.
