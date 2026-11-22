"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "../../lib/client/api-client";
import { formatSatang } from "../../lib/client/financial-format";
import {
  ADMIN_PAYOUT_STATUSES,
  canAdminProcessPayout,
  loadAdminPayouts,
  loadAdminPendingPayoutAllocations,
  processAdminPayout,
  type AdminPayoutHistoryQuery,
  type AdminPayoutRecord,
  type AdminPendingPayoutAllocation,
} from "../../lib/client/admin-payouts";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { EmptyState, ErrorState, LoadingState } from "../ui/request-state";

function AllocationRow({ allocation, processing, onProcess }: {
  allocation: AdminPendingPayoutAllocation;
  processing: boolean;
  onProcess: (allocation: AdminPendingPayoutAllocation) => void;
}) {
  const eligible = canAdminProcessPayout(allocation.eligibility);
  return (
    <tr>
      <td><span className="admin-table__strong">{allocation.investor.displayName}</span><span className="admin-muted">{allocation.investor.investorProfileId.slice(0, 8)}</span></td>
      <td>{allocation.investment.loanId.slice(0, 8)}</td>
      <td>{allocation.repayment.id.slice(0, 8)} · #{allocation.repayment.installment.installmentNumber}</td>
      <td>{formatSatang(allocation.principalSatang)}</td>
      <td>{formatSatang(allocation.interestSatang)}</td>
      <td><strong>{formatSatang(allocation.amountSatang)}</strong></td>
      <td><Badge variant={eligible ? "success" : "warning"}>{eligible ? "Ready" : "Needs review"}</Badge>{!eligible ? <span className="admin-muted">{allocation.eligibility.message}</span> : null}</td>
      <td><Button size="sm" disabled={!eligible || processing} onClick={() => onProcess(allocation)}>{processing ? "Posting…" : "Process payout"}</Button></td>
    </tr>
  );
}

