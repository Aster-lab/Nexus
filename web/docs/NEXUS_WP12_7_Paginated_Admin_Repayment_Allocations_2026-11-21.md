# WP12.7 — Paginated Administrator Repayment Allocations

Date: 2026-11-21
Status: Implemented; correlated tests not run by instruction.

## Change

The administrator repayment list previously returned every payout allocation nested in each repayment row. The list now returns only the payout-allocation count; it does not fetch allocation detail rows for collapsed records.

Expanded repayment details load allocations on demand from an administrator-only, repayment-scoped API endpoint. That endpoint paginates all allocations for the repayment, including allocations with completed payouts, and returns persisted principal, interest, recovery, investment, and allocation-method references. Pagination controls are shown inside the expanded detail. The regular pending-allocation endpoint remains a separate operational queue and was not reused for historical allocations. The UI aborts allocation-history requests when details close or their row is removed.

## Coverage and verification

Added administrator API coverage for repayment allocation retrieval and preview counts, plus client coverage for the scoped pagination path. No tests, lint, build, or typecheck were run.

## Follow-up

Confirm this API/UI change against the existing WP9 admin route documentation when verification is authorized. The admin ledger transaction list still nests ledger entries; inspect the posting invariants before changing that relationship. Query plans, data-volume checks, and runtime performance measurements remain outstanding.
