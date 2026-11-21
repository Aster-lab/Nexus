# NEXUS WP9.1 Frontend Audit and Integration Map

**Date:** 21 November 2026  
**Work package:** WP9.1 — Frontend Audit and Integration Preparation  
**Review method:** Static inspection of frontend source, API route handlers, endpoint guides, and the WP9 implementation plan. No application code or tests were run.

## Summary

WP9.1 finds that frontend integration has not started. The application has a Next.js starter home page, an empty marketplace route, one root layout, and a global Tailwind stylesheet. It has no role dashboards, workflow pages, reusable UI components, shared frontend API client, explicit theme control, or frontend-specific test tooling. The WP8 API layer covers most borrower, investor, and administrator operations, so the frontend can be built around those server-owned workflows. Several gaps and one stale API-guide statement must be accounted for before claiming full workflow coverage.

The first frontend implementation should establish the shared shell, session-aware API client, role navigation, and reusable request states before building borrower, investor, and administrator pages. Prediction is explicitly **unavailable** for the MVP: the UI must explain that the model is not ready and route the application to administrator review. It must not show a fabricated score, tier, or probability.

## 1. Frontend inventory

| Area | Current state | WP9 implication |
|---|---|---|
| Routes | `src/app/page.tsx` is the default Next.js starter content. `src/app/marketplace/page.ts` returns `null`. No borrower, investor, administrator, auth, application, loan, repayment, portfolio, or operations pages exist. | All role workflows require new pages. The marketplace is a placeholder and must be replaced during investor integration. |
| Layout | One `src/app/layout.tsx` loads Geist fonts, metadata, and global CSS. Metadata still says “Create Next App.” | Replace starter metadata and build a shared responsive shell during WP9.2/WP9.3. |
| Components | No `src/components` directory or shared application components were found. | Build common navigation, page layout, form controls, cards, tables, status labels, alerts, loading, empty, and error states once. |
| Styles | Only `src/app/globals.css` exists. It defines neutral colors and follows the OS dark preference; there is no explicit theme selector or `src/styles` structure. | Keep page behavior/composition in route `page.tsx` files and place visual rules in dedicated files under `src/styles/...`, per the project direction. Create semantic tokens for both themes and the blue/white/charcoal palette. |
| API client | No browser-side `fetch` client, Axios client, data hooks, or state-management layer exists. The only `fetch` calls are server-side ML service calls in API handlers. | Add a typed same-origin API client in WP9.2. It must parse shared envelopes, send cookies, preserve satang strings, and centralize errors and auth expiry. |
| Authentication UI | No login/logout pages or route guards exist. The backend has local login/logout, current-user endpoints, and optional OIDC. | Integrate the implemented session mechanism in WP9.3. Never accept client role or user ID as authorization. |
| Test tooling | Vitest is configured for Node and the existing tests are backend/API/service tests. No component-rendering library, browser automation framework, or frontend workflow suite is present in `package.json` or `web/tests`. | Choose and document a frontend test harness in WP9.2/WP9.9 before UI implementation tests are authored. Do not claim the frontend has been integration-tested. |
| UI/UX direction | No existing product visual system or user-facing workflow is implemented. The WP9 plan requires clear loading, empty, error, success, pending, and unavailable states; responsive layouts; financial safety; and no false success state. | Apply these through calm hierarchy, short guided steps, inline validation, progress/context cues, clear confirmation, and transparent simulated-money labels. Avoid urgency or scarcity prompts around borrowing/investing. |

### Existing page source files

- `src/app/page.tsx` — starter landing page with Next.js links and logos.
- `src/app/marketplace/page.ts` — returns `null`.
- `src/app/layout.tsx` — root font/layout setup with starter title/description.
- `src/app/globals.css` — Tailwind import, neutral CSS variables, OS dark preference.

## 2. UI-to-API map

All money displayed by the frontend must remain a decimal satang string at the API boundary and render as THB using a shared formatting utility. The browser must not calculate interest, schedules, payable balances, allocation amounts, payout amounts, ledger effects, or wallet balances.

### Shared session and user identity

| UI workflow | API | Notes |
|---|---|---|
| Sign in with email/password | `POST /api/auth/login` | Sets the secure same-origin `nexus_session` cookie. Show generic invalid-credentials errors. |
| Sign in with configured OAuth provider | NextAuth `/api/auth/*` callback routes | Provider is available only when deployment OIDC settings exist. |
| Sign out | `POST /api/auth/logout` | Revokes the local session and clears session cookies. |
| Load signed-in identity and roles | `GET /api/auth/me` or `GET /api/users/me` | Use backend roles/profile as the navigation source. |
| Edit user profile | `PATCH /api/users/me` | Only supported role-specific fields; server validation remains authoritative. |

### Borrower workflows

