"use client";

import { useEffect, useState } from "react";
import { ApiClientError } from "../../lib/client/api-client";
import { formatSatang } from "../../lib/client/financial-format";
import {
  isValidAdminLoanIdFilter,
  loadAdminRepaymentAllocations,
  loadAdminRepayments,
  type AdminRepaymentAllocationRecord,
  type AdminRepaymentRecord,
  type AdminRepaymentsQuery,
} from "../../lib/client/admin-repayments";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { EmptyState, ErrorState, LoadingState } from "../ui/request-state";

const INITIAL_QUERY: AdminRepaymentsQuery = { page: 1, limit: 10, status: "ALL", loanId: "", sortBy: "receivedAt", sortOrder: "desc" };

function RepaymentDetail({ row, open }: { row: AdminRepaymentRecord; open: boolean }) {
  const [allocationResponse, setAllocationResponse] = useState<{ key: string; data: AdminRepaymentAllocationRecord[]; pagination: { page: number; totalPages: number; total: number } | null } | null>(null);
  const [allocationPage, setAllocationPage] = useState(1);
  const [allocationRetry, setAllocationRetry] = useState(0);
  const [allocationFailure, setAllocationFailure] = useState<{ key: string; message: string } | null>(null);
  const allocationRequestKey = `${row.id}:${allocationPage}:${allocationRetry}`;
  const allocationLoading = open && allocationResponse?.key !== allocationRequestKey && allocationFailure?.key !== allocationRequestKey;
  const allocations = allocationResponse?.key === allocationRequestKey ? allocationResponse.data : [];
  const allocationPagination = allocationResponse?.key === allocationRequestKey ? allocationResponse.pagination : null;
  const allocationError = allocationFailure?.key === allocationRequestKey ? allocationFailure.message : null;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void loadAdminRepaymentAllocations(row.id, allocationPage, 10, undefined, controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      setAllocationResponse({
        key: allocationRequestKey,
        data: response.data,
        pagination: response.pagination ? { page: response.pagination.page, totalPages: response.pagination.totalPages, total: response.pagination.total } : null,
      });
      setAllocationFailure(null);
    }).catch(() => {
      if (!controller.signal.aborted) setAllocationFailure({ key: allocationRequestKey, message: "Investor allocations could not be loaded." });
    });
    return () => controller.abort();
  }, [row.id, allocationPage, allocationRequestKey, open]);

  return <div className="admin-repayment-detail">
    <dl className="admin-repayment-detail__grid">
      <div><dt>Borrower profile reference</dt><dd>{row.loan.borrowerProfileId}</dd></div>
      <div><dt>Loan status</dt><dd>{row.loan.status}</dd></div>
      <div><dt>Installment ID</dt><dd>{row.installmentId}</dd></div>
      <div><dt>Amount paid</dt><dd>{formatSatang(row.totalSatang)}</dd></div>
      <div><dt>Principal</dt><dd>{formatSatang(row.principalSatang)}</dd></div>
      <div><dt>Interest</dt><dd>{formatSatang(row.interestSatang)}</dd></div>
      <div><dt>Fee</dt><dd>{formatSatang(row.feeSatang)}</dd></div>
      <div><dt>Installment status</dt><dd>{row.installment.status}</dd></div>
      <div><dt>Installment amount paid</dt><dd>{formatSatang(row.installment.paidPrincipalSatang)} principal · {formatSatang(row.installment.paidInterestSatang)} interest</dd></div>
      <div><dt>Ledger transaction</dt><dd>{row.ledgerTransactionId} · {row.ledgerTransaction.status}</dd></div>
      <div><dt>Ledger posted at</dt><dd>{row.ledgerTransaction.postedAt ? new Date(row.ledgerTransaction.postedAt).toLocaleString() : "Not posted"}</dd></div>
    </dl>
    <div><h3>Investor allocations ({row.payoutAllocationCount})</h3>
      {allocationLoading ? <p role="status" className="admin-muted">Loading investor allocations…</p> : null}
      {allocationError ? <div role="alert" className="admin-filter-error"><p>{allocationError}</p><Button size="sm" variant="outline" onClick={() => setAllocationRetry((retry) => retry + 1)}>Retry</Button></div> : null}
      {!allocationLoading && !allocationError && allocations.length ? <ul>{allocations.map((allocation) => <li key={allocation.id}>Investment {allocation.investmentId}: {formatSatang(allocation.principalSatang)} principal · {formatSatang(allocation.interestSatang)} interest</li>)}</ul> : null}
      {!allocationLoading && !allocationError && row.payoutAllocationCount === 0 ? <p className="admin-muted">No allocation rows were recorded.</p> : null}
      {allocationPagination && allocationPagination.totalPages > 1 ? <nav className="admin-pagination" aria-label="Repayment allocation pages"><span>Page {allocationPagination.page} of {allocationPagination.totalPages} · {allocationPagination.total} allocations</span><div><Button size="sm" variant="outline" disabled={allocationPage <= 1 || allocationLoading} onClick={() => setAllocationPage((page) => Math.max(1, page - 1))}>Previous</Button><Button size="sm" variant="outline" disabled={allocationPage >= allocationPagination.totalPages || allocationLoading} onClick={() => setAllocationPage((page) => page + 1)}>Next</Button></div></nav> : null}
    </div>
    <p className="admin-muted">An administrator receipt endpoint is not available; this view uses only persisted repayment data.</p>
  </div>;
}

