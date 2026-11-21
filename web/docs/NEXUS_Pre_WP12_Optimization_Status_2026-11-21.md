# NEXUS Pre-WP12 Optimization Status

Date: 2026-11-21  
Overall status: **In progress; not ready to mark complete.**

## Completed implementation/review subphases

| Subphase | Result | Verification |
| --- | --- | --- |
| Backend/database | Investor portfolio totals and investment counts now use database aggregate/group queries instead of transferring every row to Node.js. Existing posted-ledger filters and financial formulas are preserved. | Correlated investor API coverage added; not run. No query plans or load measurements captured. |
| Frontend | Admin dashboard reads now abort on page unmount. Borrower/investor dashboards already cancel refresh requests and all dashboards bound recent rows. | Correlated signal-forwarding coverage added; not run. No browser/device performance measurements captured. |
| ML/security static review | Python model loads once in FastAPI lifespan. Added baseline browser security headers and documented deployment safeguards. | Static inspection only; Next config coverage added but not run. No model timing or deployed security scan. |
| Hosting estimate | Compared Render, Railway, and Vercel-based shapes using published prices and a Thailand-friendly Singapore region. Recommended Render for the first hosted demonstration, with predictions disabled. | Price estimates documented; no account, service, or database was provisioned. |
| Demo environment | Added loopback-only `nexus_demo` guard, account/profile provisioning, one-time password display, reset prompt, and simulated-data banner. | Correlated coverage added but not run. No demo database was created or changed. |
| Investor history payloads | Investor investment lists bound nested previews to five rows; investment detail paginates contribution and allocation histories independently. Counts and posted totals are database-derived. | Correlated API and client coverage is present but not run. |
| Admin repayment allocations | Admin repayment list returns counts only; expanded details retrieve allocation history on demand through a paginated, repayment-scoped admin API. | Correlated API and client coverage added but not run. |
| Financial read indexes | Added targeted indexes for admin ledger status/posting-time reads, repayment status/received-time reads, and repayment-scoped allocation history. Ledger detail entries remain complete because current posting paths create balanced two-entry postings and compensation mirrors all original entries. | Migration prepared only; no migration, query plans, or tests run. |
| Investor detail history | Investment detail now paginates contributions and payout allocations independently, with persisted database totals and UI paging controls. | Correlated API and client coverage added but not run. |

## Not complete

- User decision is pending on whether demo setup should activate demo-only policies and create a realistic loan journey through existing services. Until then demo data is limited to three user accounts and role profiles.
- User decision is pending on the hosting provider, continuous-uptime requirement, and monthly budget. No paid cloud service has been created.
- Correlated tests, `npx tsc`, lint, build, Python tests, browser checks, and the new financial-read-index migration remain unrun under the current instruction.
- Performance baselines, PostgreSQL `EXPLAIN` plans, realistic data-volume checks, and connection-pool sizing remain outstanding.
- No production/staging database was provisioned, no migration was run against a hosted service, and no backup restoration was rehearsed.
- Security items dependent on the hosting boundary remain open: trusted-proxy forwarded-IP configuration, CSP nonce/hash strategy, HSTS for the selected HTTPS origin, production secret management, and database network allow-listing.
- Python inference remains unavailable until an approved NEXUS THB training dataset/model decision is made.

## Detailed records

- [Backend/database optimization](NEXUS_WP12_1_Backend_Database_Optimization_2026-11-21.md)
- [Frontend performance review](NEXUS_WP12_2_Frontend_Performance_2026-11-21.md)
- [ML, security, and deployment audit](NEXUS_WP12_3_ML_Security_Deployment_Audit_2026-11-21.md)
- [Hosting options and cost plan](NEXUS_WP12_4_Hosting_Options_and_Costs_2026-11-21.md)
- [Demo mode design and setup](NEXUS_Demo_Mode_and_Pre_WP12_Review_2026-11-21.md)
- [Bounded investor history payloads](NEXUS_WP12_5_Bounded_Investor_History_2026-11-21.md)
- [Paginated investor detail history](NEXUS_WP12_6_Paginated_Investor_Detail_History_2026-11-21.md)
- [Paginated admin repayment allocations](NEXUS_WP12_7_Paginated_Admin_Repayment_Allocations_2026-11-21.md)
- [Financial read indexes](NEXUS_WP12_8_Financial_Read_Indexes_2026-11-21.md)

