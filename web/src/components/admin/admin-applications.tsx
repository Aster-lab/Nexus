"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiClientError, apiPost } from "../../lib/client/api-client";
import { formatSatang } from "../../lib/client/financial-format";
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

  useEffect(() => {
    let current = true;
    void loadAdminApplication(applicationId).then((response) => {
      if (!current) return;
      setApplication(response.data);
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
    if (!window.confirm(`Record ${decision.toLowerCase()} for this application? This decision is persisted and audited.`)) return;
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

  if (state === "loading") return <section className="admin-page"><LoadingState label="Loading application details" /></section>;
  if (state === "error" || !application) return <section className="admin-page"><ErrorState title="Application unavailable" message={error || "The application could not be found."} /><Link href="/admin/applications">Return to applications</Link></section>;

  const reviewable = isAdminApplicationReviewable(application.status);
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
  </section>;
}
