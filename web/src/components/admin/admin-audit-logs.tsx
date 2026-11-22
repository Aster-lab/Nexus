"use client";

import { useEffect, useState } from "react";
import { ApiClientError } from "../../lib/client/api-client";
import { loadAdminAuditLogs, type AdminAuditLogRow, type AdminAuditLogsQuery } from "../../lib/client/admin-audit-logs";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { EmptyState, ErrorState, LoadingState } from "../ui/request-state";

const INITIAL_QUERY: AdminAuditLogsQuery = { page: 1, limit: 10, action: "", targetType: "", targetId: "", actorUserId: "", sortOrder: "desc" };
function renderJson(value: unknown): string { if (value === null || value === undefined) return "—"; try { return JSON.stringify(value); } catch { return "—"; } }

export function AdminAuditLogsPage() {
  const [query, setQuery] = useState(INITIAL_QUERY);
  const [draft, setDraft] = useState(INITIAL_QUERY);
  const [rows, setRows] = useState<AdminAuditLogRow[]>([]);
  const [pagination, setPagination] = useState<{ page: number; totalPages: number; total: number } | null>(null);
  const [state, setState] = useState<"loading" | "error" | "success">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    void loadAdminAuditLogs(query).then((result) => { if (!current) return; setRows(result.data); setPagination(result.pagination ? { page: result.pagination.page, totalPages: result.pagination.totalPages, total: result.pagination.total } : null); setState("success"); })
      .catch((caught: unknown) => { if (!current) return; setError(caught instanceof ApiClientError ? caught.message : "Audit logs could not be loaded."); setState("error"); });
    return () => { current = false; };
  }, [query]);

  function applyFilters(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setState("loading"); setQuery({ ...draft, page: 1 }); }

  return <section className="admin-page">
    <header className="admin-page__header"><div><p className="admin-eyebrow">Administration</p><h1>Audit logs</h1><p className="admin-muted">Review administrative and financial activity. Audit records cannot be edited.</p></div></header>
    <Card><CardHeader><CardTitle>Activity records</CardTitle><CardDescription>Use the filters below to find a specific action, account, or record.</CardDescription></CardHeader><CardContent>
      <form className="admin-audit-filters" onSubmit={applyFilters}><label className="admin-form-label" htmlFor="audit-action">Action<input id="audit-action" className="admin-form-control" value={draft.action} onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))} /></label><label className="admin-form-label" htmlFor="audit-target-type">Target type<input id="audit-target-type" className="admin-form-control" value={draft.targetType} onChange={(event) => setDraft((current) => ({ ...current, targetType: event.target.value }))} /></label><label className="admin-form-label" htmlFor="audit-target-id">Target ID<input id="audit-target-id" className="admin-form-control" value={draft.targetId} onChange={(event) => setDraft((current) => ({ ...current, targetId: event.target.value }))} /></label><label className="admin-form-label" htmlFor="audit-actor-id">Actor user ID<input id="audit-actor-id" className="admin-form-control" value={draft.actorUserId} onChange={(event) => setDraft((current) => ({ ...current, actorUserId: event.target.value }))} /></label><label className="admin-form-label" htmlFor="audit-order">Order<select id="audit-order" className="admin-form-control" value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value as AdminAuditLogsQuery["sortOrder"] }))}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label><Button type="submit">Apply filters</Button></form>
      {state === "loading" ? <LoadingState label="Loading audit logs" /> : null}{state === "error" ? <ErrorState title="Audit logs unavailable" message={error} /> : null}{state === "success" && !rows.length ? <EmptyState title="No audit events found" description="No events match the selected filters." /> : null}
      {state === "success" && rows.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[70rem]"><thead><tr><th>Event</th><th>Actor</th><th>Target</th><th>Outcome</th><th>Reason</th><th>Correlation</th><th>Timestamp</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td data-label="Event"><span className="admin-table__strong">{row.action}</span><details className="admin-row-details"><summary>Record data</summary><dl className="admin-audit-record"><dt>Previous values</dt><dd>{renderJson(row.oldValues)}</dd><dt>New values</dt><dd>{renderJson(row.newValues)}</dd></dl></details></td><td data-label="Actor">{row.actorUserId ?? "System"}</td><td data-label="Target"><span className="admin-table__strong">{row.targetType}</span>{row.targetId ?? "—"}</td><td data-label="Outcome"><Badge variant={row.outcome === "SUCCESS" ? "success" : "warning"}>{row.outcome}</Badge></td><td data-label="Reason">{row.reason ?? "—"}</td><td data-label="Correlation">{row.correlationId ?? "—"}</td><td data-label="Timestamp">{new Date(row.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div> : null}
      {pagination && pagination.totalPages > 1 ? <div className="admin-pagination"><span>{pagination.total} events · page {pagination.page} of {pagination.totalPages}</span><Button variant="outline" disabled={pagination.page <= 1} onClick={() => { setState("loading"); setQuery((current) => ({ ...current, page: current.page - 1 })); }}>Previous</Button><Button variant="outline" disabled={pagination.page >= pagination.totalPages} onClick={() => { setState("loading"); setQuery((current) => ({ ...current, page: current.page + 1 })); }}>Next</Button></div> : null}
    </CardContent></Card>
  </section>;
}
