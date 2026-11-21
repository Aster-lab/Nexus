# NEXUS WP9.2 Shared API Client and UI States

**Date:** 21 November 2026  
**Work package:** WP9.2 — Shared API Client and Application Integration  
**Validation:** Static review only. Tests, application code, typecheck, lint, and build were not run.

## Summary

WP9.2 has a first shared frontend integration layer. Browser requests are restricted to the same-origin `/api` namespace, use the existing cookie session, bypass caching for user/financial data, preserve the backend success and pagination envelopes, and expose safe structured errors. Common loading, error, empty, and unavailable states are available as reusable components. Styling lives outside route pages under `src/styles`, as requested.

The prediction feature remains unavailable for the MVP. `UnavailableState` provides the UI primitive for the future borrower page to explain manual review without showing a probability or tier.

## API client behavior

The new `src/lib/client/api-client.ts` exports:

- `apiRequest<T>()` for typed standard success envelopes and optional pagination.
- `apiGet<T>()` for reads.
- `apiPost<T, TBody>()` for JSON writes.
- `ApiClientError` with HTTP status, stable backend error code, user-facing message, and optional validation details.

Requests use `credentials: "same-origin"`, `cache: "no-store"`, and redirect errors. The client does not read or store session tokens, auto-retry requests, generate idempotency keys, or redirect on 401. Callers receive the 401 status and can provide an `onUnauthorized` callback; the API error remains the rejected result even if that callback fails. Financial callers must create and retain one idempotency key per logical submission and pass it to `apiPost`; the client validates its 1–255 character bound but never rotates it during a retry.

`src/lib/client/submission-guard.ts` adds `SubmissionGuard` to coalesce duplicate in-flight submit handlers. It is a user-interface safeguard only; financial services must still use the backend idempotency key. A rejected operation clears the guard so the user can make an explicit retry.

Response bodies that do not match the shared envelope fail with a generic `INVALID_API_RESPONSE` message, without exposing raw server body content. Network failures become `NETWORK_ERROR`; an explicit abort is preserved for caller cancellation handling.

## Shared UI states and styling

Added `src/components/ui/request-state.tsx`:

- `LoadingState` announces progress through a polite live region and `aria-busy`.
- `ErrorState` announces a failed request through an alert region.
- `EmptyState` explains an empty result and can offer a next action.
- `UnavailableState` supports capabilities that are intentionally unavailable, including MVP prediction.

Added `src/styles/tokens.css` and `src/styles/components/request-state.css`; `globals.css` imports them. Tokens use the selected deep-blue, bright-blue, white, and charcoal palette, with light and dark values. The stylesheet follows the system theme by default and supports an explicit `data-theme="light|dark"` selection. Keyboard focus is visible and loading animation honors reduced-motion settings.

`ThemeToggle` is mounted in the root layout. It supports system, light, and dark preferences, persists explicit selection under the non-sensitive `nexus-theme` local storage key, and responds to operating-system theme changes while in system mode. A small allowlisted Next.js `beforeInteractive` script applies saved preferences before the first painted page to avoid a theme flash. The root layout suppresses only the theme attribute hydration difference.

## Focused tests authored

- `tests/lib/client/api-client.test.ts`: success envelope, same-origin cookie request settings, pagination, API error mapping, 401 propagation without automatic retry/redirect, JSON/idempotency write headers, same-origin path restriction, and malformed response handling.
- `tests/lib/client/request-state.test.tsx`: accessible loading/error semantics, empty state action, and unavailable state.
- `tests/lib/client/theme-preference.test.ts`: system preference resolution, saved preference handling, storage failure fallback, and document-root theme attributes.
- `tests/lib/client/submission-guard.test.ts`: duplicate in-flight submit coalescing and explicit retry after failure.

These tests were authored but not run, per instruction.

## Remaining WP9.2 work

1. Add a caller-level auth/session coordinator in the WP9.3 shell that refreshes identity from `/api/auth/me` and handles `401` without hiding backend authorization failures.
2. Add application-level request cancellation/retry controls where a screen needs them. Do not automatically replay financial writes; use the same idempotency key for an explicit retry.
3. Select/configure a frontend component/browser test harness before workflow-level tests.
4. Author focused UI integration tests before implementing each role workflow, then run them only when authorized.

## Files changed in this phase

- `src/lib/client/api-client.ts`
- `src/lib/client/submission-guard.ts`
- `src/lib/client/theme-preference.ts`
- `src/components/ui/theme-toggle.tsx`
- `src/components/ui/request-state.tsx`
- `src/styles/tokens.css`
- `src/styles/components/request-state.css`
- `src/styles/components/theme-toggle.css`
- `src/app/layout.tsx`
- `src/app/globals.css`
- `tests/lib/client/api-client.test.ts`
- `tests/lib/client/request-state.test.tsx`
- `tests/lib/client/theme-preference.test.ts`
- `tests/lib/client/submission-guard.test.ts`
- This report

## Completion status

The common request/envelope/error handling, duplicate-submit guard, accessible request states, and persistent theme control are authored. Runtime verification remains outstanding because project code and tests were not run. Session refresh, root navigation, and role workflows remain in their planned WP9.3+ phases.
