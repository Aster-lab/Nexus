# NEXUS WP9 — Frontend Integration Review and Status

**Review date:** 2026-11-21  
**Review scope:** WP9.1 through WP9.4.7 implementation and available WP9 planning/status documents  
**Method:** Static source and documentation review only. No tests, typecheck, lint, build, server, or other application commands were run.

## Executive status

WP9 has made substantial progress, but **WP9 is not complete**. The shared frontend foundation, authentication and role shell, and the borrower journey through repayment history/receipt retrieval are implemented in source. Investor and administrator routes still include workflow placeholders, WP9.4.8 borrower end-to-end integration/regression remains, and WP9.7–WP9.9 remain open. Authored tests have not been executed, and current component tests render static markup rather than exercise browser interactions.

The MVP prediction capability is intentionally unavailable. The interface must continue to communicate manual review without producing a score, tier, or probability until an approved NEXUS THB model and dataset exist.

## Phase review

| Phase | Reviewed status | Notes |
| --- | --- | --- |
| WP9.1 — frontend audit and API map | Complete as documentation | Inventory, API map, structure, theme, UX, model-unavailable decisions were captured. The map should be kept aligned as later work changes APIs. |
| WP9.2 — shared client and UI states | Implemented; runtime verification open | Same-origin typed API client, common request states, submission guard, theme toggle, semantic light/dark tokens, Tailwind/shadcn-compatible primitives. |
| WP9.3 — authentication and role shell | Implemented; runtime verification open | Local login, configured OIDC entry, logout/session refresh, registration for borrower/investor/both, client role navigation/guards. Backend remains the authorization boundary. |
| WP9.4.1 — borrower dashboard | Implemented; runtime verification open | API-backed sections and independent loading/error/empty behavior. Uses persisted backend summaries. |
| WP9.4.2 — application list and create | Implemented; runtime verification open | Draft creation, schema-aligned fields, status filter and supported pagination/sort. |
| WP9.4.3 — application detail/edit/submit | Implemented; runtime verification open | Backend-provided permissions, versioned draft editing, explicit submit confirmation, server refresh after mutation. |
| WP9.4.4 — offers | Implemented; runtime verification open | List/detail/terms/fee disclosure and confirmed acceptance. No invented installment quote. |
| WP9.4.5 — loans and schedule | Implemented; runtime verification open | List/detail and persisted schedule displays; the browser does not calculate financial schedule values. |
| WP9.4.6 — repayment submission | Implemented; runtime verification open | Payable API, THB-to-satang input validation, idempotency, duplicate guard, uncertain-outcome flow, refresh after confirmed success. |
| WP9.4.7 — repayment history/receipt | Implemented; runtime verification open | Paginated persisted history and existing receipt retrieval route. No receipt model or UI-specific API. |
| WP9.4.8 — borrower flow integration/regression | Open | Needs a full workflow review and focused acceptance/regression execution when authorized. |
| WP9.5 — investor workflows | Not implemented | Existing route inventory includes overview/marketplace/portfolio entry points, but overview is a placeholder; detailed workflow pages and acceptance coverage remain. |
| WP9.6 — administrator workflows | Not implemented | Operations/application entry points exist but overview remains a placeholder. Funding, disbursement, payout, reconciliation, audit, and user workflows need review/implementation. |
| WP9.7–WP9.8 — shared financial UX, accessibility, responsive review | Open / needs cross-flow verification | Individual screens include responsive/accessibility patterns, but no system-wide browser or accessibility verification has been completed. |
| WP9.9 — integrated UI test and regression | Open | Focused tests are authored, but execution is outstanding. Current component tests use `react-dom/server`; no browser automation or interactive component test harness appears in `package.json`. |

## Implemented foundation and decisions

### Frontend architecture and styling

- Route `page.tsx` files compose workflow pages; UI/domain components and client/API helpers are kept in their own modules.
- Tailwind utility classes and shadcn-compatible UI primitives are used. Theme tokens and component styling are in `src/styles/...` rather than being centralized in page files.
- The palette follows the agreed deep blue `#0A3C6E`, bright blue `#1783C1`, white, and charcoal `#333333`, with light/dark semantic tokens and a persisted theme preference.
- UI feedback includes loading, empty, error, retry, unavailable, confirmation, and posted/pending distinctions in the implemented borrower/auth screens.

