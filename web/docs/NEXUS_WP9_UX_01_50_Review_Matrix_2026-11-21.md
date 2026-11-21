# NEXUS WP9 UX-01–UX-50 Review Matrix

**Date:** 2026-11-21  
**Purpose:** Refine the supplied UX acceptance scenarios against current WP9 source and authored tests before shared UI changes begin.  
**Review method:** Source/test-file review only. No tests, lint, build, typecheck, server, or browser session was run.

## Coverage key

- **Existing:** A current test directly covers the underlying requirement at its current unit, API, or static-markup level.
- **Partial:** Relevant implementation or supporting tests exist, but the specified UI behavior is not directly tested.
- **Gap:** No direct component/interaction/viewport test currently covers the requirement.

“Existing” does not mean executed or passing. Component tests currently render static HTML with `renderToStaticMarkup`; they do not simulate browser interaction. API tests verify server authorization/contracts, not visual role restrictions.

## UX-01–UX-12: Shared components

| Test | Coverage | Existing evidence | Refined expected result |
| --- | --- | --- | --- |
| UX-01 Shared navigation renders correctly for each role | Partial | `tests/lib/client/auth-access.test.ts` checks role navigation data. `ApplicationShell` has no component suite. | For borrower, investor, admin, multi-role, and signed-out identities, render only links allowed by the active identity; every destination is the expected route and signed-out links remain public. |
| UX-02 Active navigation item is identified correctly | Partial | `AdminNavigation` derives active path and sets `aria-current="page"`; the shared shell has no current-page treatment. No navigation component test exists. | Mark the exact current route as active visually and with `aria-current="page"`; nested admin routes activate their parent item; no unrelated item is active. Apply to shared role navigation as well as admin navigation. |
| UX-03 Shared buttons use consistent variants | Partial | `src/components/ui/button.tsx` defines variants. No button component suite or cross-page comparison exists. | Each variant has a stable semantic appearance, focus treatment, and disabled appearance across roles; pages use the shared component for equivalent actions. |
| UX-04 Disabled buttons cannot trigger actions | Partial | Native `disabled` is used in many components. No click-level component tests exist. | Disabled controls are removed from activation, cause no handler/API request, and communicate their disabled state to assistive technology. |
| UX-05 Loading buttons prevent repeated submissions | Partial | `SubmissionGuard`, borrower application/repayment locks, and local `busy` flags exist. `SubmissionGuard` is not used by components; only its helper is tested. | While pending, the action is unavailable and one request runs. Financial retries reuse the backend-supported idempotency identity or remain blocked when the result is uncertain. |
| UX-06 Status badges display the correct labels | Existing | `tests/lib/client/financial-format.test.ts` covers status formatting; role UI tests assert selected status labels. | Show the backend status in consistent human-readable text with a semantic variant; never rely on color alone or change the underlying status meaning. |
| UX-07 Empty states display appropriate messages | Existing | `tests/lib/client/request-state.test.tsx` covers shared empty state; investor dashboard/portfolio/marketplace/payout tests include empty examples. | Show an empty message only after a successful empty response; explain what is empty and provide a supported next step where useful. |
| UX-08 Error states display appropriate messages | Partial | Shared `ErrorState` and API-client error-envelope tests exist; investor marketplace/allocation tests cover selected error markup. Most role-level API effects are not exercised. | Show a safe, specific error without exposing internals; preserve relevant data; offer retry only when the request is safe and supported. |
| UX-09 Confirmation dialogs display the correct action | Gap | Dialogs are hand-authored in borrower, investor, and admin components. No dialog-content test exists. | Identify the operation and material details (including amount/resource for financial actions), and label cancel/confirm actions unambiguously. |
| UX-10 Dialog cancellation does not execute the action | Gap | Dialog cancel handlers exist in source; no interaction tests verify that the mutation is not sent. | Cancel/close dismisses the dialog, preserves editable input, and sends no request or mutation. Confirm is the only path that invokes the action. |
| UX-11 Shared components render correctly with long content | Partial | Some IDs and values use `break-all`, `break-words`, `min-w-0`, and table overflow wrappers. No long-content visual test exists. | Long emails, IDs, labels, errors, and amounts wrap or scroll within their own intended region without clipping, overlapping, or causing page-level overflow. |
| UX-12 Shared components handle missing optional data safely | Partial | `formatSatang` handles malformed values; investor dashboard tests include a missing wallet. Other optional profile/summary combinations are not systematically covered. | Null/omitted optional data renders a neutral explicit placeholder or omitted section; no crash, fabricated value, or misleading success state occurs. |