| UI workflow | API | Current gap/state |
|---|---|---|
| Application list and status | `GET /api/borrower/applications` | Available; paginate from backend metadata. |
| Create/edit application draft | `POST /api/borrower/applications`, `PATCH /api/borrower/applications/{applicationId}` | Available; edits create a new version. |
| Save verified financial information | `POST /api/borrower/applications/{applicationId}/financial-information` | Available for a draft; credit v2 supports bureau score, recent account openings, and utilization source balances/limits. |
| Submit application | `POST /api/borrower/applications/{applicationId}/submit` | Available; submitted version becomes immutable. |
| Application detail/review status | `GET /api/borrower/applications/{applicationId}` | Available. |
| Prediction status | `POST /api/ml/borrower-evaluation`; retrieve result with `GET /api/ml/borrower-evaluation/{evaluationId}` | **Unavailable in MVP.** No approved NEXUS THB model is trained/active. Display “manual review” without a probability/tier; do not repeatedly call the endpoint as a retry loop. |
| Offer list/detail | `GET /api/borrower/offers` | Available; show backend expiry and status. |
| Accept offer | `POST /api/borrower/offers/{offerId}/accept` | Available; handle expired/already-accepted conflict. |
| Borrower loans and detail | `GET /api/borrower/loans`, `GET /api/borrower/loans/{loanId}` | Available. |
| Repayment schedule | `GET /api/borrower/loans/{loanId}/schedule` | Available and persisted; never create or recompute it in the browser. |
| Current payable summary | `GET /api/borrower/loans/{loanId}/payable` | Available; use for display only. Submission revalidates the amount in the backend transaction. |
| Submit repayment | `POST /api/borrower/repayments` | Available; require `Idempotency-Key`; show success only after persisted POSTED response. |
| Receipt detail | `GET /api/borrower/repayments/{repaymentId}/receipt` | Available for a known repayment ID. |
| Borrower wallet/activity | `GET /api/borrower/wallet` | Available and paginated. |
| Repayment history list | `GET /api/borrower/repayments` | Added during WP9.3 follow-up; borrower-scoped and paginated with persisted repayment, installment, and ledger references. |

### Investor workflows

| UI workflow | API | Notes |
|---|---|---|
| Investor profile | `GET /api/investor/profile`, `PATCH /api/investor/profile` | Available. |
| Marketplace list/detail | `GET /api/investor/marketplace`, `GET /api/investor/marketplace/{loanId}` | Available; only public loan information is returned. |
| Personalized recommendations | `POST /api/ml/investor-recommendations`, `GET /api/ml/investor-recommendations` | Available if compatible active model/preferences exist; show stale/unavailable state as returned. Recommendations are informational, never authorization. |
| Submit contribution | `POST /api/investor/investments` | Available; require idempotency key and show backend-confirmed result. |
| Investment list/detail | `GET /api/investor/investments`, `GET /api/investor/investments/{investmentId}` | Available and investor-scoped. |
| Portfolio/wallet summary | `GET /api/investor/portfolio` | Available; display backend projection. |
| Allocation history | `GET /api/investor/allocations` | Available and read-only. |
| Payout history/detail | `GET /api/investor/payouts`, `GET /api/investor/payouts/{payoutId}` | Available and read-only. Investor payout POST returns method-not-allowed; payout is admin/service initiated. |

### Administrator workflows

| UI workflow | API | Notes |
|---|---|---|
| Application queue/detail | `GET /api/admin/applications`, `GET /api/admin/applications/{applicationId}` | Available; list supports status filtering and pagination. |
| Application decision | `POST /api/admin/applications/{applicationId}/decision` | Available; requires reason and records authenticated admin actor. |
| Issue loan offer | `POST /api/admin/applications/{applicationId}/offers` | Available; backend derives rate/expiry from active policy. |
| Loan queue/detail | `GET /api/admin/loans`, `GET /api/admin/loans/{loanId}` | Available. |
| Funding/escrow history | `GET /api/admin/loans/{loanId}/funding` | Available. |
| Disbursement | `POST /api/admin/loans/{loanId}/disburse` | Available; idempotency key required; display the confirmed transaction state. |
| Repayment monitoring | `GET /api/admin/repayments` | Available. |
| Payout queue/history | `GET /api/admin/payouts` | Available. |
| Process an investor payout | `POST /api/admin/payouts` | Available; pass allocation ID and idempotency key. The backend determines exact amount. |
| Reconciliation | `GET /api/admin/reconciliation` | Available, read-only; discrepancies must be presented, never repaired by UI. |
| Audit history | `GET /api/admin/audit-logs` | Available and paginated. |
| User list/status action | `GET /api/admin/users`, `PATCH /api/admin/users/{userId}` | Available; account status only. UI must not expose role assignment. |
| Aggregate administrator dashboard | No dedicated summary endpoint found | Can be deferred or built from paginated lists only if the UI does not imply those partial pages are platform totals. Prefer a dedicated backend summary if aggregate KPIs are in MVP acceptance. |

