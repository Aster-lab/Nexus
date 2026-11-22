# NEXUS Browser E2E and Staging Certification

## Current scope

The Playwright suite in `e2e/role-workspaces.spec.ts` checks authenticated borrower, investor, and administrator dashboards at desktop and mobile widths. It exercises the login UI and role-based redirect, confirms the workspace heading renders, and checks for horizontal overflow at 390px.

The browser suite is intentionally read-only after sign-in. It does not submit an application, accept an offer, invest, disburse, repay, or process a payout. The database-backed system journey in `tests/api/system-journey.integration.test.ts` remains the full financial-lifecycle verification.

## Setup

1. Install the project dependencies with `npm install`.
2. Install the Playwright Chromium browser with `npx playwright install chromium`.
3. Copy `.env.staging.example` to `.env.staging` and set `E2E_BASE_URL` plus dedicated E2E credentials for one borrower, investor, and administrator. `.env.staging` is ignored by Git.
4. Use a non-production staging environment with synthetic test accounts. The application should be deployed and healthy before the browser suite runs.

The base URL must use HTTPS except for loopback development URLs. Tests run sequentially with no retries to avoid unnecessary login attempts and rate-limit noise. A role test is skipped when its dedicated E2E credentials are missing.

## Commands

```powershell
npx playwright install chromium
npm run test:e2e:staging
```

For local browser checks, set `E2E_BASE_URL=http://127.0.0.1:3000` and the role credential variables in the current shell, then run `npm run test:e2e`.

## Certification record

Staging certification is not complete until the actual staging URL and dedicated role accounts are configured and all three browser tests pass against the deployed build. Record the deployment revision, environment, date, browser version, test results, and any failed checks here after the run. Do not put credentials or session cookies in this document.

## Limitations

- This suite verifies role login, dashboard rendering, and basic responsive behavior; it does not automate mutations in the financial workflow.
- API-level integration tests verify the complete application-to-reconciliation journey.
- Staging operational checks still need to confirm database identity, active platform policies/accounts, Next.js/database connectivity, production-grade secrets, and backup/restore procedures.