## UX-13–UX-24: Form validation

| Test | Coverage | Existing evidence | Refined expected result |
| --- | --- | --- | --- |
| UX-13 Required fields are validated | Partial | Borrower application validation and registration contract tests check required data; no form interaction test submits an incomplete UI. | Required values are identified and explained; invalid submit stays on the form, focuses or announces the first actionable error, and makes no write request. |
| UX-14 Invalid formats are rejected | Partial | THB parsing, registration schema, and API validation helpers have unit/contract coverage. No end-to-end field interaction coverage exists. | Invalid email, phone/field formats, and unsupported values are rejected using clear field-level feedback, with backend validation still authoritative. |
| UX-15 Numeric boundaries are enforced | Existing | `borrower-applications.test.ts`, `borrower-repayments.test.ts`, and `investor-investments.test.ts` cover amount/term bounds in client validators. | Boundary values at the allowed minimum/maximum are accepted; values immediately outside are rejected without submission. Values come from current business/API contract. |
| UX-16 Monetary inputs handle decimal and invalid values correctly | Existing | Repayment/investment helper tests cover THB parsing, satang precision, malformed decimals, and integer conversion. | Accept valid THB precision up to two decimal places, reject malformed/over-precision/negative/zero values as the relevant flow requires, and preserve exact satang conversion. |
| UX-17 Invalid forms do not submit | Partial | Form validation helpers are unit-tested; UI event prevention is not tested. | Invalid form submission causes zero API calls; visible errors remain associated with the affected fields. |
| UX-18 Server validation errors appear correctly | Partial | `api-client.test.ts` parses structured API errors; borrower application helper formats field detail. No form UI test injects a server validation error. | Map server field errors to the matching field when possible, retain a safe general message for other errors, and keep the form editable. |
| UX-19 User input is preserved after recoverable failures | Gap | Source generally clears state only on success, but no component test asserts retention after API/network errors. | Retain user-entered non-sensitive values after a recoverable server/network failure; never persist sensitive fields in browser storage unless specifically designed and approved. |
| UX-20 Repeated submission is prevented while pending | Partial | Lock helpers are unit-tested; page forms have local busy/ref guards, but no component-level concurrent click test exists. | Two fast submits while one request is in flight result in one request and one pending state; the control becomes available only after a definitive completion/failure. |
| UX-21 Successful submission provides clear feedback | Partial | Application, repayment, investment, payout, and preference flows display success states in source; component success transitions are not tested. | Show success only after backend confirmation, identify the completed action/reference, and offer the next supported step. |
| UX-22 Form state resets only when appropriate | Partial | Registration resets after successful creation; borrower draft creation transitions to success; no tests cover failure/success reset behavior. | Preserve values on validation/recoverable errors; clear or transition only after a confirmed success or explicit user reset. |
| UX-23 Field errors clear or update appropriately after correction | Partial | Borrower application `update()` clears its field error; repayment/investment use touched/error state. No interaction tests verify it. | Correcting a field updates/removes only its relevant error; unrelated errors remain until corrected or revalidated. |
| UX-24 Keyboard submission behaves correctly | Partial | Native `<form onSubmit>` patterns are used in several forms. No keyboard interaction tests exist. | Enter submits where standard form semantics expect it, controls remain keyboard reachable, and confirmation dialogs do not submit accidentally from unrelated controls. |

## UX-25–UX-34: API and interaction states

