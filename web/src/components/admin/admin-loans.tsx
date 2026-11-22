"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ApiClientError } from "../../lib/client/api-client";
import { formatSatang } from "../../lib/client/financial-format";
import { apiGet } from "../../lib/client/api-client";
import {
  ADMIN_LOAN_STATUSES,
  canAdminDisburseLoan,
  loadAdminLoan,
  loadAdminLoanFunding,
  loadAdminLoanRepayments,
  loadAdminLoans,
  requestAdminLoanDisbursement,
  type AdminLoanDetails,
  type AdminLoanFunding,
  type AdminLoanListItem,
  type AdminLoanRepayment,
  type AdminLoansQuery,
} from "../../lib/client/admin-loans";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { EmptyState, ErrorState, LoadingState } from "../ui/request-state";

const PAGE_SIZE = 10;
const INITIAL_QUERY: AdminLoansQuery = { page: 1, limit: PAGE_SIZE, status: "ALL", sortBy: "createdAt", sortOrder: "desc" };

function LoanRow({ loan }: { loan: AdminLoanListItem }) {
  return <tr>
    <td data-label="Loan"><Link className="admin-text-link admin-table__primary-link" href={`/admin/loans/${encodeURIComponent(loan.id)}`}>{loan.id.slice(0, 8)}</Link></td>
    <td data-label="Borrower">{loan.borrowerProfile.legalName}</td>
    <td data-label="Principal">{formatSatang(loan.principalSatang)}</td>
    <td data-label="Funded">{formatSatang(loan.fundedSatang)}</td>
    <td data-label="Term">{loan.termMonths} months</td>
    <td data-label="Status"><Badge variant={loan.status === "ACTIVE" ? "success" : loan.status === "FUNDING" ? "warning" : "outline"}>{loan.status}</Badge></td>
    <td data-label="Funding deadline">{loan.fundingDeadline ? new Date(loan.fundingDeadline).toLocaleDateString() : "—"}</td>
    <td data-label="Action"><Link href={`/admin/loans/${encodeURIComponent(loan.id)}`}>View</Link></td>
  </tr>;
}

