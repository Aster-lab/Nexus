# NEXUS System Functionality — Implementation Review

**Review date:** 2026-11-22  
**Reference:** User-provided “NEXUS — System Functionality and Implementation Review Document”  
**Method:** Static comparison of the reference requirements with current source, migrations, tests, and project status documents. No tests, lint, typecheck, build, app server, ML server, or database commands were run in this review.  
**Overall result:** The reviewed core lending and financial workflows, including administrator-controlled initial wallet funding, now have source-level application paths. The project is **not ready for deployment or acceptance as a complete system** because local migrations and current release verification remain outstanding, and deployment architecture and operational settings are unresolved.

## Status definitions

- **Implemented in source:** matching code paths and/or tests exist; this review does not imply current runtime success.
- **Partial:** some layers exist, but an end-user or operational path is missing.
- **Decision-limited:** intentionally unavailable under an earlier product decision.
- **Unverified:** the current source may implement the behavior, but current tests/runtime evidence has not been established.
- **Open:** material requirements are absent or deployment decisions/configuration remain outstanding.

## Key finding: simulated wallet lifecycle

The reference's wallet flow is connected in source through role-scoped wallet APIs and the admin financial page. The existing local/demo database still needs the migrations applied and the paths verified.

| Wallet event | Current implementation | Review |
| --- | --- | --- |
| Create a wallet for a borrower/investor | `ensureUserWallet()` is called from registration and demo-account creation. It creates an active THB wallet with a zero balance and does not post money. Migration `20261121150000_provision_user_wallets` backfills existing borrower/investor profiles with empty wallets. | **Implemented in source, not applied or tested.** The migration includes existing demo accounts, but must be deployed to the intended local database before their wallets appear. |
| Admin assigns initial simulated balance | `POST /api/admin/opening-balances` requires an administrator session and idempotency key, validates the request, and invokes `createOpeningBalance()`. The admin financial page lets administrators select an eligible user wallet, enter an amount and reason, review the impact, then confirm. The financial service posts balanced ledger entries, updates the wallet projection atomically, and records an audit event. Correlated service and API/client tests are present. | **Implemented in source; not executed.** Direct wallet edits are not exposed. The route returns persisted transaction data; failed or uncertain requests do not display success. |
| Opening-balance source | Account 1300 is seeded ACTIVE for fresh environments. Migration `20261121160000_activate_opening_balance_source` activates only the exact seeded THB asset account if it is currently inactive; it changes no wallet balance and posts no funds. | **Implemented in source; migration not applied.** Existing local/demo databases must apply the migration before the UI can post an opening balance. Conflicting account definitions are left unchanged and rejected by the posting service. |
| Investor makes an investment | `postInvestorContribution()` checks active THB wallet and funds, debits the investor wallet and credits loan escrow through a posted ledger transaction. | **Implemented in source; current end-to-end UI/runtime unverified.** |
| Borrower receives disbursement | The disbursement service debits the escrow wallet and credits the borrower's wallet, posts a ledger transaction, updates escrow and loan state in one transaction, and checks eligibility/idempotency. | **Implemented in source; current deployment verification open.** |
| Borrower makes a repayment | Repayment submission debits the borrower wallet and credits Repayment Clearing through its ledger transaction and transactional persistence path. | **Implemented in source; financial suites have historical pass evidence, but no fresh run was performed for this review.** |
| Investor receives a payout | The payout service debits Repayment Clearing and credits the investor wallet with a posted ledger transaction and persisted payout. | **Implemented in source; current deployment verification open.** |
| User reads balance/history | Borrower and investor wallet GET APIs return their own wallet and paginated posted ledger entries. Their dashboards now also show the persisted balance and recent posted transactions. The admin wallet API remains read-only and includes opening-balance references for display. | **Implemented in source; not executed.** No direct user or admin balance-edit endpoint was found. |

The wallet provisioning helper does **not** fund an account. A zero-balance wallet is appropriate at registration. Administrator-controlled initial simulated funding is now available through the admin financial page and API, with the ledger-backed service as the only balance-changing path. The wallet backfill and opening-account activation migrations plus a guarded `demo:migrate` command are present in source; they have not been applied or executed in this review.

## Requirement review

