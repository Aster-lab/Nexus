# NEXUS System Functionality Review and Stabilization

**Review date:** 2026-11-22  
**Baseline:** User-provided “NEXUS — System Functionality and Implementation Review Document”  
**Project stage:** MVP system review and stabilization  
**Database used for verification:** local PostgreSQL `nexus_test` only  
**Scope:** Compare the Prisma schema, migrations, services, APIs, UI and correlated tests with the functional baseline; fix confirmed defects and verify the affected paths.

## Summary

The Prisma schema is valid and the local test database has all 39 migrations applied. Core lending and financial data have relational constraints and SQL guards for ledger balancing, immutable posted records and schedule terms. The initial review found four concrete reasons for reported failures or rule gaps, and corrected them:

1. Three seed tests asserted that account 1300 was inactive, contrary to the approved opening-balance workflow, which requires that exact seeded account to be active.
2. Investor payout reconciliation exceeded Prisma's default five-second interactive transaction timeout while scanning the financial snapshot.
3. A fully funded loan could be disbursed by an administrator without the borrower's confirmation, contrary to the functional baseline.
4. Production builds depended on fetching Geist fonts from Google at build time, and the default Turbopack build repeatedly failed while starting its CSS worker in this environment.

Those original issues were fixed, and the follow-up full workflow audit found and fixed additional borrower-to-investor funding and post-disbursement schedule gaps. Related focused suites pass. This review does not certify a production deployment: staging, hosted services, deployment secrets, backup/restore and the unavailable borrower prediction remain outside the verified scope.

## Schema and migration review

The current Prisma schema models the main user, role, application-version, offer, loan, wallet, platform-account, ledger, investment, escrow, installment, repayment, allocation, payout, audit, notification, policy, ML and investor-marketplace relationships.

The schema itself is not the only integrity boundary. The 39 SQL migrations add checks, partial unique indexes, composite foreign keys and triggers for important rules, including:

- User or platform-account ownership for a wallet, THB currency and nonnegative projected balance.
- Ledger-entry account exclusivity and positive amounts, balanced posting, posted-record immutability and wallet-projection reconciliation.
- Application-version and schedule-version integrity, including immutable submitted versions and schedule terms.
- Funding limits, escrow reconciliation, repayment/installment totals and allocation/payout relationships.
- Completed payouts linked to their financial transaction and immutable after completion.

The new borrower disbursement confirmation did not require a schema migration. The existing `AuditLog` model stores an immutable, actor-attributed consent event linked by `targetType=LOAN` and `targetId=loanId`; the borrower and administrator services validate this persisted evidence before release.

## Findings and fixes

### 1. Seed expectations no longer matched the approved opening-balance source

The current seed activates platform account 1300 (`Simulated Opening Balance Asset`) so the admin-controlled opening-balance service can post initial simulated funds through the ledger. The seed tests still expected it to be `INACTIVE`, causing three failures even though the implementation matched the approved wallet flow.

**Fix:** Updated the seed tests to expect account 1300 to be active and renamed the assertion to describe the approved behavior. Existing account status is still preserved by the seed when the account already exists.

### 2. Reconciliation used the default transaction timeout

Payout reconciliation reads a repeatable-read snapshot of posted ledger transactions, wallet projections, allocations and clearing-account movements. The default five-second interactive transaction timeout expired in the parallel full-suite run.

**Fix:** Kept the consistent read-only `RepeatableRead` transaction, set a 10-second maximum wait and a bounded 60-second execution timeout. No financial records are repaired or mutated by the report.

### 3. Borrower approval was missing from loan disbursement

The existing administrator endpoint created the request and approval audit rows and posted disbursement without evidence that the borrower had authorized release. That contradicted the rule that escrow release requires borrower and administrator approval.

**Fix:**

- Added borrower-only `POST /api/borrower/loans/{loanId}/disbursement-consent` with the strict body `{ "confirmDisbursement": true }`.
- Verified borrower role, profile and loan ownership; the loan must be fully funded and not yet disbursed.
- Persisted one actor-attributed `LOAN_DISBURSEMENT_CONSENTED` audit record. Repeated confirmation returns the existing record.
- Required that record before the administrator request, approval and posting path can proceed; the posting service checks it again transactionally, including the confirmed principal and THB currency.
- Included confirmation status in the borrower's loan detail response and added a clear UI confirmation showing the approved amount and that funds are simulated.
- Documented the endpoint and `BORROWER_CONSENT_REQUIRED` response.

The existing endpoint still requires an authorized administrator and idempotency key. Borrower consent alone never posts funds or changes wallet balances.

### Admin disbursement screen did not show the borrower handoff state

The backend correctly rejected release before borrower consent, but the admin loan detail API did not return the persisted consent and the UI showed the disbursement form as soon as the loan reached `FUNDED`. Admins therefore had to attempt the action to learn that they were waiting on the borrower.

