# NEXUS WP9.5-I — Investor Integration and Regression Review

**Date:** 2026-11-21  
**Status:** Source fixes and requested checks completed. Browser-level flow verification remains open because the repository has no interactive UI test harness.

## Scope reviewed

Reviewed the investor flow from authenticated navigation through marketplace, contribution, portfolio/details, repayment allocation history, payout history, and wallet summary. The review checked the corresponding API contracts, investor-only route guard, shared role navigation, persisted status/amount display, unsupported-data constraints, account fixture setup, and application build/type/lint results.

## Findings and fixes

### Payout response contract mismatch

Prisma defines `InvestorPayout.payoutAllocation` as a required one-to-one relation. The payout list API therefore returns one allocation object, not an array. The investor client/component and its fixtures had treated it as an array, which could fail at runtime when rendering payout history.

- Changed payout and dashboard client types to match the singular API response.
- Updated history rendering to use the returned allocation and investment references directly.
- Corrected the API integration assertion and client/component fixtures.

### Inactive opening-balance account in test fixtures

Platform account 1300 is intentionally seeded as `INACTIVE`. The investor API fixture now uses the existing account-activation helper before posting opening balances and restores the prior account status in `afterEach`.

Static review found the same ordering defect in `createRepaymentTestContext()`: it funded the investor before calling `activateRepaymentTestAccounts()`. Activation now occurs before investor funding, and setup failures also run the helper cleanup. The unused contribution binding was removed.

### Type and lint blockers uncovered by requested checks

- Fixed the borrower-loans route's malformed nested Prisma `select` syntax.
- Changed borrower information-request reads to use the schema field `requestDetails` rather than a nonexistent `reason` field, and updated the UI contract accordingly.
- Fixed borrower application detail typing so list and detail `currentVersion` shapes can differ.
- Corrected pagination state types to use the shared `ApiPagination` contract.
- Narrowed investor portfolio loading results before reading `.data`; corrected React summary children to accept rendered numeric/element values.
- Replaced the invalid NextAuth OAuth provider factory import with a typed provider configuration object.
- Exported and used the NEXUS-specific risk feature type.
- Adjusted Vitest generic mock call sites with explicit type casts where Vitest's `Mock<T>` wrapper does not preserve generic call signatures.
- Deferred effect-triggered initialization work to a microtask so state updates happen after the effect body; this removed the React hooks lint errors while preserving the initial loading and session hydration behavior.

## Verification performed

- Focused investor UI/client tests: **24 passed**.
- Investor API integration suite: **18 passed** after the account fixture and payout relation corrections.
- These tests were run before the user requested that no further tests be run. **No tests were run after that instruction**, including after the final repayment fixture ordering change.
- `npx tsc --noEmit`: passed after the final fixture change.
- `npm run lint`: exited successfully with **0 errors and 29 warnings**. Remaining warnings include unused imports/variables and two unnecessary hook dependencies; none block lint.
- `npm run build`: passed after retrying the same command as requested by Next.js. The first run was stopped by a Next.js security check; the retry compiled, type-checked, generated static pages, and completed.
- `git diff --check`: no whitespace errors; Git printed line-ending normalization warnings for existing and edited files.

## Security notice from build

The installed Next.js version is reported by the build as affected by a known security vulnerability. Next.js requested the following security upgrade command:

```text
next upgrade --agent=security --internal-nudge-id=2a74f3e8-585a-49b7-ad0d-46dfb451c050
```

No dependency upgrade was performed during this WP9.5-I review.

## Remaining acceptance gap

WP9.5-B explicitly notes that current component tests use `renderToStaticMarkup`; there is no DOM/browser automation dependency configured. These checks do not exercise the user-interactive browser path across login, contribution confirmation, navigation, and refreshed account data. Existing API integration tests verify persisted behavior and authorization, but they are not browser end-to-end tests.

Before claiming browser-level WP9.5-I acceptance, choose a test harness. Playwright is suitable for full browser flows; Testing Library with a DOM environment would cover interactive component behavior without full browser navigation. Wallet transaction history remains an already documented API gap and must not be fabricated by the frontend.
