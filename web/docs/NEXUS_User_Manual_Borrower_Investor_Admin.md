# NEXUS User Manual

**Audience:** Borrowers, investors, and administrators  
**Platform:** NEXUS MVP  
**Important:** NEXUS wallet balances and financial activity are simulated. The MVP does not accept real bank deposits or send real-world payments.

## Getting started

1. Open the NEXUS site and choose **Create an account** or **Sign in**.
2. Borrower and investor roles are available for self-registration. One account may have both roles. Administrators cannot self-register.
3. After sign-in, NEXUS opens a role workspace. If your account has both borrower and investor roles, use the role navigation to open each workspace.
4. Borrower and investor dashboards show an interactive first-visit tour. It highlights dashboard sections, offers links to relevant pages, saves progress in the current browser, and can be paused or resumed with **Take the tour** / **Resume tour**.

Financial amounts, eligibility, repayment schedules, and posting outcomes shown by NEXUS come from backend records. The UI does not replace the backend's decision or validation.

## Borrower guide

### Dashboard

Open **Borrower → Overview** (`/borrower`). Review pending applications, active loans, the next installment, overdue amounts, recent repayments, and your simulated wallet summary. Use each section's link to open its detailed page. A temporary issue in one dashboard section should not prevent the other sections from loading.

### Create and submit an application

1. Open **Applications** (`/borrower/applications`).
2. Choose **Create application** (`/borrower/applications/new`).
3. Enter the requested amount, term, purpose, and the profile information requested by the form.
4. Review the summary and save a draft.
5. Open the draft, edit it if permitted, and submit it when ready.
6. Follow status and review information on the application detail page.

An application marked **Approved** is not yet a loan and does not automatically appear in the investor marketplace.

### Review and accept an offer

1. Once an administrator issues an offer, open **Offers** (`/borrower/offers`).
2. Review the amount, rate, term, expiry, platform-fee disclosure, and other returned terms.
3. Choose an available offer, review the confirmation, and accept only if the terms are correct.

After acceptance, NEXUS creates the loan in `FUNDING` status. It can then appear in the investor marketplace while it remains eligible and has capacity. Acceptance does not itself disburse funds.

### Loans, repayments, and receipts

- Open **Loans and repayments** (`/borrower/loans`) to inspect the loan and the backend-generated installment schedule.
- Use a loan's **Repay** action when an installment is payable. Enter an amount within the current payable amount and review the confirmation. The backend decides the final allocation and posts the transaction.
- NEXUS applies repayments to the oldest outstanding installment, interest first. Partial repayment is supported when permitted; early repayment and overpayment are rejected by backend rules.
- Open **Repayment history** (`/borrower/repayments`) to review persisted repayments. Use the receipt link for a confirmed repayment when available.
- A request that times out may have an uncertain result. Check repayment history before retrying; do not assume it succeeded just because it was submitted.

### Borrower wallet

Open **Wallet** (`/borrower/wallet`) to view the simulated THB balance and posted wallet activity. Registration creates an empty wallet. If an initial balance is appropriate for the scenario, an administrator must post it. A loan disbursement credits the borrower wallet after the required approval and borrower consent steps.

## Investor guide

### Dashboard and wallet

- Open **Investor → Overview** (`/investor`) for wallet balance, portfolio totals, recent investments, payouts, and wallet activity.
- Open **Wallet** (`/investor/wallet`) for the persisted simulated THB balance and posted ledger activity.
- Newly registered investor wallets start at zero. An administrator assigns simulated opening funds through the financial workflow. NEXUS does not link to a bank account.

### Marketplace and investment

1. Open **Marketplace** (`/investor/marketplace`).
2. Select an available opportunity to inspect principal, funding progress, interest rate, term, and deadline.
3. Choose the invest action to review the requested contribution and available wallet balance.
4. Review the confirmation before submitting. The backend rechecks the investor's funds, loan eligibility, and remaining capacity.

An approved application is not sufficient for marketplace listing. The administrator must issue an offer, and the borrower must accept it. The resulting loan must still be open for funding, have an open escrow account, be before its deadline, and have remaining capacity. Returns are not guaranteed.

### Portfolio, allocations, and payout history

