"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiClientError, apiPost } from "../../lib/client/api-client";
import { formatSatang } from "../../lib/client/financial-format";
import { BORROWER_APPLICATION_TERMS } from "../../lib/client/borrower-applications";
import {
  ADMIN_APPLICATION_STATUSES,
  getAdminApplicationPath,
  getAdminApplicationReviewabilityMessage,
  isAdminApplicationReviewable,
  loadAdminApplication,
  loadAdminApplications,
  type AdminApplicationDetails,
  type AdminApplicationListItem,
  type AdminApplicationsQuery,
} from "../../lib/client/admin-applications";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { EmptyState, ErrorState, LoadingState } from "../ui/request-state";

const PAGE_SIZE = 10;
const INITIAL_QUERY: AdminApplicationsQuery = { page: 1, limit: PAGE_SIZE, status: "ALL", sortBy: "updatedAt", sortOrder: "desc" };

function statusLabel(status: string) { return status.replaceAll("_", " "); }

function satangToInput(value: string): string {
  try {
    const satang = BigInt(value);
    return `${satang / 100n}.${(satang % 100n).toString().padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function parseThbInput(value: string): string | null {
  const match = /^(0|[1-9]\d{0,7})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return (BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0")).toString();
}

export function AdminApplicationsPage() {
  const [query, setQuery] = useState(INITIAL_QUERY);
  const [rows, setRows] = useState<AdminApplicationListItem[]>([]);
  const [pagination, setPagination] = useState<{ page: number; total: number; totalPages: number } | null>(null);
  const [state, setState] = useState<"loading" | "error" | "success">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    void loadAdminApplications(query).then((response) => {
      if (!current) return;
      setRows(response.data);
      setPagination(response.pagination ? { page: response.pagination.page, total: response.pagination.total, totalPages: response.pagination.totalPages } : null);
      setState("success");
    }).catch((caught: unknown) => {
      if (!current) return;
      setError(caught instanceof ApiClientError ? caught.message : "Applications could not be loaded. Retry shortly.");
      setState("error");
    });
    return () => { current = false; };
  }, [query]);

  function updateQuery(changes: Partial<AdminApplicationsQuery>) {
    setState("loading");
    setQuery((current) => ({ ...current, ...changes, page: changes.page ?? 1 }));
  }

  return <section className="admin-page">
    <header className="admin-page__header"><div><p className="admin-eyebrow">Operations</p><h1>Borrower applications</h1><p className="admin-muted">Review submitted requests and record decisions through the administrator API.</p></div></header>
    <div className="admin-filter-bar">
      <label className="admin-form-label" htmlFor="application-status-filter">Application status
        <select className="admin-form-control" id="application-status-filter" value={query.status} onChange={(event) => updateQuery({ status: event.target.value as AdminApplicationsQuery["status"] })}>
          <option value="ALL">All statuses</option>
          {ADMIN_APPLICATION_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
        </select>
      </label>
      <label className="admin-form-label" htmlFor="application-sort">Sort by
        <select className="admin-form-control" id="application-sort" value={query.sortBy} onChange={(event) => updateQuery({ sortBy: event.target.value as AdminApplicationsQuery["sortBy"] })}>
          <option value="updatedAt">Last updated</option><option value="createdAt">Created date</option><option value="submittedAt">Submitted date</option>
        </select>
      </label>
      <p className="admin-muted" aria-live="polite">{pagination ? `${pagination.total} application${pagination.total === 1 ? "" : "s"}` : "Showing server-filtered results"}</p>
    </div>
    {state === "loading" ? <LoadingState label="Loading borrower applications" /> : null}
    {state === "error" ? <ErrorState title="Applications unavailable" message={error} /> : null}
    {state === "success" && rows.length === 0 ? <EmptyState title="No applications match these filters" description="Try a different status filter. New borrower requests will appear here." /> : null}
    {state === "success" && rows.length > 0 ? <>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Application</th><th>Borrower reference</th><th>Requested amount</th><th>Term</th><th>Status</th><th>Updated</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id}><td><Link className="admin-text-link admin-table__primary-link" href={`/admin/applications/${encodeURIComponent(row.id)}`}>{row.id.slice(0, 8)}</Link></td><td>{row.borrowerProfileId.slice(0, 8)}</td><td>{row.currentVersion ? formatSatang(row.currentVersion.requestedPrincipalSatang) : "—"}</td><td>{row.currentVersion ? `${row.currentVersion.requestedTermMonths} months` : "—"}</td><td><Badge variant={row.status === "SUBMITTED" || row.status === "UNDER_REVIEW" ? "warning" : "outline"}>{statusLabel(row.status)}</Badge></td><td>{new Date(row.updatedAt).toLocaleDateString()}</td><td><Link href={`/admin/applications/${encodeURIComponent(row.id)}`} aria-label={`Review application ${row.id}`}>Review</Link></td></tr>)}
      </tbody></table></div>
      {pagination ? <nav className="admin-pagination" aria-label="Application pages"><span>Page {pagination.page} of {pagination.totalPages || 1}</span><div><Button variant="outline" size="sm" disabled={query.page <= 1} onClick={() => updateQuery({ page: query.page - 1 })}>Previous</Button><Button variant="outline" size="sm" disabled={query.page >= pagination.totalPages} onClick={() => updateQuery({ page: query.page + 1 })}>Next</Button></div></nav> : null}
    </> : null}
  </section>;
}

export function AdminApplicationDetailPage({ applicationId }: { applicationId: string }) {
  const [application, setApplication] = useState<AdminApplicationDetails | null>(null);
  const [state, setState] = useState<"loading" | "error" | "success">("loading");
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [offerPrincipal, setOfferPrincipal] = useState("");
  const [offerTerm, setOfferTerm] = useState(String(BORROWER_APPLICATION_TERMS[0]));
  const [offerReason, setOfferReason] = useState("");
  const [offerError, setOfferError] = useState("");
  const [offerNotice, setOfferNotice] = useState("");
  const [issuingOffer, setIssuingOffer] = useState(false);
  const [currentTime, setCurrentTime] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) setCurrentTime(Date.now()); });
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    let current = true;
    void loadAdminApplication(applicationId).then((response) => {
      if (!current) return;
      setApplication(response.data);
      setOfferPrincipal(response.data.currentVersion ? satangToInput(response.data.currentVersion.requestedPrincipalSatang) : "");
      setOfferTerm(String(response.data.currentVersion?.requestedTermMonths ?? BORROWER_APPLICATION_TERMS[0]));
      setState("success");
    }).catch((caught: unknown) => {
      if (!current) return;
      setError(caught instanceof ApiClientError ? caught.message : "Application details could not be loaded.");
      setState("error");
    });
    return () => { current = false; };
  }, [applicationId]);

  async function recordDecision() {
    if (!application || !isAdminApplicationReviewable(application.status) || !reason.trim() || saving) return;
    if (!window.confirm(`Record a ${decision.toLowerCase()} decision for this application? This action will be added to the audit log.`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await apiPost<{ status: string; decision: string; decidedAt: string }, { decision: string; reason: string; notes?: string }>(
        `${getAdminApplicationPath(applicationId)}/decision`,
        { decision, reason: reason.trim(), ...(notes.trim() ? { notes: notes.trim() } : {}) },
      );
      setApplication((current) => current ? { ...current, status: response.data.status as AdminApplicationDetails["status"] } : current);
      setNotice(`Decision recorded: ${response.data.status}.`);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "The decision was not confirmed. Review the current application status before retrying.");
    } finally { setSaving(false); }
  }

  async function issueOffer() {
    if (!application || issuingOffer || !offerReason.trim()) return;
    const principalSatang = parseThbInput(offerPrincipal);
    if (!principalSatang || BigInt(principalSatang) <= 0n) {
      setOfferError("Enter a valid positive offer amount with up to two decimal places.");
      return;
    }
    const termMonths = Number(offerTerm);
    if (!BORROWER_APPLICATION_TERMS.includes(termMonths as typeof BORROWER_APPLICATION_TERMS[number])) {
      setOfferError("Choose one of the supported repayment terms.");
      return;
    }
    if (!window.confirm(`Issue an offer for ${formatSatang(principalSatang)} over ${termMonths} months? The borrower will be able to review and accept it.`)) return;
    setIssuingOffer(true);
    setOfferError("");
    setOfferNotice("");
    try {
      const response = await apiPost<Omit<AdminApplicationDetails["loanOffers"][number], "loan">, { principalSatang: string; termMonths: number; reason: string }>(
        `${getAdminApplicationPath(applicationId)}/offers`,
        { principalSatang, termMonths, reason: offerReason.trim() },
      );
      setApplication((current) => current ? { ...current, loanOffers: [{ ...response.data, loan: null }, ...current.loanOffers] } : current);
      setOfferNotice(`Offer issued. It expires ${new Date(response.data.expiresAt).toLocaleString()}.`);
      setOfferReason("");
    } catch (caught) {
      setOfferError(caught instanceof ApiClientError ? caught.message : "The offer was not confirmed. Refresh this application before retrying.");
    } finally {
      setIssuingOffer(false);
    }
  }

  if (state === "loading") return <section className="admin-page"><LoadingState label="Loading application details" /></section>;
  if (state === "error" || !application) return <section className="admin-page"><ErrorState title="Application unavailable" message={error || "The application could not be found."} /><Link href="/admin/applications">Return to applications</Link></section>;

  const reviewable = isAdminApplicationReviewable(application.status);
  const activeOffer = application.loanOffers.find((offer) => offer.status === "ISSUED" && (currentTime === null || new Date(offer.expiresAt).getTime() > currentTime));
  const acceptedOffer = application.loanOffers.some((offer) => offer.status === "ACCEPTED" || Boolean(offer.loan));
  const offerCanBeIssued = application.status === "APPROVED" && !activeOffer && !acceptedOffer;
  return <section className="admin-page">
    <header className="admin-page__header"><div><Link href="/admin/applications" className="admin-text-link">← Applications</Link><p className="admin-eyebrow">Application review</p><h1>{application.borrowerProfile.legalName}</h1><p className="admin-muted">Reference {application.id}</p></div><Badge variant={application.status === "APPROVED" ? "success" : "outline"}>{statusLabel(application.status)}</Badge></header>
    <div className="admin-detail-grid">
      <Card><CardHeader><CardTitle>Borrower</CardTitle><CardDescription>Identity returned by the administrator detail API.</CardDescription></CardHeader><CardContent><p>{application.borrowerProfile.user.email}</p><p className="admin-muted">{application.borrowerProfile.phone || "No phone supplied"}</p><p className="admin-muted">Account {application.borrowerProfile.user.accountStatus}</p></CardContent></Card>
      <Card><CardHeader><CardTitle>Requested loan</CardTitle><CardDescription>Persisted application version.</CardDescription></CardHeader><CardContent><p className="admin-metric-card__value">{application.currentVersion ? formatSatang(application.currentVersion.requestedPrincipalSatang) : "—"}</p><p className="admin-muted">{application.currentVersion ? `${application.currentVersion.requestedTermMonths} month term · version ${application.currentVersion.versionNumber}` : "No current version"}</p><p className="admin-muted">Submitted {application.submittedAt ? new Date(application.submittedAt).toLocaleString() : "Not submitted"}</p></CardContent></Card>
      <Card><CardHeader><CardTitle>Review history</CardTitle><CardDescription>Decisions and information requests from the API.</CardDescription></CardHeader><CardContent>{application.financialReviews.length ? <ul>{application.financialReviews.map((review) => <li key={review.id}><strong>{review.decision}</strong><p>{review.reason}</p><small>{new Date(review.createdAt).toLocaleString()}</small></li>)}</ul> : <p className="admin-muted">No review decisions recorded.</p>}</CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Decision</CardTitle><CardDescription>{getAdminApplicationReviewabilityMessage(application.status)}</CardDescription></CardHeader><CardContent>
      {notice ? <p role="status" className="admin-success-note">{notice}</p> : null}
      {error && notice ? <p role="alert" className="admin-danger-note">{error}</p> : null}
      {reviewable ? <div className="admin-decision-form">
        <label className="admin-form-label" htmlFor="application-decision">Decision<select id="application-decision" className="admin-form-control" value={decision} onChange={(event) => setDecision(event.target.value as "APPROVED" | "REJECTED")}><option value="APPROVED">Approve</option><option value="REJECTED">Reject</option></select></label>
        <label className="admin-form-label" htmlFor="decision-reason">Reason<input id="decision-reason" className="admin-form-control" maxLength={1000} required value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <label className="admin-form-label" htmlFor="decision-notes">Internal notes (optional)<textarea id="decision-notes" className="admin-form-control" maxLength={4000} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        {error && !notice ? <p role="alert" className="admin-danger-note">{error}</p> : null}
        <Button variant={decision === "REJECTED" ? "destructive" : "default"} disabled={!reason.trim() || saving} onClick={() => void recordDecision()}>{saving ? "Saving decision…" : `Confirm ${decision.toLowerCase()}`}</Button>
      </div> : <p className="admin-muted">No decision action is available for this status.</p>}
    </CardContent></Card>
    <Card>
      <CardHeader><CardTitle>Loan offer</CardTitle><CardDescription>Issue terms only after approving the current application. The borrower must review and accept the offer before a funding loan is created.</CardDescription></CardHeader>
      <CardContent className="grid gap-4">
        {application.loanOffers.length ? <div className="grid gap-3">
          <h2 className="text-sm font-semibold">Offer history</h2>
          {application.loanOffers.map((offer, index) => <div key={offer.id || `${application.id}-offer-${index}`} className="grid min-w-0 gap-1 rounded-lg border border-border p-3 text-sm sm:grid-cols-2">
            <p><span className="text-muted-foreground">Status:</span> {statusLabel(offer.status)}</p>
            <p><span className="text-muted-foreground">Principal:</span> {formatSatang(offer.principalSatang)}</p>
            <p><span className="text-muted-foreground">Rate:</span> {(Number(offer.annualInterestRate) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}% p.a.</p>
            <p><span className="text-muted-foreground">Term:</span> {offer.termMonths} months</p>
            <p><span className="text-muted-foreground">Expires:</span> {new Date(offer.expiresAt).toLocaleString()}</p>
            {offer.loan ? <p><span className="text-muted-foreground">Loan:</span> {offer.loan.id} ({statusLabel(offer.loan.status)})</p> : null}
          </div>)}
        </div> : null}
        {activeOffer ? <p className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm" role="status">An issued offer is awaiting the borrower’s review. It is valid until {new Date(activeOffer.expiresAt).toLocaleString()}.</p> : null}
        {acceptedOffer ? <p className="rounded-lg border border-success/25 bg-success/5 p-3 text-sm">An offer has been accepted. Follow the resulting loan from the Loans workspace.</p> : null}
        {!offerCanBeIssued && !activeOffer && !acceptedOffer ? <p className="text-sm text-muted-foreground">Approve this application first. The offer action becomes available after approval.</p> : null}
        {offerCanBeIssued ? <form className="grid gap-4 rounded-xl border border-border p-4" onSubmit={(event) => { event.preventDefault(); void issueOffer(); }}>
          <div><h2 className="font-semibold">Issue an offer to the borrower</h2><p className="mt-1 text-sm text-muted-foreground">The requested amount and term are prefilled. Confirm the approved offer terms and provide an issuance reason.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="admin-form-label" htmlFor="offer-principal">Offer principal (THB)
              <input id="offer-principal" className="admin-form-control" inputMode="decimal" autoComplete="off" maxLength={11} required value={offerPrincipal} onChange={(event) => setOfferPrincipal(event.target.value)} aria-describedby="offer-policy-note" />
            </label>
            <label className="admin-form-label" htmlFor="offer-term">Repayment term
              <select id="offer-term" className="admin-form-control" value={offerTerm} onChange={(event) => setOfferTerm(event.target.value)}>
                {BORROWER_APPLICATION_TERMS.map((term) => <option key={term} value={term}>{term} months</option>)}
              </select>
            </label>
          </div>
          <p id="offer-policy-note" className="text-sm text-muted-foreground">The active platform policies set the offer requirements, interest rate, and expiry. NEXUS checks these terms when you issue the offer.</p>
          <label className="admin-form-label" htmlFor="offer-reason">Issuance reason
            <textarea id="offer-reason" className="admin-form-control" maxLength={1000} rows={3} required value={offerReason} onChange={(event) => setOfferReason(event.target.value)} />
          </label>
          {offerError ? <p role="alert" className="admin-danger-note">{offerError}</p> : null}
          {offerNotice ? <p role="status" className="admin-success-note">{offerNotice}</p> : null}
          <div><Button type="submit" disabled={!offerReason.trim() || issuingOffer}>{issuingOffer ? "Issuing offer…" : "Issue loan offer"}</Button></div>
        </form> : null}
      </CardContent>
    </Card>
  </section>;
}