export function AdminLoansPage() {
  const [query, setQuery] = useState(INITIAL_QUERY);
  const [rows, setRows] = useState<AdminLoanListItem[]>([]);
  const [pagination, setPagination] = useState<{ page: number; total: number; totalPages: number } | null>(null);
  const [state, setState] = useState<"loading" | "error" | "success">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    void loadAdminLoans(query).then((response) => {
      if (!current) return;
      setRows(response.data);
      setPagination(response.pagination ? { page: response.pagination.page, total: response.pagination.total, totalPages: response.pagination.totalPages } : null);
      setState("success");
    }).catch((caught: unknown) => {
      if (!current) return;
      setError(caught instanceof ApiClientError ? caught.message : "Loan operations could not be loaded.");
      setState("error");
    });
    return () => { current = false; };
  }, [query]);

  function updateQuery(changes: Partial<AdminLoansQuery>) { setState("loading"); setQuery((current) => ({ ...current, ...changes, page: changes.page ?? 1 })); }

  return <section className="admin-page">
    <header className="admin-page__header"><div><p className="admin-eyebrow">Operations</p><h1>Loan operations</h1><p className="admin-muted">Monitor funding, disbursement, and repayment activity.</p></div></header>
    <div className="admin-filter-bar">
      <label className="admin-form-label" htmlFor="loan-status-filter">Loan status<select className="admin-form-control" id="loan-status-filter" value={query.status} onChange={(event) => updateQuery({ status: event.target.value as AdminLoansQuery["status"] })}><option value="ALL">All statuses</option>{ADMIN_LOAN_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
      <label className="admin-form-label" htmlFor="loan-sort">Sort by<select className="admin-form-control" id="loan-sort" value={query.sortBy} onChange={(event) => updateQuery({ sortBy: event.target.value as AdminLoansQuery["sortBy"] })}><option value="createdAt">Created date</option><option value="fundingDeadline">Funding deadline</option><option value="principalSatang">Principal</option></select></label>
      <p className="admin-muted" aria-live="polite">{pagination ? `${pagination.total} loan${pagination.total === 1 ? "" : "s"}` : "Server-filtered records"}</p>
    </div>
    {state === "loading" ? <LoadingState label="Loading administrator loans" /> : null}
    {state === "error" ? <ErrorState title="Loans unavailable" message={error} /> : null}
    {state === "success" && rows.length === 0 ? <EmptyState title="No loans match these filters" description="Change the status filter to see other loan records." /> : null}
    {state === "success" && rows.length > 0 ? <>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Loan</th><th>Borrower</th><th>Principal</th><th>Funded</th><th>Term</th><th>Status</th><th>Funding deadline</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{rows.map((loan) => <LoanRow key={loan.id} loan={loan} />)}</tbody></table></div>
      {pagination ? <nav className="admin-pagination" aria-label="Loan pages"><span>Page {pagination.page} of {pagination.totalPages || 1}</span><div><Button variant="outline" size="sm" disabled={query.page <= 1} onClick={() => updateQuery({ page: query.page - 1 })}>Previous</Button><Button variant="outline" size="sm" disabled={query.page >= pagination.totalPages} onClick={() => updateQuery({ page: query.page + 1 })}>Next</Button></div></nav> : null}
    </> : null}
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="admin-detail-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function FundingContent({ funding }: { funding: AdminLoanFunding }) {
  return <>
    <div className="admin-detail-metrics">
      <Metric label="Funded" value={formatSatang(funding.fundedSatang)} />
      <Metric label="Remaining to fund" value={formatSatang(funding.remainingFundingSatang)} />
      <Metric label="Escrow held" value={formatSatang(funding.escrow?.heldSatang ?? "0")} />
    </div>
    <p className="admin-muted">Escrow status: {funding.escrow?.status ?? "Not configured"}</p>
    {funding.escrow?.transactions.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Funding event</th><th>Amount</th><th>Ledger reference</th><th>Recorded</th></tr></thead><tbody>{funding.escrow.transactions.map((transaction) => <tr key={transaction.id}><td>{transaction.type}</td><td>{formatSatang(transaction.amountSatang)}</td><td>{transaction.ledgerTransactionId}</td><td>{new Date(transaction.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div> : <p className="admin-muted">No escrow transactions are recorded.</p>}
  </>;
}

function RepaymentActivity({ rows }: { rows: AdminLoanRepayment[] }) {
  if (!rows.length) return <EmptyState title="No repayments recorded" description="Repayment activity will appear after the borrower makes a payment." />;
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Installment</th><th>Due date</th><th>Received</th><th>Principal</th><th>Interest</th><th>Total</th><th>Repayment</th><th>Ledger</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.installment.installmentNumber}</td><td>{new Date(row.installment.dueDate).toLocaleDateString()}</td><td>{new Date(row.receivedAt).toLocaleDateString()}</td><td>{formatSatang(row.principalSatang)}</td><td>{formatSatang(row.interestSatang)}</td><td>{formatSatang(row.totalSatang)}</td><td><Badge variant={row.status === "POSTED" ? "success" : "outline"}>{row.status}</Badge></td><td><Badge variant={row.ledgerTransaction.status === "POSTED" ? "success" : "outline"}>{row.ledgerTransaction.status}</Badge></td></tr>)}</tbody></table></div>;
}

export function AdminLoanDetailPage({ loanId }: { loanId: string }) {
  const [loan, setLoan] = useState<AdminLoanDetails | null>(null);
  const [loanState, setLoanState] = useState<"loading" | "error" | "success">("loading");
  const [loanError, setLoanError] = useState("");
  const [funding, setFunding] = useState<AdminLoanFunding | null>(null);
  const [fundingState, setFundingState] = useState<"loading" | "error" | "success">("loading");
  const [fundingError, setFundingError] = useState("");
  const [repayments, setRepayments] = useState<AdminLoanRepayment[]>([]);
  const [repaymentState, setRepaymentState] = useState<"loading" | "error" | "success">("loading");
  const [repaymentError, setRepaymentError] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    let current = true;
    void loadAdminLoan(loanId).then((response) => { if (current) { setLoan(response.data); setLoanState("success"); } })
      .catch((error: unknown) => { if (current) { setLoanError(error instanceof ApiClientError ? error.message : "Loan details could not be loaded."); setLoanState("error"); } });
    void loadAdminLoanFunding(loanId).then((response) => { if (current) { setFunding(response.data); setFundingState("success"); } })
      .catch((error: unknown) => { if (current) { setFundingError(error instanceof ApiClientError ? error.message : "Funding details could not be loaded."); setFundingState("error"); } });
    void loadAdminLoanRepayments(loanId, apiGet).then((response) => { if (current) { setRepayments(response.data); setRepaymentState("success"); } })
      .catch((error: unknown) => { if (current) { setRepaymentError(error instanceof ApiClientError ? error.message : "Repayment activity could not be loaded."); setRepaymentState("error"); } });
    return () => { current = false; };
  }, [loanId]);

  async function refreshLoanDetails() {
    setLoanState("loading");
    setLoanError("");
    try {
      const response = await loadAdminLoan(loanId);
      setLoan(response.data);
      setLoanState("success");
    } catch (error) {
      setLoanError(error instanceof ApiClientError ? error.message : "Loan details could not be refreshed.");
      setLoanState("error");
    }
  }

  async function disburse() {
    if (!loan || !canAdminDisburseLoan(loan.status, loan.disbursementConsentAt) || !reason.trim() || submitting) return;
    if (!window.confirm("Submit this disbursement for posting? The backend will recheck loan eligibility and record the result.")) return;
    setSubmitting(true);
    setConfirmation("");
    setLoanError("");
    try {
      idempotencyKey.current ??= `admin-disburse-${loan.id}-${crypto.randomUUID()}`;
      const result = await requestAdminLoanDisbursement(loan.id, reason.trim(), idempotencyKey.current);
      setConfirmation(`Disbursement ${result.data.status}. Ledger transaction ${result.data.ledgerTransactionId}.`);
      idempotencyKey.current = null;
      const [loanResult, fundingResult, repaymentResult] = await Promise.allSettled([
        loadAdminLoan(loanId), loadAdminLoanFunding(loanId), loadAdminLoanRepayments(loanId, apiGet),
      ]);
      if (loanResult.status === "fulfilled") setLoan(loanResult.value.data);
      else setLoanError("Disbursement posted, but the loan summary could not be refreshed.");
      if (fundingResult.status === "fulfilled") setFunding(fundingResult.value.data);
      if (repaymentResult.status === "fulfilled") setRepayments(repaymentResult.value.data);
    } catch (error) {
      setLoanError(error instanceof ApiClientError ? error.message : "The disbursement result is unconfirmed. Check the loan before retrying.");
    } finally { setSubmitting(false); }
  }

  if (loanState === "loading") return <section className="admin-page"><LoadingState label="Loading loan details" /></section>;
  if (loanState === "error" || !loan) return <section className="admin-page"><ErrorState title="Loan unavailable" message={loanError || "The loan could not be found."} /><Link href="/admin/loans">Return to loans</Link></section>;

  return <section className="admin-page">
    <header className="admin-page__header"><div><Link className="admin-text-link" href="/admin/loans">← Loans</Link><p className="admin-eyebrow">Loan operations</p><h1>{loan.borrowerProfile.legalName}</h1><p className="admin-muted">Loan reference {loan.id}</p></div><div className="flex items-center gap-3"><Badge variant={loan.status === "ACTIVE" ? "success" : "outline"}>{loan.status}</Badge><Button variant="outline" size="sm" onClick={() => void refreshLoanDetails()}>Refresh status</Button></div></header>
    <div className="admin-detail-grid">
      <Card><CardHeader><CardTitle>Loan summary</CardTitle><CardDescription>Persisted loan terms and borrower reference.</CardDescription></CardHeader><CardContent><div className="admin-detail-metrics"><Metric label="Principal" value={formatSatang(loan.principalSatang)} /><Metric label="Funded" value={formatSatang(loan.fundedSatang)} /><Metric label="Annual rate" value={`${(Number(loan.annualInterestRate) * 100).toFixed(2)}%`} /><Metric label="Term" value={`${loan.termMonths} months`} /></div><p className="admin-muted">Borrower {loan.borrowerProfile.user.email}</p><p className="admin-muted">Disbursed {loan.disbursedAt ? new Date(loan.disbursedAt).toLocaleString() : "Not disbursed"}</p></CardContent></Card>
      <Card><CardHeader><CardTitle>Status history</CardTitle><CardDescription>Backend-recorded status changes.</CardDescription></CardHeader><CardContent>{loan.statusHistory.length ? <ol className="admin-history-list">{loan.statusHistory.map((item, index) => <li key={`${item.createdAt}-${index}`}><strong>{item.previousStatus ?? "Created"} → {item.newStatus}</strong><p>{item.reason}</p><small>{new Date(item.createdAt).toLocaleString()}</small></li>)}</ol> : <p className="admin-muted">No status history returned.</p>}</CardContent></Card>
      {loan.status === "FUNDED" ? <Card><CardHeader><CardTitle>Disbursement</CardTitle><CardDescription>The borrower must confirm release before an administrator can post the simulated wallet credit.</CardDescription></CardHeader><CardContent>{loan.disbursementConsentAt ? <><p className="admin-success-note" role="status">Borrower confirmation recorded {new Date(loan.disbursementConsentAt).toLocaleString()}.</p><label className="admin-form-label" htmlFor="disbursement-reason">Reason<input className="admin-form-control" id="disbursement-reason" maxLength={1000} required value={reason} onChange={(event) => setReason(event.target.value)} /></label>{loanError ? <p className="admin-danger-note" role="alert">{loanError}</p> : null}{confirmation ? <p className="admin-success-note" role="status">{confirmation}</p> : null}<Button className="admin-action-button" disabled={!canAdminDisburseLoan(loan.status, loan.disbursementConsentAt) || !reason.trim() || submitting} onClick={() => void disburse()}>{submitting ? "Submitting…" : "Confirm disbursement"}</Button></> : <p className="admin-muted" role="status">Waiting for the borrower to confirm disbursement in their loan details.</p>}</CardContent></Card> : null}
    </div>
    <Card><CardHeader><CardTitle>Funding and escrow</CardTitle><CardDescription>Funding transaction details returned by the administrator API.</CardDescription></CardHeader><CardContent>{fundingState === "loading" ? <LoadingState label="Loading funding details" /> : null}{fundingState === "error" ? <ErrorState title="Funding details unavailable" message={fundingError} /> : null}{fundingState === "success" && funding ? <FundingContent funding={funding} /> : null}</CardContent></Card>
    <Card><CardHeader><CardTitle>Repayment and installment activity</CardTitle><CardDescription>Latest persisted repayment rows, installment states, and linked ledger status.</CardDescription></CardHeader><CardContent>{repaymentState === "loading" ? <LoadingState label="Loading repayment activity" /> : null}{repaymentState === "error" ? <ErrorState title="Repayment activity unavailable" message={repaymentError} /> : null}{repaymentState === "success" ? <RepaymentActivity rows={repayments} /> : null}</CardContent></Card>
  </section>;
}
