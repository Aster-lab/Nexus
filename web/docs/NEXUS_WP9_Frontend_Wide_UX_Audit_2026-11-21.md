# NEXUS WP9 Frontend Wide UX Audit

**Date:** 2026-11-21  
**Scope:** Static review of the shared frontend and borrower, investor, and administrator surfaces built during WP9.1–WP9.8.  
**Status:** Audit complete; supplied UX-01–UX-50 scenarios are reconciled in [NEXUS_WP9_UX_01_50_Review_Matrix_2026-11-21.md](NEXUS_WP9_UX_01_50_Review_Matrix_2026-11-21.md). Step 3 remains pending agreement on the refined cases and browser test harness.

## Summary

The WP9 frontend now has role-specific route trees, shared Tailwind/shadcn-style primitives, a role shell, API client, theme tokens, and working UI flows. The implementation is not yet a single consistent UI system: the admin and auth areas use shared CSS/request-state patterns, while most borrower and investor screens build their own loading, error, and empty markup. Existing UI tests provide useful server-rendered checks, but they do not exercise browser interactions, responsive viewports, keyboard behavior, or end-to-end flows.

No application code, tests, lint, build, or browser session was run during this audit. The review used source, test files, and WP9 documents only.

## Inventory

| Area | Current implementation | Audit notes |
| --- | --- | --- |
| Routing | App Router pages for auth, borrower, investor, and admin workflows | Role pages are composed from page files and role-specific components. The old WP9.1 inventory predates these additions and should be read as historical. |
| Shared component primitives | Button, card, badge, skeleton, request-state components, theme toggle | Button/Card/Badge follow shadcn conventions, but common dialogs, form fields, alerts/toasts, and retry patterns are not centralized. |
| Styling | Tailwind utilities, semantic token CSS, admin/auth/theme/request-state CSS | Consistent token source exists; auth and global shell use bespoke class systems while most later workflow screens use inline Tailwind utilities. |
| API integration | Same-origin API client, typed role clients, API envelope/error parsing, auth session provider | API errors are parsed centrally, but page-level messages and retry behavior remain component-specific. |
| Role navigation | Shared application shell, role-aware navigation and guards | Responsive CSS exists for tablet/mobile. Browser viewport rendering was not available to this review. |
| Theme | Light/dark semantic variables, system preference, persisted selection | Both themes are supported in tokens. Some legacy auth styles retain literal palette values instead of semantic tokens. |
| Financial display | Shared satang/THB formatting, statuses, transaction table | Financial values are backend sourced; tables use local horizontal scrolling when they exceed phone width. |

## Findings by work area

### 1. Shared UI and styling

- Shared UI primitives are intentionally small. Buttons, cards, badges, skeletons, theme control, and shared request states exist under `src/components/ui`.
- Shared request states are used primarily by administrator pages and the role guard. Most borrower and investor screens implement state markup locally. This produces several variations in skeleton height, empty-state phrasing, alert layout, and retry placement.
- Admin styles use Tailwind `@apply` in `src/styles/admin.css`; auth and shell use bespoke `.nexus-*` CSS in `src/styles/components/auth.css`; workflow pages primarily use Tailwind classes. This is maintainable but visually and behaviorally fragmented.
- There is no common shadcn-style Dialog/AlertDialog or reusable form-field/error component. Confirmation overlays are hand-authored in borrower/investor/admin pages.
- Success feedback appears as inline notices or state changes; no shared notification/toast pattern is present.

### 2. API and request states

- `api-client.ts` consistently enforces same-origin `/api` paths, same-origin credentials, no-store requests, error-envelope validation, and a structured `ApiClientError`.
- `AuthProvider` supplies a session refresh path and handles 401 responses. Page-specific calls do not consistently use a common unauthorized callback, so expired-session experience should be reviewed across page families.
- Admin screens commonly use shared `LoadingState`, `ErrorState`, and `EmptyState`. Borrower and investor pages mix shared-independent skeletons, inline alerts, empty copy, and custom retry buttons.
- Independent dashboard data states are present in borrower, investor, and admin dashboards. Error recovery is not uniform across list/detail pages.
- `SubmissionGuard` exists but is not used by UI components. Individual forms instead use local `busy`/`pending` flags and, in some flows, persisted uncertainty state. This is adequate as a local visual guard in many cases, but the shared duplicate-submit policy should be clarified and covered by interaction tests. Backend idempotency remains authoritative for financial operations.

### 3. Forms and success/pending behavior

- Forms use a mix of native HTML constraints, custom inline validation, and backend error messages. Borrower application and repayment forms have careful inline error associations; investment amount validation also uses `aria-invalid` and `aria-describedby`.
- Form field patterns, error summaries, backend validation presentation, and pending labels differ between authentication, borrower, investor, and admin forms.
- Financial writes use confirmation and pending states in key repayment, investment, payout, and application/offer flows. The audit did not execute those flows, so the correctness of state transitions remains unverified.
- The frontend preserves backend authority for financial amounts and status. This must remain a non-regression condition for every UX change.