| Test | Coverage | Existing evidence | Refined expected result |
| --- | --- | --- | --- |
| UX-25 Initial loading state displays correctly | Existing | Component suites for all three role families assert selected initial loading/skeleton markup; shared request-state suite checks status semantics. | Show one accessible loading indication while each resource is pending; mark busy regions and avoid displaying placeholder financial figures as actual data. |
| UX-26 Successful API response renders correctly | Partial | Investor pages accept initial successful data props and have static fixture tests; other screens have typed client tests. React effects/API-to-component rendering is not exercised. | Render the confirmed API response accurately, keep independent sections independent, and never substitute calculated financial data. |
| UX-27 Empty API response renders correctly | Existing | Investor dashboard, marketplace, portfolio, allocation, and payout suites include successful empty results; shared EmptyState is covered. | Distinguish a successful empty collection from loading, failure, and missing-resource responses. |
| UX-28 Network failure is handled | Partial | Repayment/investment outcome helpers classify uncertain network errors; API error envelope parsing is tested. Component recovery after a rejected fetch is not. | Explain when outcome is uncertain, preserve values, avoid blind financial replay, and provide only safe status refresh/recovery actions. |
| UX-29 Server failure is handled | Partial | API client structured error and API/service failure tests exist. UI error display/retry states are not comprehensively exercised. | Display a safe server error; retain entered values; permit a manual retry only when the server confirms no write occurred or the operation is safely idempotent. |
| UX-30 Unauthorized response is handled | Partial | API client 401 callback and auth access helpers are tested; API auth integration tests cover the backend. `AuthProvider`/shell UI transition is untested. | Clear invalid session state and route to sign-in/appropriate return path without showing protected data or replaying a write. |
| UX-31 Forbidden response is handled | Partial | API integration and role-access unit tests cover server/client access rules, but there is no UI test of a 403 response. | Keep the user on a safe page, show a clear access-denied outcome, and display no protected resource/action. Backend authorization remains authoritative. |
| UX-32 Not-found response is handled | Partial | Marketplace detail has a static not-found error case; several API tests cover 404 contracts. Other detail/receipt pages lack not-found UI tests. | Present a not-found state distinct from general failure and offer a relevant return link; do not show stale detail as current. |
| UX-33 Retry does not cause unsafe duplicate actions | Partial | Submission locks and uncertain outcome helpers have unit tests; marketplace/allocation GET retry appears in markup tests. Financial UI retry and original key continuity are not component-tested. | GET retries may refresh safely. Financial writes must retain the same idempotency key for an explicit retry and must not be replayed automatically or after an uncertain outcome without resolution. |
| UX-34 Stale requests do not overwrite newer results | Partial | `AuthProvider` uses request sequence IDs; several effects use active/cancel flags. No stale-response race test exists. | If request A is superseded by request B, A cannot overwrite B’s data, loading state, or error state. |

## UX-35–UX-44: Responsive design

| Test | Coverage | Existing evidence | Refined expected result |
| --- | --- | --- | --- |
| UX-35 Borrower pages work at mobile width | Gap | Tailwind responsive classes and table wrappers exist; prior WP9.8 review was source-only. | At 320, 375, and 390 CSS px, borrower dashboard, application, offer, loan, repayment, wallet, and receipt pages remain readable and operable without page-level horizontal overflow. |
| UX-36 Investor pages work at mobile width | Gap | Responsive classes, wrapping cards, and scrollable tables exist; no viewport test. | Marketplace, contribution, portfolio, allocations, payouts, wallet, and recommendations fit mobile; long identifiers and amounts remain readable. |
| UX-37 Administrator pages work at mobile width | Gap | Admin layout changes to horizontal navigation and tables scroll; no viewport test. | Admin pages remain usable with mobile navigation, filter controls, detail actions, and table access without clipped controls. |
| UX-38 Navigation works on mobile | Partial | Auth CSS defines mobile wrapping/grid; admin navigation uses horizontal overflow on small screens. No focus/tap/viewport test. | Every role destination remains visible/reachable; current page stays identifiable; navigation does not overlap the theme toggle or page content. |
| UX-39 Tables remain usable on mobile | Partial | Table wrappers use horizontal scrolling and min widths; no device tests confirm scroll affordance/keyboard access. | Preserve column labels and row associations; allow deliberate table-region horizontal scrolling with visible/keyboard-operable access and no page-wide overflow. |
| UX-40 Forms fit mobile viewports | Partial | Auth inputs use full width; most Tailwind fields and primary actions adapt. No viewport/interaction test. | Fields, validation copy, select controls, and action buttons fit narrow widths and remain comfortable tap targets. |
| UX-41 Dialogs fit smaller screens | Partial | Most overlays use viewport padding and `max-w`; one borrower ML dialog has stacked mobile actions. No viewport tests. | Dialog content stays within safe viewport insets, scrolls internally when needed, and keeps cancel/confirm actions reachable without overlap. |
| UX-42 Financial amounts do not become unreadable | Partial | `formatSatang` is unit-tested; amount elements sometimes use `whitespace-nowrap`, tables scroll, and cards wrap. No narrow viewport check. | Amounts remain legible and associated with labels/currency; tables may scroll within their region but amounts must not clip, overlap, or silently truncate. |
| UX-43 Tablet layouts render correctly | Gap | `sm`, `md`, `lg`, and `xl` classes exist; no tablet viewport verification. | At agreed tablet widths (recommend 768 and 1024 CSS px), navigation, forms, grids, dialogs, and tables transition without awkward clipping or excessive whitespace. |
| UX-44 No unintended horizontal page overflow | Gap | Source uses `min-w-0` and table wrappers, but broad responsive code-level review cannot prove computed overflow. | At all agreed viewport widths, document/page body has no unintended horizontal overflow. Explicit table-region scrolling is permitted and tested separately under UX-39. |