function RepaymentDetailsDisclosure({ row }: { row: AdminRepaymentRecord }) {
  const [open, setOpen] = useState(false);
  return <details className="admin-row-details" onToggle={(event) => setOpen(event.currentTarget.open)}><summary>View</summary><RepaymentDetail row={row} open={open} /></details>;
}

export function AdminRepaymentsPage() {
  const [query, setQuery] = useState(INITIAL_QUERY);
  const [draftLoanId, setDraftLoanId] = useState("");
  const [rows, setRows] = useState<AdminRepaymentRecord[]>([]);
  const [pagination, setPagination] = useState<{ page: number; total: number; totalPages: number } | null>(null);
  const [state, setState] = useState<"loading" | "error" | "success">("loading");
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");

  useEffect(() => {
    let current = true;
    void loadAdminRepayments(query).then((response) => {
      if (!current) return;
      setRows(response.data);
      setPagination(response.pagination ? { page: response.pagination.page, total: response.pagination.total, totalPages: response.pagination.totalPages } : null);
      setState("success");
    }).catch((caught: unknown) => {
      if (!current) return;
      setError(caught instanceof ApiClientError ? caught.message : "Repayment records could not be loaded.");
      setState("error");
    });
    return () => { current = false; };
  }, [query]);

  function applyLoanFilter() {
    if (!isValidAdminLoanIdFilter(draftLoanId)) {
      setFilterError("Enter a valid loan reference or clear this field.");
      return;
    }
    setFilterError("");
    setState("loading");
    setQuery((current) => ({ ...current, loanId: draftLoanId.trim(), page: 1 }));
  }

  function changeStatus(status: AdminRepaymentsQuery["status"]) {
    setState("loading");
    setQuery((current) => ({ ...current, status, page: 1 }));
  }

  return <section className="admin-page">
    <header className="admin-page__header"><div><p className="admin-eyebrow">Operations</p><h1>Repayment monitoring</h1><p className="admin-muted">Inspect persisted repayment portions, installment status, allocations, and posting references.</p></div></header>
    <div className="admin-filter-bar">
      <label className="admin-form-label" htmlFor="repayment-status-filter">Repayment status<select className="admin-form-control" id="repayment-status-filter" value={query.status} onChange={(event) => changeStatus(event.target.value as AdminRepaymentsQuery["status"])}><option value="ALL">All statuses</option><option value="POSTED">Posted</option><option value="REVERSED">Reversed</option></select></label>
      <label className="admin-form-label" htmlFor="repayment-loan-filter">Loan reference<input className="admin-form-control" id="repayment-loan-filter" value={draftLoanId} onChange={(event) => setDraftLoanId(event.target.value)} placeholder="UUID" /></label>
      <Button variant="outline" onClick={applyLoanFilter}>Apply loan filter</Button>
      {query.loanId ? <Button variant="ghost" onClick={() => { setDraftLoanId(""); setState("loading"); setQuery((current) => ({ ...current, loanId: "", page: 1 })); }}>Clear</Button> : null}
      {filterError ? <span role="alert" className="admin-filter-error">{filterError}</span> : null}
    </div>
    {state === "loading" ? <LoadingState label="Loading repayment records" /> : null}
    {state === "error" ? <ErrorState title="Repayments unavailable" message={error} /> : null}
    {state === "success" && rows.length === 0 ? <EmptyState title="No repayment records found" description="Try another status or loan reference filter." /> : null}
    {state === "success" && rows.length > 0 ? <>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Repayment</th><th>Loan</th><th>Installment</th><th>Date received</th><th>Amount</th><th>Principal</th><th>Interest</th><th>Status</th><th>Ledger</th><th>Details</th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id}><td>{row.id.slice(0, 8)}</td><td>{row.loanId.slice(0, 8)}</td><td>{row.installment.installmentNumber}</td><td>{new Date(row.receivedAt).toLocaleDateString()}</td><td>{formatSatang(row.totalSatang)}</td><td>{formatSatang(row.principalSatang)}</td><td>{formatSatang(row.interestSatang)}</td><td><Badge variant={row.status === "POSTED" ? "success" : "outline"}>{row.status}</Badge></td><td><Badge variant={row.ledgerTransaction.status === "POSTED" ? "success" : "outline"}>{row.ledgerTransaction.status}</Badge></td><td><RepaymentDetailsDisclosure row={row} /></td></tr>)}
      </tbody></table></div>
      {pagination ? <nav className="admin-pagination" aria-label="Repayment pages"><span>Page {pagination.page} of {pagination.totalPages || 1} · {pagination.total} records</span><div><Button variant="outline" size="sm" disabled={query.page <= 1} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}>Previous</Button><Button variant="outline" size="sm" disabled={query.page >= pagination.totalPages} onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}>Next</Button></div></nav> : null}
    </> : null}
  </section>;
}