## 3. Integration gaps and documentation findings

1. **No implemented frontend workflows.** Authentication and all three role areas need UI routes and components.
2. **No frontend API client or data-state components.** WP9.2 needs a common envelope parser, cookie handling, error mapping, abort behavior, and loading/error/empty/success states.
3. **No explicit theme switch.** Current CSS only follows `prefers-color-scheme`. WP9 must support light/dark selection and persist a user preference without flash; use semantic CSS variables for `#0A3C6E`, `#1783C1`, white, and charcoal with accessible contrast variants.
4. **Prediction remains unavailable.** The current artifacts are legacy LendingClub v1; the NEXUS THB v2 model needs an authorized labeled training dataset. The UI must show manual review without a fake risk score.
5. **Borrower repayment history gap resolved during WP9.3 follow-up.** `GET /api/borrower/repayments` now provides borrower-scoped persisted history with pagination.
6. **Administrator aggregate dashboard data is not available as one API.** Do not compute financial totals from partial pages in the frontend.
7. **No browser/component test runner is installed/configured.** Existing Vitest configuration is Node-only. Add a decision on the frontend test stack before building integrated workflows.
8. **Stale authentication API guide corrected.** `docs/api/api-overview.md` claimed session issuance was absent. Local login/logout and optional OIDC are implemented; the guide now points to the authentication contract.
9. **Borrower API guide updated.** The financial-information draft endpoint and v2 bureau input contract are now documented.

## 4. Agreed frontend structure and visual direction

- Route `page.tsx` files own page composition, request orchestration, and workflow-specific state.
- Visual rules live in separate files under `src/styles/...`; do not put page-specific styling in route files.
- Shared UI components, once introduced, are separate reusable components; API/domain logic stays outside style files.
- Use the selected palette as semantic tokens: deep blue `#0A3C6E`, bright blue `#1783C1`, white, and charcoal `#333333`, with theme-specific surfaces/text/borders and contrast-checked interactive states.
- Provide an explicit light/dark theme control, respect system preference on first visit, and persist the chosen setting locally without storing financial data in browser storage.
- Layouts must adapt from mobile through desktop. Financial values and actions must remain readable and operable without horizontal scrolling at supported mobile widths.
- UX should lower uncertainty: show step progress for long applications, inline and specific validation, explain why information is requested, preserve entered non-sensitive form data during recoverable errors, confirm irreversible actions, and distinguish pending from posted/completed states. Avoid pressure, false scarcity, or dark patterns in lending/investment decisions.
- Prediction status uses a clear unavailable/manual-review message. Never present unavailable as a failed borrower submission or show a fabricated estimate.

## 5. Recommended implementation order

1. **WP9.1 complete:** accept this route/API map and resolve/record the borrower repayment-history and aggregate dashboard scope.
2. **WP9.2:** choose frontend test tooling; build typed API client and shared loading/error/empty/status components; establish CSS tokens and theme provider/control.
3. **WP9.3:** build root shell, login/logout, `/api/auth/me` session refresh, role-aware navigation, and protected route behavior.
4. **WP9.4:** borrower application, financial information, submission, offers, loan/schedule, repayment, wallet/activity, and receipt. Prediction is unavailable/manual review.
5. **WP9.5:** investor marketplace, recommendation state, contribution, portfolio, allocations, and payout history.
6. **WP9.6:** admin application review/offers, loan funding/disbursement, repayment monitoring, payouts, reconciliation, audit, and user status.
7. **WP9.7–WP9.8:** unify financial information and UX/accessibility/responsive behavior across roles.
8. **WP9.9:** author focused UI-to-API tests before each integration, then run approved focused suites and relevant regressions.

## 6. WP9.1 completion status

| Criterion | Status |
|---|---|
| Existing frontend structure inventoried | Complete |
| Borrower, investor, administrator UI entry points identified | Complete; most are missing and must be created |
| UI workflows mapped to API routes | Complete in this report |
| Missing API/UI/tooling gaps recorded | Complete in this report |
| Prediction marked unavailable for MVP | Complete as an integration requirement; no prediction UI implemented in this audit phase |
| No implementation before integration requirements are understood | Satisfied; this phase made documentation-only changes |
| Runtime test evidence | Not run, per instruction |

## 7. Documentation changes in this phase

- `docs/api/api-overview.md`: corrected the stale statement that sign-in/session issuance is absent.
- `docs/api/borrower-api.md`: documented the draft financial-information endpoint and its bureau v2 purpose.
- This WP9.1 audit/report contains the frontend inventory, UI-to-API map, gaps, prediction unavailability state, structure/visual decisions, and recommended WP9 sequence.