function PayoutHistoryRows({ rows }: { rows: AdminPayoutRecord[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>Payout</th><th>Investor profile</th><th>Allocation</th><th>Principal</th><th>Interest</th><th>Status</th><th>Ledger transaction</th><th>Completed</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.id.slice(0, 8)}</td><td>{row.investorProfileId.slice(0, 8)}</td><td>{row.payoutAllocationId.slice(0, 8)}</td>
              <td>{formatSatang(row.principalSatang)}</td><td>{formatSatang(row.interestSatang)}</td>
              <td><Badge variant={row.status === "COMPLETED" ? "success" : row.status === "FAILED" ? "warning" : "outline"}>{row.status}</Badge>{row.status === "FAILED" ? <span className="admin-muted">Retry is not supported by this API.</span> : null}</td>
              <td>{row.ledgerTransactionId ?? "—"}</td><td>{row.completedAt ? new Date(row.completedAt).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminPayoutsPage() {
  const [allocations, setAllocations] = useState<AdminPendingPayoutAllocation[]>([]);
  const [allocationPagination, setAllocationPagination] = useState<{ page: number; total: number; totalPages: number } | null>(null);
  const [allocationState, setAllocationState] = useState<"loading" | "error" | "success">("loading");
  const [allocationError, setAllocationError] = useState("");
  const [history, setHistory] = useState<AdminPayoutRecord[]>([]);
  const [historyPagination, setHistoryPagination] = useState<{ page: number; total: number; totalPages: number } | null>(null);
  const [historyQuery, setHistoryQuery] = useState<AdminPayoutHistoryQuery>({ page: 1, limit: 10, status: "ALL", investorProfileId: "", sortBy: "createdAt", sortOrder: "desc" });
  const [draftInvestorProfileId, setDraftInvestorProfileId] = useState("");
  const [historyFilterError, setHistoryFilterError] = useState("");
  const [historyState, setHistoryState] = useState<"loading" | "error" | "success">("loading");
  const [historyError, setHistoryError] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const idempotencyKeys = useRef(new Map<string, string>());

  const refreshAllocations = useCallback(async (page = 1) => {
    try {
      const result = await loadAdminPendingPayoutAllocations({ page, limit: 10, sortOrder: "desc" });
      setAllocations(result.data);
      setAllocationPagination(result.pagination ? { page: result.pagination.page, total: result.pagination.total, totalPages: result.pagination.totalPages } : null);
      setAllocationState("success");
    } catch (error) {
      setAllocationError(error instanceof ApiClientError ? error.message : "Unpaid allocations could not be loaded.");
      setAllocationState("error");
    }
  }, []);

  const refreshHistory = useCallback(async (query: AdminPayoutHistoryQuery) => {
    try {
      const result = await loadAdminPayouts(query);
      setHistory(result.data);
      setHistoryPagination(result.pagination ? { page: result.pagination.page, total: result.pagination.total, totalPages: result.pagination.totalPages } : null);
      setHistoryState("success");
    } catch (error) {
      setHistoryError(error instanceof ApiClientError ? error.message : "Payout history could not be loaded.");
      setHistoryState("error");
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => { void refreshAllocations(); }, 0);
    return () => window.clearTimeout(task);
  }, [refreshAllocations]);
  useEffect(() => {
    const task = window.setTimeout(() => { void refreshHistory(historyQuery); }, 0);
    return () => window.clearTimeout(task);
  }, [historyQuery, refreshHistory]);

  function updateHistoryQuery(changes: Partial<AdminPayoutHistoryQuery>) {
    const next = { ...historyQuery, ...changes, page: changes.page ?? 1 };
    setHistoryQuery(next);
    setHistoryState("loading");
  }

  function applyInvestorFilter() {
    const value = draftInvestorProfileId.trim();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (value && !uuid.test(value)) {
      setHistoryFilterError("Enter a valid investor profile ID or clear this field.");
      return;
    }
    setHistoryFilterError("");
    updateHistoryQuery({ investorProfileId: value });
  }

  async function handleProcess(allocation: AdminPendingPayoutAllocation) {
    if (!canAdminProcessPayout(allocation.eligibility) || processingId) return;
    const prompt = `Pay ${formatSatang(allocation.amountSatang)} to ${allocation.investor.displayName} for this allocation? NEXUS will verify the available clearing balance before posting.`;
    if (!window.confirm(prompt)) return;
    setProcessingId(allocation.id);
    setActionError("");
    setNotice("");
    const key = idempotencyKeys.current.get(allocation.id) ?? `admin-payout-${allocation.id}-${crypto.randomUUID()}`;
    idempotencyKeys.current.set(allocation.id, key);
    try {
      const result = await processAdminPayout(allocation.id, key);
      idempotencyKeys.current.delete(allocation.id);
      setNotice(`Payout ${result.data.status}. Ledger transaction ${result.data.ledgerTransactionId}.`);
      await Promise.all([refreshAllocations(), refreshHistory(historyQuery)]);
    } catch (error) {
      setActionError(error instanceof ApiClientError ? error.message : "The payout result is unconfirmed. Check payout history before retrying; the same idempotency key will be reused.");
    } finally { setProcessingId(null); }
  }

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <div><p className="admin-eyebrow">Financial operations</p><h1>Investor payout operations</h1><p className="admin-muted">Review eligible allocations, process payouts, and check their status.</p></div>
      </header>
      {notice ? <p role="status" className="admin-success-note">{notice}</p> : null}
      {actionError ? <p role="alert" className="admin-danger-note">{actionError}</p> : null}

      <Card>
        <CardHeader><CardTitle>Pending allocations</CardTitle><CardDescription>NEXUS checks each allocation and the available clearing balance again before processing a payout.</CardDescription></CardHeader>
        <CardContent>
          {allocationState === "loading" ? <LoadingState label="Loading unpaid allocations" /> : null}
          {allocationState === "error" ? <ErrorState title="Pending allocations unavailable" message={allocationError} /> : null}
          {allocationState === "success" && allocations.length === 0 ? <EmptyState title="No unpaid allocations" description="New posted repayments will appear when their allocations are available." /> : null}
          {allocationState === "success" && allocations.length > 0 ? (
            <>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Investor</th><th>Loan</th><th>Repayment</th><th>Principal</th><th>Interest</th><th>Total payout</th><th>Eligibility</th><th><span className="sr-only">Action</span></th></tr></thead>
                  <tbody>{allocations.map((allocation) => <AllocationRow key={allocation.id} allocation={allocation} processing={processingId === allocation.id} onProcess={(item) => void handleProcess(item)} />)}</tbody>
                </table>
              </div>
              {allocationPagination ? (
                <nav className="admin-pagination" aria-label="Pending payout allocation pages">
                  <span>Page {allocationPagination.page} of {allocationPagination.totalPages || 1} · {allocationPagination.total} allocations</span>
                  <div>
                    <Button variant="outline" size="sm" disabled={allocationPagination.page <= 1} onClick={() => void refreshAllocations(allocationPagination.page - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={allocationPagination.page >= allocationPagination.totalPages} onClick={() => void refreshAllocations(allocationPagination.page + 1)}>Next</Button>
                  </div>
                </nav>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payout history</CardTitle><CardDescription>Persisted payout status, allocation, and ledger references.</CardDescription></CardHeader>
        <CardContent>
          <div className="admin-filter-bar admin-filter-bar--compact">
            <label className="admin-form-label" htmlFor="payout-status-filter">Payout status
              <select className="admin-form-control" id="payout-status-filter" value={historyQuery.status} onChange={(event) => updateHistoryQuery({ status: event.target.value as AdminPayoutHistoryQuery["status"] })}>
                <option value="ALL">All statuses</option>{ADMIN_PAYOUT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label className="admin-form-label" htmlFor="payout-investor-filter">Investor profile ID
              <input className="admin-form-control" id="payout-investor-filter" value={draftInvestorProfileId} onChange={(event) => setDraftInvestorProfileId(event.target.value)} />
            </label>
            <Button variant="outline" onClick={applyInvestorFilter}>Apply investor filter</Button>
            <label className="admin-form-label" htmlFor="payout-sort-filter">Sort by
              <select className="admin-form-control" id="payout-sort-filter" value={historyQuery.sortBy} onChange={(event) => updateHistoryQuery({ sortBy: event.target.value as AdminPayoutHistoryQuery["sortBy"] })}>
                <option value="createdAt">Created date</option><option value="completedAt">Completion date</option>
              </select>
            </label>
          </div>
          {historyFilterError ? <p className="admin-filter-error" role="alert">{historyFilterError}</p> : null}
          {historyState === "loading" ? <LoadingState label="Loading payout history" /> : null}
          {historyState === "error" ? <ErrorState title="Payout history unavailable" message={historyError} /> : null}
          {historyState === "success" && history.length === 0 ? <EmptyState title="No payout records" description="Payout history will appear after an administrator processes an allocation." /> : null}
          {historyState === "success" && history.length > 0 ? (
            <>
              <PayoutHistoryRows rows={history} />
              {historyPagination ? (
                <nav className="admin-pagination" aria-label="Payout history pages">
                  <span>Page {historyPagination.page} of {historyPagination.totalPages || 1} · {historyPagination.total} payouts</span>
                  <div>
                    <Button variant="outline" size="sm" disabled={historyQuery.page <= 1} onClick={() => updateHistoryQuery({ page: historyQuery.page - 1 })}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={historyQuery.page >= historyPagination.totalPages} onClick={() => updateHistoryQuery({ page: historyQuery.page + 1 })}>Next</Button>
                  </div>
                </nav>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
