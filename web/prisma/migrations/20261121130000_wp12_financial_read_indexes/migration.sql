-- Support common admin list ordering and repayment-scoped allocation history pages.
CREATE INDEX "ledger_transactions_status_posted_at_idx"
  ON "ledger_transactions"("status", "posted_at");

CREATE INDEX "repayments_status_received_at_idx"
  ON "repayments"("status", "received_at");

CREATE INDEX "payout_allocations_repayment_id_created_at_idx"
  ON "payout_allocations"("repayment_id", "created_at");