**Fix:** Admin loan details now return `disbursementConsentAt` only when the actor, loan, principal and THB match the current consent. The admin page shows a waiting state until then, offers a status refresh, and gates the financial action on both `FUNDED` and current consent. The API remains authoritative and revalidates consent during posting.

### 4. Build depended on remote font access and Turbopack worker startup

`next/font/google` tried to resolve Geist over the network during production compilation. The default Turbopack build also failed while starting its CSS/PostCSS worker, including in an unsandboxed retry. The same app compiled successfully using Next.js's supported Webpack build path.

**Fix:** Vendored the Geist Latin and Geist Mono font files into `src/app/fonts`, switched the root layout to `next/font/local`, and set `build` and `demo:build` to `next build --webpack`. This removes the Google Fonts build-time network dependency and uses the build mode verified here.

### 5. Demo login used a different email from the generated account

The demo bootstrap creates `demo-investor@nexus.local`, `demo-borrower@nexus.local`, and `demo-admin@nexus.local`. The previously attempted `investor@nexus.local` address is not the generated account, so the generic login response correctly returns 401. The focused authentication integration suite passes (18/18); this particular demo login issue is an identifier mismatch, not a schema/authentication failure. Use the exact email and newly generated password printed by a successful `demo:setup` or `demo:reset`; a reset replaces those credentials.

### 6. Offer acceptance created a loan without its escrow record

The acceptance service created a `FUNDING` loan and accepted the offer, but omitted that loan's `EscrowAccount`. Investor contribution requires a loan-linked open escrow record, so the ordinary offer-to-investment journey could not continue without fixture or manual database setup.

**Fix:** Offer acceptance now validates the active THB escrow platform account and wallet, then creates the loan-specific `EscrowAccount` in the same serializable transaction as the loan and offer transition. Missing/inactive escrow configuration returns a service-unavailable response and leaves the offer and loan unchanged.

### 7. Fresh database setup omitted operational escrow and clearing wallets

The platform-account seed marked escrow (2200) and repayment clearing (2300) inactive and did not provision their platform wallets. Contribution, repayment and payout services correctly require those accounts and wallets to be active, but a newly seeded database had no usable base configuration.

**Fix:** Fresh seeds now create 2200 and 2300 as active accounts and provision active THB wallets with zero balances. Existing account and wallet statuses remain preserved so re-seeding cannot silently reactivate an operator-disabled account. Existing databases with those accounts already inactive still require explicit operational activation before funding and repayment can run.

### 8. Administrator disbursement did not generate the repayment schedule

The disbursement API posted the loan and returned success, but schedule generation existed only as a separate service call used by test fixtures. A borrower could therefore receive a disbursed loan with no schedule and no usable repayment path.

**Fix:** The admin disbursement API now generates the schedule before returning success. An idempotent retry also ensures the schedule exists, so retrying a posted disbursement can complete schedule generation without posting the financial transfer again.

## Scope disposition against the functional baseline

| Area | Review result |
| --- | --- |
| Authentication and roles | Local/OAuth session paths, role restrictions, backend authorization and admin provisioning controls exist. Authentication integration suite passes. |
| Borrower applications and offers | Versioned application flow, policy validation, review, offer acceptance and expiry paths exist. Policy must be active in the target environment. |
| Investment/funding/disbursement | Offer acceptance provisions escrow; fresh seeded environments have active operational escrow configuration; contributions are ledger-backed; borrower consent and admin disbursement are enforced. |
| Wallets and ledger | Simulated THB wallets, admin opening balances, ledger-backed changes, reconciliation and immutable posted transactions exist. Account 1300 must be active for opening-balance posting. |
| Repayment and receipt | Repayment, installment allocation, idempotency, posting and receipt paths exist; correlated borrower/repayment tests pass. |
| Investor allocation and payout | Persisted allocations, full-allocation payout and read-only reconciliation are present; the reconciliation timeout was corrected. |
| Platform fee | The active platform policy controls the separately disclosed fee; it is not intended to be deducted from wallet balances or posted as an unintended fee transaction. |
| Notifications | In-app notification paths exist. **Email notifications remain excluded from the current MVP work per the user's explicit scope decision**, despite the reference document's broader email recommendation. |
| Machine learning | Investor recommendations use the existing Python integration. Borrower credit prediction remains unavailable because no approved NEXUS THB labeled training set exists; no fabricated score is shown. |
| Real deposits/withdrawals | Explicitly out of scope. Wallets and funds are simulated and platform-controlled. |
| Deployment | Not certified by this review. Staging, hosted DB/service connectivity, production secrets, backup/restore and full deployed journeys still need deployment verification. |

## Cross-role workflow integration review

