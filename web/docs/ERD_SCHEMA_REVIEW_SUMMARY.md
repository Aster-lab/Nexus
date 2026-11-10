# NEXUS ERD-to-Prisma Review Summary

Date: 5 November 2026

Scope: reviewed the Prisma schema against the supplied NEXUS ERD and technical implementation specification for all 13 domains. Changes are additive and have **not** been applied to any database.

## Domain-by-domain changes

| Domain | Main schema and database changes |
|---|---|
| 1. Identity and authorization | Normalized email uniqueness; one active assignment per user/role; removed the stray enum-array field; preflight checks before enforcing identity constraints. |
| 2. Borrower applications | Composite ownership links for application versions, reviews, and offers; one current version and one accepted offer rules; positive-value and submitted-version integrity. |
| 3. Loan lifecycle | Corrected `DEFEAULTED` to `DEFAULTED`; recorded both previous and new loan status; linked loans to the correct borrower/application and accepted offer; added lifecycle and amount constraints. |
| 4. Wallet and ledger | Added wallet/entry ownership and amount constraints, balanced posted-transaction enforcement, cached balance reconciliation, and posted-record immutability. Reversals use separate compensating transactions; existing `REVERSED` rows stop the migration for review. |
| 5. Investment and escrow | Positive contribution/escrow amounts; funding cannot exceed principal; contributions and escrow movements are immutable; escrow totals reconcile to posted movements. |
| 6. Repayment and payout | Linked schedule versions to their schedule; repayment components reconcile to totals; original posted repayments stay immutable and corrections use linked compensating repayments; payout allocations exactly match principal and interest, with recovery separate; payout completion and installment totals are checked. |
| 7. ML governance | Unique model name/version; `isActive` state; only approved versions may be active and at most one active version per model name; activation actions and prediction/risk-assessment history are constrained and immutable. |
| 8. Administration and governance | Positive policy version numbers; one active policy version per policy; audit logs and alert history are append-only. |
| 9. Communications and support | Widened support category to match the ERD; added previous/new support status fields while preserving historical entries; new support history requires a resulting status and actor; notification retry counts must be nonnegative. Essential notification categories are left for an explicit category policy. |
| 10. Financial operations | Positive withdrawals; wallet must belong to the withdrawal user; completed withdrawals require a timestamp and POSTED ledger transaction; idempotency completion timestamps and outbox retry/completion fields are checked. Same-key/same-payload response behavior remains an application command-handler responsibility. |
| 11. Document privacy | Positive file sizes and document versions; rejects HTTP(S) public URL object references; document application and application-version must belong together. |
| 12. Investor marketplace | Positive recommendation ranking positions; nonnegative latency; one active saved-loan row per investor/loan pair. |
| 13. Retention and backup | Retention policy versions can share a policy code but have unique code/version pairs; positive version and duration; approved/active versions need an approver and duration; only one active version per code; completed retention executions and verified backups require timestamps; backup references must be nonempty. |

## New additive migrations

Apply in timestamp order after the existing `20261103...` baseline migrations:

1. `20261105090000_harden_identity_integrity`
2. `20261105110000_domain2_application_integrity`
3. `20261105120000_domain3_loan_lifecycle_integrity`
4. `20261105130000_domain4_wallet_ledger_integrity`
5. `20261105140000_domain5_investment_escrow_integrity`
6. `20261105150000_domain6_repayment_payout_integrity`
7. `20261105160000_domain7_ml_governance_integrity`
8. `20261105170000_domain8_admin_governance_integrity`
9. `20261105180000_domain9_communications_support_integrity`
10. `20261105190000_domain10_financial_operations_integrity`
11. `20261105200000_domain11_document_privacy_integrity`
12. `20261105210000_domain12_marketplace_integrity`
13. `20261105220000_domain13_retention_backup_integrity`

Each migration contains preflight checks for data that would violate its new rules. A preflight failure stops that migration and identifies the data condition to review; it does not automatically repair or delete data.

## Validation and rollout

- `npx prisma validate --schema prisma/schema.prisma` passed.
- `npx prisma generate --schema prisma/schema.prisma` passed (Prisma Client 7.10.1).
- No database migration was executed. Review the generated SQL and its preflight checks, then apply migrations in order to development first. Keep production for a separately reviewed deployment after development has been verified.

## Review notes

- Migrations 1–7 were already present from the preceding domain-by-domain work; migrations 8–13 were added in this pass.
- The support-history migration keeps legacy rows with null status/actor fields; its trigger requires both fields for new rows.
- The database cannot infer whether a polymorphic retention target has a legal hold. The retention worker must check active holds before deleting or anonymizing data.
- The database cannot classify secrets inside generic JSON audit metadata. Application logging must redact passwords, tokens, and unnecessary personal information.
- Before applying Domain 13, inspect the preflight result for existing approved/active retention policies lacking an approver or duration. Resolve those records through the compliance review process rather than bypassing the check.