| Reference area | Status | Findings |
| --- | --- | --- |
| Authentication and account roles | **Implemented in source; unverified** | Borrower/investor registration, local login, session handling, OAuth integration, role checks, ownership checks, and separately provisioned administrator bootstrap are present. Admin self-registration is denied. |
| Borrower applications and offers | **Implemented in source; workflow verification open** | Application create/edit/submit, admin review, offer issuance/expiry, and borrower acceptance paths exist. Current acceptance still depends on integrated end-to-end evidence. |
| Marketplace and investment | **Implemented in source; workflow verification open** | Marketplace, investment contribution persistence, idempotency, funding progress, portfolio, allocation, and payout views exist in code. Admin initial funding can now provide simulated investor wallet funds through the approved posting flow. The integrated workflow has not been run in this review. |
| Loan funding and disbursement | **Implemented in source; operational path needs review** | Funding contributions use ledger-backed transfers into escrow. The disbursement process has approval checks and transfers escrow funds to a borrower wallet. Whether every release-approval step is available through the current frontend/API sequence needs a full journey run. |
| Repayment and receipt | **Implemented in source; current regression open** | Due-payment checks, partial and multi-installment allocation, interest-first distribution, idempotency, receipt generation after posting, and transactional persistence are present. No tests were run in this review. |
| Repayment allocation and investor payout | **Implemented in source; current regression open** | Allocation persistence and payout processing/reconciliation services and tests exist. The payout UI/API provides an admin flow; wallet balances are updated through ledger-backed posting. |
| Ledger and financial integrity | **Implemented in source; release evidence incomplete** | Ledger posting, immutable posted transactions, compensating transactions, audit records, and reconciliation services exist. Current final regression and fresh database reconciliation evidence are still required by WP11. |
| Platform fees | **Partially evidenced** | The borrower frontend reports the separately disclosed fee and backend policy/calculation code exists. Confirm current end-to-end fee behavior and ensure no posting/deduction before release; this review did not execute the flow. |
| ML | **Decision-limited** | Earlier user decision keeps borrower prediction unavailable because no approved NEXUS THB training dataset exists. The Python service and ML integration are present, but no UI may imply a valid NEXUS borrower score. This is an accepted MVP limitation, not a reason to fabricate results. Deployment of the Python service is not needed while the feature is disabled. |
| Notifications | **Implemented for the accepted MVP scope** | In-app notification storage, authenticated role-scoped list/read APIs, internal destinations, and workflow producers are present. **Email notifications are explicitly excluded by the user and are not a deployment blocker for this scope.** No email provider or worker is claimed. |
| Role dashboards and UI | **Implemented in source; interaction/accessibility verification open** | Borrower, investor, and admin route trees/components, Tailwind/shadcn-compatible primitives, status/loading/error/empty states, and responsive CSS exist. The consolidated WP9 review notes uneven shared patterns and no configured browser E2E/interactive component harness. |
| Admin monitoring and audit | **Implemented in source; current runtime open** | Admin dashboards, application/loan/repayment/payout operations, initial wallet funding, wallet/ledger/reconciliation read APIs, user status controls, and audit views exist. Current runtime and end-to-end authorization remain unverified. |
| Deployment | **Open / blocker** | No deployed environment is evidenced. Hosting architecture conflicts across documents: the pasted baseline specifies Vercel + Prisma Postgres + Render, while WP12.4 recommends Render web + Postgres in Singapore and defers Python. The hosting provider/region, domain, budget, production database, secrets, TLS/proxy, backup/recovery settings, and migration/rollback procedure are not finalized. |

## Checklist summary

### A–D: accounts and role workflows

Registration, admin bootstrap restrictions, backend role/ownership checks, borrower workflows, investor investment/payout workflows, and administrator monitoring have corresponding source and test coverage. Their presence does not mean the current full workflow has passed: WP11 records an open final regression and browser/staging validation. Investor and borrower wallet pages also depend on a persisted wallet; this review's pending migration affects existing profiles.

### E: financial system

The code implements balanced ledger posting, wallet projection updates, repayment schedules, interest-first repayment allocation, investor allocation, clearing reconciliation, atomic rollback, payout idempotency, and posted-ledger immutability. The opening-balance API/UI now calls the existing controlled service; fresh seeds enable account 1300, and a narrow migration handles an existing exact account definition without creating funds. Application of that migration and the wallet backfill is still pending.

### F: machine learning

Python tests and service code have historical passing evidence in WP11, but prediction is deliberately unavailable for the NEXUS MVP. The reference must be read together with the user's later model-readiness decision. A production release should clearly present manual review/unavailable behavior and exclude ML hosting until model approval.

### G: frontend and UX

Screens and API integration are present, but the UX acceptance matrix and browser interactions/responsive layouts remain unverified. Static component checks cannot prove mobile layout, keyboard operation, dialogs, or successful cross-role workflows. No new UI was opened during this review.

