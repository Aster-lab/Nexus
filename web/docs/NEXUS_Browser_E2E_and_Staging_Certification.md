# NEXUS Browser E2E and Staging Certification

## Current scope

The Playwright suite in `e2e/role-workspaces.spec.ts` checks authenticated borrower, investor, and administrator dashboards at desktop and mobile widths. It exercises the login UI and role-based redirect, confirms the workspace heading renders, and checks for horizontal overflow at 390px.

The browser suite is intentionally read-only after sign-in. It does not submit an application, accept an offer, invest, disburse, repay, or process a payout. The database-backed system journey in `tests/api/system-journey.integration.test.ts` remains the full financial-lifecycle verification.

## Setup

1. Install the project dependencies with `npm install`.
2. Install the Playwright Chromium browser with `npx playwright install chromium`.
3. Copy `.env.staging.example` to `.env.staging` and set `E2E_BASE_URL` plus dedicated E2E credentials for one borrower, investor, and administrator. `.env.staging` is ignored by Git.
4. Use a non-production staging environment with synthetic test accounts. The application should be deployed and healthy before the browser suite runs.

If Vercel Deployment Protection is enabled for Preview, create a **Protection Bypass for Automation** secret in the Vercel project settings and set it as `VERCEL_AUTOMATION_BYPASS_SECRET` in the local `.env.staging`. The Playwright setup attaches the bypass headers only to requests for the configured `E2E_BASE_URL` origin. Keep the secret out of Git and do not put it in the browser app's public environment variables. The bypass is optional when the Preview URL is already accessible to the test runner.

The base URL must use HTTPS except for loopback development URLs. Tests run sequentially with no retries to avoid unnecessary login attempts and rate-limit noise. A role test is skipped when its dedicated E2E credentials are missing.

## Commands

```powershell
npx playwright install chromium
npm run test:e2e:staging
```

For local browser checks, set `E2E_BASE_URL=http://127.0.0.1:3000` and the role credential variables in the current shell, then run `npm run test:e2e`.

## Certification record

### Browser smoke checks — 2026-11-22

- **Result:** User-reported pass, 3/3 role workspace checks (borrower, investor, administrator).
- **Environment:** Vercel Preview/staging at `https://nexus-2e86bsbc8-aster-d789.vercel.app`.
- **Coverage:** Sign-in and role redirect, workspace heading, desktop layout, and 390px mobile layout with no horizontal overflow.
- **Deployment revision:** Not captured from the Vercel deployment screen. Repository `staging` branch HEAD during this record was `98b5eea`; verify the Vercel deployment SHA before treating this as the deployed revision.
- **Browser:** Playwright-managed Chromium; exact browser version was not captured.
- **Failures:** Initial runs were blocked by Vercel Deployment Protection and then a short default assertion wait. The bypass and longer login wait were added to the local E2E setup; the user reports the subsequent run passed.

This records the browser smoke checks only. Full staging certification still requires the operational and workflow checks below. Do not put credentials, bypass secrets, or session cookies in this document.

## Remaining staging certification checklist

### Environment and service readiness

- [ ] Confirm the Ready Preview deployment is built from the intended `staging` commit; record its Vercel commit SHA.
- [ ] Confirm the web service's Preview `DATABASE_URL` targets the separate staging database, never Production, `nexus_dev`, `nexus_test`, or `nexus_demo`.
- [ ] Confirm the ML service binding supplies `ML_SERVICE_URL`; confirm matching Preview `ML_SERVICE_TOKEN` values on web and ML. Keep predictions unavailable per the approved dataset decision.
- [ ] Confirm the staging migration status is current and the platform seed completed.
- [ ] Sign in as the bootstrapped administrator and verify the admin workspace and financial overview load.
- [ ] Open **Administrator → Policies**. Review each seeded proposal, approve it, then activate it. Confirm the loan offer policy is active before creating applications; activate the 12% interest and repayment policies with matching rates before issuing offers or generating schedules. Confirm an activation is visible in the audit log.
- [ ] Review Vercel runtime logs for failed or unusually slow auth, dashboard, or database requests. Do not include secret values in the record.

### Controlled cross-role workflow

Use dedicated synthetic accounts and the smallest policy-allowed THB amounts. Record references and statuses only; do not record passwords, tokens, or session cookies.

- [ ] Register/sign in a dedicated borrower and investor account, then verify each sees only its own workspace and data.
- [ ] As administrator, assign a small investor opening balance through **Financial overview → Assign initial balance**. Confirm the investor wallet shows the posted credit.
- [ ] As borrower, create and submit a small loan application. The province, district, subdistrict, postal code, and purpose fields are dropdowns; address selections are stored in the application snapshot.
- [ ] As administrator, review and approve the application, then issue an offer from its detail page.
- [ ] As borrower, review and accept the offer. Confirm the resulting loan is `FUNDING` and appears in the investor marketplace if it is eligible and has capacity.
- [ ] As investor, contribute the amount required to fund the loan. Confirm the contribution, wallet debit, escrow and funding progress agree.
- [ ] As borrower, record disbursement consent; then as administrator, disburse. Confirm the posted transaction, borrower wallet credit, loan status and backend-generated schedule.
- [ ] Do not edit database rows or installment terms to force a repayment due. Repayment and payout checks must wait until an installment is payable under the real schedule, or use the isolated local integration test database.
- [ ] Once payable, submit a small repayment as the borrower. Confirm persisted repayment/receipt and installment changes; process the eligible allocation as administrator; then confirm investor payout history and wallet credit.
- [ ] Run the read-only administrator reconciliation views and inspect the audit history. Resolve any discrepancy before continuing.

### Recovery and operational readiness

- [ ] Review provider backup/PITR settings and retention for the staging database.
- [ ] Validate a restore only into a separate disposable database; never overwrite Production or the active staging database during a restore exercise.
- [ ] Confirm errors in Vercel runtime logs are understood and no staging secret or personal data is exposed in logs.
- [ ] Record completed checks, blocked checks, deployment SHA, and date here. Full certification remains incomplete while any required item is unchecked.

## Limitations

- This suite verifies role login, dashboard rendering, and basic responsive behavior; it does not automate mutations in the financial workflow.
- API-level integration tests verify the complete application-to-reconciliation journey.
- Staging operational checks still need to confirm database identity, active platform policies/accounts, Next.js/database connectivity, production-grade secrets, and backup/restore procedures.
