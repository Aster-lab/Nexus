# Phase 5 — Authentication and Audit Contract

The integration suite is in `tests/services/repayment-auth-audit.integration.test.ts`.
It exercises repayment ownership checks, administrator-only financial actions,
and append-only audit history against the database.

| ID | Scenario | Contract |
| --- | --- | --- |
| AUTH-01 | Borrower repays their own loan | The service accepts the borrower identity, associates repayment with the owned loan, and records that user as the repayment audit actor. |
| AUTH-02 | Borrower attempts another borrower's loan | The request is rejected without posting, allocations, installment or wallet changes, or a successful repayment audit. |
| AUTH-03 | Compensation authorization | Borrower and investor actors are rejected; an active administrator succeeds and is recorded in the compensation audit. |
| AUTH-04 | Reconciliation authorization | Borrower and investor actors are rejected; an active administrator receives a read-only report. |
| AUD-01 | Successful repayment audit | The audit row records actor, loan and transaction references, repayment IDs, timestamp, success outcome, and request key. |
| AUD-02 | Successful compensation audit | The audit row records the administrator, original and compensating transaction IDs, action, timestamp, and success outcome while preserving earlier audit history. |
| AUD-03 | Failures and audit immutability | Unauthorized or invalid requests create no success audit. Ordinary update and delete attempts against a persisted audit row are rejected. |

Repayment success auditing is written in the same database transaction as the
financial posting. Administrator authorization for compensation and platform
reconciliation requires an active account and an unrevoked ADMIN role.

Tests were implemented and reviewed but were not executed, as requested.