| Handoff | Current integration | Review |
| --- | --- | --- |
| Borrower → administrator: application | Borrower draft and submit APIs create versioned application data; admin review APIs act on the current submitted version, record the decision, and notify the borrower. Offer issuance requires an approved application and current version. | Connected. Stale/foreign application states are rejected by the service. |
| Administrator → borrower: offer | Admin offer creation uses active platform offer and interest policies, persists expiry and terms, and notifies the borrower. Borrower offer APIs are ownership-scoped; acceptance checks expiry/current application version and creates a `FUNDING` loan. | Connected. Policy availability in each environment remains an operational prerequisite. |
| Investor → borrower: funding | Admin opening-balance posting funds user wallets through ledger entries. Investor marketplace and contribution APIs debit the investor wallet, credit escrow, persist the investment contribution, and transition a fully funded loan to `FUNDED`. Registration provisions an empty THB wallet; it does not silently add funds. | Connected and ledger-backed. Initial balances require an admin action; they are not external deposits. |
| Borrower → administrator: disbursement consent | Borrower loan detail exposes the funded state and records consent; admin loan detail now displays that persisted handoff and refreshes it on request. Admin disbursement then calls the existing approval and posting services. | Connected after the fix above. The posting service remains the final authority. |
| Borrower → investor → administrator: repayment and payout | Repayment submission posts one ledger transaction, updates installments and borrower wallet atomically, persists repayment rows and investor allocations, and returns/serves the receipt. Investor views expose their scoped allocations; admin processes eligible allocations; completed payout credits investor wallet; admin reconciliation reads the combined state. | Connected and exercised by the continuous API journey. |

### Workflow verification boundary

The system-journey test now runs from borrower application creation/submission through administrator review/offer, borrower acceptance, investor initial wallet funding/contribution, borrower consent, administrator disbursement and schedule generation, then repayment/receipt, investor payout and reconciliation. A second journey covers multi-investor allocations from a funded/disbursed fixture. This is continuous API integration coverage; there is no configured browser E2E runner, so visual/browser workflow and staging certification remain open.

The admin disbursement route currently composes request, approval and posting using the authenticated administrator for both request and approval. This is documented existing behavior; the service does not enforce separation of duties. If deployment governance requires two distinct administrators, that needs a separate request/approval workflow and is not implied by the present API contract.

## Verification evidence

- **Initial full suite:** 82 files, 607 tests; 603 passed and 4 failed. The failures were the three stale account-1300 assertions and the reconciliation timeout described above.
- **Seed and payout-reconciliation rerun after fixes:** 2 files, 44 tests passed.
- **Borrower authentication integration:** 1 file, 18 tests passed. This reproduced none of the earlier login 500s.
- **Disbursement-consent and lifecycle-related rerun:** 9 files, 117 tests passed.
- **Remaining borrower API and repayment-submission suites using the updated lifecycle fixture:** 2 files, 66 tests passed.
- **Final disbursement authorization recheck after binding consent to the approved principal:** 2 files, 36 tests passed.
- **Admin consent handoff integration:** 3 related test files, 31 tests passed (admin API, admin loan client and component suites).
- **Platform account seed and wallet provisioning:** 1 file, 12 tests passed.
- **Borrower application/offer/acceptance API:** 1 file, 40 tests passed, including accepted-loan escrow creation.
- **Administrator API:** 1 file, 27 tests passed, including disbursement schedule generation.
- **Cross-role system journey:** 1 file, 2 tests passed, including application through payout/reconciliation.
- **TypeScript:** `npx tsc --noEmit` passed after cross-role workflow changes.
- **Focused ESLint:** changed service, API, seed and journey-test files passed with 0 errors and 0 warnings.
- **Prisma validation:** passed.
- **Test database migration status:** all 39 migrations applied; `nexus_test` is up to date.
- **Production build:** `npm run build` passed with Webpack, including TypeScript checking and static page generation.
- **ESLint:** exit code 0, **0 errors and 36 warnings**. Remaining warnings are unused imports/locals and two unnecessary hook dependencies; they do not fail lint, but can be cleaned in a separate maintenance pass.
- **`git diff --check`:** passed; Git printed only working-copy LF/CRLF normalization notices.

The full suite was not rerun after the final changes; verification after those changes was restricted to the affected suites and shared lifecycle dependents. The initial full-suite failure count and the successful correlated reruns are stated separately so they are not misrepresented as a final full-suite pass.

## Remaining actions before deployment

1. Clean the 36 nonblocking ESLint warnings if a zero-warning lint result is required.
2. Run the wider regression suite in a controlled test-database window if desired; the last full-suite run was before borrower-consent integration.
3. Complete a full cross-role journey in staging and verify the active loan policies, account 1300 configuration and production environment are correct.
4. Verify production database provisioning, secret management, backups/restore and hosted Next.js/Python connectivity.
5. Keep borrower prediction unavailable until an approved NEXUS THB labeled dataset and model validation are available.