- Open **Portfolio** (`/investor/portfolio`) to review investments and their persisted details.
- Open **Repayment allocations** (`/investor/allocations`) to inspect repayment amounts allocated to your investments.
- An allocation is not a wallet credit. The administrator payout workflow must complete before funds are credited to the investor wallet.
- Open **Payout history** (`/investor/payouts`) and a payout's detail page to see its status and references.
- Recommendation features, when available, are informational and do not guarantee a return or replace your review of loan terms.

## Administrator guide

### Create the first administrator account

Administrators are created outside public registration using the one-time interactive bootstrap CLI. From a trusted terminal configured for the intended database, run:

```powershell
npm run admin:bootstrap
```

The tool prompts for an email and a password without echoing the password, verifies the configured database identity, and refuses to create an initial administrator if one already exists. Production bootstrap additionally requires the explicit `--confirm-production` flag and a typed confirmation. Keep the password private; never place it in source control or chat.

### Application review and offer issuance

1. Open **Applications** (`/admin/applications`) and filter for submitted or under-review requests.
2. Choose **Review** to open an application.
3. Inspect the borrower and requested-loan details and review history.
4. Record an approval or rejection with a required reason. The decision is persisted and audited.
5. For an approved application, use the **Loan offer** section on that same detail page. It appears below the decision area.
6. Confirm the principal, choose a supported term, enter the issuance reason, and issue the offer. Active platform policies control the allowed principal/rate/expiry; the backend validates the request.
7. Review the offer history on the page. An issued offer remains pending until the borrower accepts it. Do not create a funding loan manually.

If **Issue loan offer** is unavailable, verify that the application is approved and has a current submitted version, there is no unexpired offer already awaiting borrower review, and no offer has already been accepted. The service returns the authoritative validation error if a policy or state has changed.

### Wallet opening balances

1. Open **Financial overview** (`/admin/financial`).
2. Scroll to the wallet activity/balance section.
3. Find the borrower or investor wallet and choose **Assign initial balance**.
4. Enter the simulated THB amount and a reason, review the confirmation, then confirm the posting.

This operation creates a ledger-backed, immutable opening-balance posting. It is not a bank deposit. The platform opening-balance source must be configured and active.

### Loans and disbursement

- Open **Loans** (`/admin/loans`) and select a loan to view its funding and escrow details.
- A fully funded loan requires the borrower's recorded disbursement consent before the admin disbursement workflow can proceed.
- Disbursement creates a posted ledger transaction and repayment schedule. Check the persisted result and schedule in the loan details.
- Do not edit posted ledger records or wallet balances directly. Corrections use a compensating transaction under authorized controls.

### Repayments and payouts

- **Repayments** (`/admin/repayments`) shows repayment records and their installment allocations.
- **Investor payouts** (`/admin/payouts`) shows eligible allocations and payout history. Process only allocations permitted by backend status and clearing-wallet checks.
- A payout credits the investor wallet only after the payout transaction is posted.
- Failed or conflicting requests should be investigated from their persisted status and audit trail before retrying.

### Financial overview, users, and audit

- **Financial overview** (`/admin/financial`) runs read-only financial reconciliation and displays discrepancies. It does not repair records.
- **Users** (`/admin/users`) and **Audit logs** (`/admin/audit-logs`) provide administrator visibility and controls supported by their APIs.
- Financial and user-management actions remain authorized and audited by the backend.

## Common status explanations

| Status/state | Meaning |
| --- | --- |
| Application approved | Review decision recorded; administrator still needs to issue an offer. |
| Offer issued | Borrower can review and accept the offer before expiry. |
| Loan funding | Borrower accepted; investors may contribute if the loan remains eligible. |
| Loan funded | Funding target is met; disbursement still requires borrower consent and administrator processing. |
| Repayment allocation pending payout | Investor entitlement is recorded but has not yet become a wallet credit. |
| Payout completed | A posted payout has credited the investor wallet. |

## Safety reminders

- NEXUS MVP wallets and transactions are simulated, not real banking or payment services.
- Never share passwords, session cookies, or production secrets.
- Review every confirmation before submitting an application decision, offer, investment, repayment, opening balance, disbursement, or payout.
- Backend responses and persisted records are authoritative. Contact an administrator if the displayed state appears inconsistent.
