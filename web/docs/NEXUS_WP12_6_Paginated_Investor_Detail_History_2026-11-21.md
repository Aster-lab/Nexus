# WP12.6 — Paginated Investor Detail History

Date: 2026-11-21
Status: Implemented; correlated tests not run by instruction.

## Change

The investor investment detail endpoint previously returned the entire contribution and payout-allocation history in one response. Both collections now have independent page and page-size parameters, bounded to a maximum of 100 rows per collection. Responses include total counts, page metadata, and `hasMore` flags. Posted contribution totals continue to come from persisted contribution rows linked to `POSTED` ledger transactions and are aggregated in the database.

The investment detail UI now shows previous/next controls independently for contributions and allocations. It requests the selected page from the backend and continues to display the backend-provided aggregate total. Ownership scoping remains part of the investment lookup. Page-change and unmount fetches are aborted so stale requests do not keep running or replace newer history.

## Coverage and verification

The investor API integration coverage exercises the contribution preview and next page, including counts and page metadata. The investor client test covers query construction for both history pages. These tests were not run. No lint, build, or typecheck was run.

## Follow-up

The administrator repayment allocation collection was bounded and paginated in [WP12.7](NEXUS_WP12_7_Paginated_Admin_Repayment_Allocations_2026-11-21.md). Ledger entries remain nested in the admin ledger transaction list; inspect posting invariants before considering a cap.