### 4. Responsive presentation

- Tailwind breakpoints and media queries exist across shared, auth, admin, borrower, investor, and recommendation screens.
- Tables with many columns use an `overflow-x-auto` wrapper and a deliberate minimum table width. This avoids squeezing financial columns but requires horizontal scrolling on phones. The UX acceptance tests should state whether scrollable tables are acceptable for each view or whether selected fields should become stacked cards.
- The app shell switches navigation layout at tablet/mobile breakpoints, and admin navigation changes from a horizontal scroller to a desktop sidebar.
- No desktop/tablet/mobile viewport screenshots or browser measurements were available. The responsive audit is source-level only; clipped content, tap target behavior, and actual horizontal overflow are not confirmed.

### 5. Accessibility

- Most pages use semantic headings, labels, `role="alert"`/`role="status"`, captions for data tables, and focus-visible styles. Reduced-motion handling is present for shared request spinners and auth button transitions.
- Dialogs are hand-built. They commonly include `role="dialog"`, `aria-modal`, and labelled descriptions, but there is no shared focus trap/initial focus/restore focus/Escape handling pattern. These need keyboard checks before standardizing dialogs.
- Loading and error announcements vary. Some skeletons expose `aria-busy`; others provide a `role="status"` label or a visually hidden message. State announcements should be normalized without causing repetitive screen-reader output.
- No automated accessibility checker or keyboard/screen-reader session was run.

### 6. Existing test coverage

- There are **24 component test files** under `tests/components`.
- All current component test files use `react-dom/server` `renderToStaticMarkup`; there is no installed/configured Testing Library, DOM environment, Playwright, or other browser interaction runner in `package.json`/`tests`.
- The suites mostly assert initial loading markup, static labels/disclosures, and selected status/empty markup. They do not exercise input, submit, retry, cancellation, focus order, mobile breakpoints, browser navigation, or full API-driven state transitions.
- Existing component suites cover the main dashboard/list/detail surfaces for investor and admin, and several borrower loan/offer/repayment surfaces. Tests are missing for login, registration, auth provider/shell/role navigation, borrower application list/create/edit/detail, and admin navigation. Some paired component suites cover both a list and a detail component, so filename matching alone understates coverage.
- Client API unit tests and API integration tests exist separately. Their presence does not establish browser UI interaction coverage or passing runtime results.

Representative sources:

- Shared controls and states: `src/components/ui/`
- Auth shell and provider: `src/components/auth/`
- Theme tokens and styles: `src/styles/tokens.css`, `src/styles/components/`, `src/styles/admin.css`
- Borrower UI: `src/components/borrower/`
- Investor UI: `src/components/investor/`
- Admin UI: `src/components/admin/`
- Component test inventory: `tests/components/`

## Prioritized improvement sequence

1. **Reconcile UX-01–UX-50.** Compare each supplied scenario to current routes and tests. Keep expected behavior aligned with backend authority, ownership, and financial safety. Do not invent cases or claim coverage from a static markup assertion.
2. **Agree on the test set and test harness.** For interactive validation, state transitions, keyboard dialogs, and responsive viewport checks, select a DOM/browser test approach. Keep current Vitest server-rendered checks where they add value.
3. **Standardize shared UI.** Align error/empty/loading/success/unavailable states, form field/error display, status badges, notification treatment, and confirmation dialogs while retaining role-specific copy and API rules.
4. **Improve form behavior.** Agree consistent field validation, backend error mapping, pending state, preserved input, duplicate-submit guards, and uncertain-result recovery. Never automatically replay financial writes.
5. **Normalize API state recovery.** Add consistent retry/refresh actions only where safe and use explicit stale/partial-data copy when independent sections succeed or fail separately.
6. **Verify responsive behavior.** Check 320–390 px phones, tablet widths, and desktop, including the header, admin nav, cards, forms, confirmation dialogs, tables, and keyboard-visible controls.
7. **Complete accessibility review.** Verify labels/error descriptions, focus order, dialog focus/escape/restore behavior, live announcements, contrast, keyboard-only use, and reduced-motion behavior.

## UX-01–UX-50 reconciliation status

The user supplied the UX-01–UX-50 scenario list after the audit. A case-by-case matrix now records current implementation/test evidence, coverage level, and refined expected behavior in [NEXUS_WP9_UX_01_50_Review_Matrix_2026-11-21.md](NEXUS_WP9_UX_01_50_Review_Matrix_2026-11-21.md). The matrix requests agreement on the refined criteria, responsive viewport targets, and browser interaction test tooling before Step 3 begins.

## Validation statement

This document records source and documentation inspection only. No test, lint, typecheck, build, application server, or browser viewport was run. No frontend behavior was changed during the audit.