### H: deployment

Not implemented/verified as a deployed system. WP12 documents choices and static audits; it does not provision services or confirm connectivity. Deployment-specific checks and a full deployed workflow remain required.

## Deployment readiness blockers

1. **Apply local demo migrations when ready:** `20261121150000_provision_user_wallets` creates only zero-balance THB wallets; `20261121160000_activate_opening_balance_source` activates only the exact account 1300 configuration. Neither migration has been applied by this review. The guarded command is `npm.cmd run demo:migrate` from `web`, with `.env.demo` selected by the script. It must remain pointed only at `nexus_demo`.
2. **Run authorized verification later:** the correlated opening-balance service, admin API/client, dashboard-client, and dashboard-component tests have been authored/updated, but no tests, lint, typecheck, build, app server, or database commands were run in this pass. WP11 release evidence remains incomplete. Run the narrowly correlated tests first, then broader regression and browser/staging checks when requested.
3. **Resolve deployment architecture:** reconcile Vercel + Prisma Postgres + Render (baseline document) with the WP12.4 Render-only recommendation. Confirm region, budget, domain, always-on requirement, backup retention, and recovery objectives before provisioning production resources.
4. **Complete deployment-specific checks:** production secrets and environment separation, TLS/proxy/trusted origins, PostgreSQL limits, migration/rollback procedure, backup/recovery, and production-style reconciliation remain operational release tasks. No provider or deployment was changed.

## Review conclusion

NEXUS has substantial implementation across the documented simulated lending lifecycle, and the previously missing “administrator assigns opening balance” path is now wired through the application using the existing financial posting service. Disbursement, repayment, investor contributions, payouts, and opening balances are ledger-backed in their services. Existing profiles need the zero-balance wallet backfill, and existing databases need the exact account 1300 activation migration before initial funding can run.

The application should not be treated as deployment-ready until local migrations are applied and verified, WP11 release evidence is complete, and hosting/security/recovery decisions are finalized. Email notifications are outside the accepted MVP scope. This review is static only; it does not assert that current tests or the deployed system pass.

## Follow-up implementation completed in source (2026-11-22)

- Added the administrator opening-balance API, client wrapper, API error mapping, and admin UI flow with amount/reason review, confirmation, and idempotency-key reuse after uncertain failures.
- Added API authorization/posting/audit coverage and a client request test. Existing opening-balance service tests remain the source for service-level rules and concurrency behavior.
- Enabled account 1300 for fresh seeds and added a narrow migration to activate only its approved existing definition. This does not inject user funds.
- Added opening-balance metadata to the read-only admin wallet list.
- Added borrower and investor dashboard wallet resources and recent posted ledger activity, preserving independent loading/error states and role-scoped wallet APIs.
- Corrected request validation so malformed or out-of-range `amountSatang` values return validation errors instead of risking an exception during integer parsing.
- No test or verification command was run, per the current workflow constraint. All implementation statements above mean source-level presence only.
- Demo setup/reset now activates the allowlisted version-one loan, interest, platform-fee, and repayment policies after creating the one-time demo administrator. Activation runs only with the loopback `nexus_demo` guard, requires the active demo administrator, validates expected policy version/status metadata, and writes audit events. It leaves normal seeds and non-demo environments unchanged.
- Added the non-destructive `npm.cmd run demo:activate-policies` command for an existing demo database; it requires the exact interactive confirmation `ACTIVATE NEXUS DEMO POLICIES` and never resets accounts or financial records.

## Demo sign-in note

The generated investor account email is `demo-investor@nexus.local` (with the `demo-` prefix); corresponding borrower and administrator emails follow the same pattern. Use the exact email and password printed by the successful `demo:setup` or `demo:reset` command. The previously shown `investor@nexus.local` address does not match the generated demo account identifier and will correctly return a generic 401 response. Credentials are generated once and are not recoverable from the password hash; if they were not saved, use the guarded reset workflow for the disposable `nexus_demo` database and save the new output.

The loan-application “policy unavailable” message on an existing database means its policy version is still `PROPOSED`. After updating the source, apply pending migrations with `npm.cmd run demo:migrate`, then run `npm.cmd run demo:activate-policies` and confirm with `ACTIVATE NEXUS DEMO POLICIES`. The activation command preserves existing demo accounts and financial records. `demo:setup` is only for an empty database; `demo:reset` deletes and recreates all demo data/credentials. Do not run reset if there is demo data to keep. No policy activation or database operation was run during this source review.