## UX-45–UX-50: Accessibility and cross-role behavior

| Test | Coverage | Existing evidence | Refined expected result |
| --- | --- | --- | --- |
| UX-45 Form inputs have accessible labels | Partial | Many inputs have explicit labels, IDs, `aria-describedby`, and `aria-invalid`; no automated label audit or full page suite exists. | Every input has a programmatic accessible name; help/error text is associated and invalid state is exposed where applicable. |
| UX-46 Keyboard navigation reaches interactive controls | Gap | Native controls are used; no keyboard-only component/e2e test or browser session exists. | Tab/Shift+Tab reach all controls in logical order; Enter/Space activate appropriate controls; no keyboard trap except modal containment. |
| UX-47 Focus indicators are visible | Partial | Global `:focus-visible` token and several Tailwind focus rings exist. No computed-theme/keyboard visual test. | Focus is visibly distinguishable in both light and dark themes for every interactive control, including navigation and dialogs. |
| UX-48 Error and status information is not communicated by color alone | Partial | Statuses generally include text in badges; request states use headings/messages and ARIA roles. No contrast/accessibility suite. | Every status/error has text or an accessible name in addition to color/icon; loading, success, and failure are announced with suitable live-region behavior. |
| UX-49 Cross-role business statuses remain consistent | Partial | `formatFinancialStatus` and dashboard status formatters exist; unit tests cover representative labels. Variant/color mapping is local to each component. | Same backend status receives the same visible label and semantic meaning in borrower, investor, and admin views; role-specific wording must not imply a different financial state. |
| UX-50 Role-specific actions and data remain restricted | Partial | `auth-access.test.ts` checks client navigation; API integration suites verify role/ownership authorization. There is no component-level menu/action visibility suite. | Users see only their role-appropriate actions/data; direct UI access remains guarded and every write/read is still enforced by the backend, including multiple-role accounts. |

## Proposed testing approach for agreement

1. Keep pure helper/API contract tests for deterministic parsing, status formatting, role navigation, and error classification.
2. Add interactive component tests for form events, pending/disabled behavior, dialog confirm/cancel, API error rendering, success reset, and stale response races.
3. Add browser/viewport tests for UX-35–UX-44 and keyboard/dialog behavior under UX-46–UX-48. Current Vitest configuration has no DOM or browser interaction harness, so the project must choose one before these tests can be authored and executed.
4. Use a small set of role journey tests to confirm navigation and restrictions across borrower, investor, and admin; keep financial invariants asserted through API contracts, not duplicated frontend calculations.

## Agreement checkpoint

This matrix preserves the supplied UX-01–UX-50 scope and makes observable behavior more precise. Before Step 3, confirm:

- The refined expected results are acceptable, especially the distinction between page-level overflow and intentional table scrolling.
- Responsive target widths of 320/375/390 px mobile, 768/1024 px tablet, and a desktop viewport are acceptable.
- Whether to add a browser interaction test harness for the interaction, viewport, and keyboard cases. The current component tests remain useful as static rendering checks but cannot validate those behaviors.

No UI changes have been made in this step.
