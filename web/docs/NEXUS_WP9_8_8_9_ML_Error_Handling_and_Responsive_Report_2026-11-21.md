# NEXUS WP9.8.8–9.8.9 — ML Error Handling and Responsive Presentation

**Date:** 2026-11-21  
**Scope:** Reliable ML request recovery and responsive review for borrower evaluation and investor recommendations.

## 9.8.8 — Error handling and retries

Updated:

- `src/components/borrower/borrower-risk-evaluation.tsx`
- `src/components/investor/investor-recommendations.tsx`

The interfaces now separate failures whose server response confirms there was no persisted result from transport failures with an unknown outcome.

| Failure | Recovery |
| --- | --- |
| `ML_SERVICE_TIMEOUT` | Manual retry is available. The WP8 route times out before result persistence. |
| `ML_SERVICE_UNAVAILABLE` | Manual retry is available. The route returns before persisting a result. |
| `INVALID_ML_RESPONSE` | Manual retry is available after the malformed result is rejected; no prediction/run is persisted. |
| `NETWORK_ERROR` | No second POST is offered because the original request may have completed. Investor can GET the latest saved run. Borrower is informed the API cannot list evaluations and should confirm the outcome before requesting again. |
| Other validation/eligibility/model errors | Display backend error; no automatic or speculative retry. |

Borrower retry reopens the existing confirmation dialog. Investor retry is a separate, explicit action. Both flows block duplicate clicks while a request is in progress. No response is fabricated or treated as successful before the API confirms it.

## 9.8.9 — Responsive presentation review

Source-level review of the borrower preview and investor recommendation screens found:

- Mobile-first content widths and spacing (`w-full`, bounded `max-w-*`, responsive padding).
- Single-column layout on narrow screens, expanding to two/three/four-column information grids at `sm` and `lg` breakpoints.
- Recommendation cards and headings wrap; loan IDs can break instead of forcing horizontal overflow.
- Primary actions fill mobile width and switch to intrinsic width on larger screens.
- Borrower confirmation uses viewport padding, a bounded dialog width, breakable references, and stacked actions on mobile.

Actual desktop and mobile screenshots were not available: the browser connector reported local browser access unavailable, and no authenticated browser session was exposed. Thus this is a code-level responsive verification; viewport rendering remains to be visually checked when browser access is available.

## Verification

- `npx tsc --noEmit --incremental false` — passed.
- Added correlated unit and server-rendered component assertions for retry classification and responsive utility classes. Tests were not run, following the user's instruction. Lint and production build were also not run.
- No live Python service or authenticated borrower/investor browser session was used.

## Remaining API limitation

WP8 has no borrower-evaluation history/list endpoint or client idempotency reference. After a browser network failure, the UI correctly avoids issuing another evaluation blindly, but it cannot reconcile the result itself. A user/admin lookup capability or request idempotency support would remove this limitation.
