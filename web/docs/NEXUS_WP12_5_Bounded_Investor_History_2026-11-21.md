# WP12.5 — Bounded Investor Investment History

Date: 2026-11-21
Status: Implemented; correlated tests not run by instruction.

## Change

The paginated investor investment list previously included every contribution and payout allocation for each investment. Pagination bounded the investment rows but did not bound those nested collections, so response size could continue growing with account history.

The list endpoint now returns at most the five most recent contribution rows and five most recent payout allocation rows per investment. It includes total row counts and `hasMoreContributions` / `hasMorePayoutAllocations` flags so consumers can identify that the returned rows are previews. Posted contribution totals are computed by a database grouping query over posted ledger transactions, rather than by summing the truncated preview.

The client list record type exposes the count and preview metadata. The investment detail endpoint continues to provide full contribution and allocation history; this change does not truncate the detail page or change financial records and calculations.

## Coverage and verification

The correlated API-04-09 test covers six persisted contributions, a five-row preview, the count and `hasMoreContributions` flag, and the full posted total. The test was not run, and no tests, lint, build, or typecheck were run for this subphase.

## Follow-up

The follow-up detail history pagination is implemented in [WP12.6](NEXUS_WP12_6_Paginated_Investor_Detail_History_2026-11-21.md).