### Authentication and roles

- Local and configured OAuth sign-in are supported through existing backend session mechanisms. Session tokens remain in HttpOnly cookies.
- Borrower and investor self-registration supports either role or both; administrators cannot self-register. MVP registration permits immediate login; verification can be added later.
- Role navigation and route guards improve user flow but are not considered authorization controls. Backend APIs enforce ownership and permissions.

### Financial display and workflow integrity

- The backend remains authoritative for status, schedule, payable amounts, repayment allocation, wallet/ledger state, and receipt data.
- Satang integer strings remain the API representation; browser formatting is presentation-only.
- Financial writes use the documented idempotency mechanism and confirmed responses. Uncertain repayment outcomes are not presented as success.
- The repayment history API supports server pagination/sorting but does not support loan/status filters; WP9.4.7 therefore does not add client-side filters over incomplete pages.
- Receipt retrieval assembles output from persisted repayment, borrower, installment, and posted ledger records. It does not create a new receipt model or frontend-specific API.

## Review findings and remaining risks

1. **WP9 completion must not be reported yet.** WP9.4.8, WP9.5, WP9.6, and WP9.7–9.9 remain unfinished or unverified.
2. **No runtime evidence exists for this review.** Reports document source review and authored tests, not passing test results. Continue to honor the instruction not to execute tests unless explicitly requested.
3. **Frontend interaction test coverage is limited.** `package.json` includes Vitest and React server rendering, but no browser automation or DOM interaction test dependency/configuration was found. Existing component tests only assert static loading markup; they do not prove form interactions, navigation, responsive behavior, or complete request states.
4. **No end-to-end borrower journey has been verified.** The code for the individual stages exists, but workflow transitions across application → offer → accepted loan → repayment → receipt need integrated review and authorized regression execution.
5. **Investor and admin surfaces are incomplete.** Current route inventory contains their entry points, while overview pages visibly render `WorkspacePlaceholder`. The planned operational workflows should not be implied as complete in product status.
6. **Prediction is unavailable by product decision.** No approved labeled NEXUS THB dataset exists yet. Keep the unavailable/manual-review state until model training and approval work is completed.
7. **Some earlier phase reports contain forward-looking follow-ups that are now stale.** For example, WP9.4.1 and WP9.4.2 reports describe later borrower stages as future work. This consolidated status supersedes those stage-local follow-up statements; the historical implementation notes need not be rewritten to make the chronology clear.
8. **Registration email verification remains deferred.** Current MVP behavior activates the account without email verification. The registration/session design leaves room for later verification, but delivery, verification tokens, and enforcement are not part of the current completed scope.

## Recommended completion order

1. Complete WP9.4.8: statically review every borrower transition, refresh path, ownership/error state, and cross-page link. When test execution is authorized, run only the correlated borrower UI/API tests first, then agreed regression coverage.
2. Implement WP9.5 investor workflows, including marketplace/detail, contribution, portfolio, allocations, and payout history; recommendations stay unavailable/stale as returned by the backend and must not be fabricated.
3. Implement WP9.6 admin workflows using the existing permissions and transaction services, particularly application decisions/offers, funding/disbursement, repayment monitoring, payouts, reconciliation, audit, and user-status administration.
4. Complete WP9.7–WP9.8 shared financial UX, accessibility, responsive, theme, and cross-role consistency review.
5. Decide and configure an interactive UI/browser test harness, then complete WP9.9 acceptance and regression coverage. Keep financial writes free of automatic replay and use backend idempotency for explicit retries.
6. Produce a final WP9 completion report only after the remaining scope and required validation are actually complete.

## Documents reviewed

- `NEXUS_WP9_1_Frontend_Audit_and_UI_API_Map_2026-11-21.md`
- `NEXUS_WP9_Backend_Readiness_Assessment_2026-11-21.md`
- WP9.2 shared API client report
- WP9.3 authentication and role shell report
- WP9.4.1 through WP9.4.7 stage reports
- `docs/api/borrower-api.md` and the existing borrower/auth API route implementations
- Current route inventory under `src/app`, borrower UI components, and frontend package dependencies

## Validation statement

This is a source/documentation review, not runtime validation. No tests, app code, typecheck, lint, build, or browser session were run. The next report should distinguish authored tests from executed/passing tests.
