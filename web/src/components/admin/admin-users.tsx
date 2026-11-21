"use client";

import { useEffect, useState } from "react";
import { ApiClientError } from "../../lib/client/api-client";
import { ADMIN_USER_STATUSES, loadAdminUsers, updateAdminUserStatus, type AdminUserRow, type AdminUserStatus, type AdminUsersQuery } from "../../lib/client/admin-users";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { EmptyState, ErrorState, LoadingState } from "../ui/request-state";

const INITIAL_QUERY: AdminUsersQuery = { page: 1, limit: 10, accountStatus: "ALL", role: "ALL", sortBy: "createdAt", sortOrder: "desc" };

export function AdminUsersPage() {
  const [query, setQuery] = useState(INITIAL_QUERY);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [pagination, setPagination] = useState<{ page: number; totalPages: number; total: number } | null>(null);
  const [state, setState] = useState<"loading" | "error" | "success">("loading");
  const [error, setError] = useState("");
  const [pendingStatus, setPendingStatus] = useState<Record<string, AdminUserStatus>>({});
  const [confirmUser, setConfirmUser] = useState<AdminUserRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let current = true;
    void loadAdminUsers(query).then((result) => {
      if (!current) return;
      setRows(result.data);
      setPagination(result.pagination ? { page: result.pagination.page, totalPages: result.pagination.totalPages, total: result.pagination.total } : null);
      setState("success");
    }).catch((caught: unknown) => {
      if (!current) return;
      setError(caught instanceof ApiClientError ? caught.message : "Users could not be loaded.");
      setState("error");
    });
    return () => { current = false; };
  }, [query]);
  function changeQuery(change: Partial<AdminUsersQuery>) { setState("loading"); setQuery((current) => ({ ...current, ...change, page: change.page ?? 1 })); }

  async function saveStatus() {
    if (!confirmUser) return;
    const status = pendingStatus[confirmUser.id];
    if (!status || status === confirmUser.accountStatus) return;
    setSaving(true); setError("");
    try {
      const result = await updateAdminUserStatus(confirmUser.id, status);
      setRows((current) => current.map((row) => row.id === result.id ? { ...row, accountStatus: result.accountStatus, updatedAt: result.updatedAt } : row));
      setNotice(`Account status updated for ${confirmUser.email}.`); setConfirmUser(null);
    } catch (caught) { setError(caught instanceof ApiClientError ? caught.message : "Account status could not be updated."); }
    finally { setSaving(false); }
  }

  return <section className="admin-page">
    <header className="admin-page__header"><div><p className="admin-eyebrow">Administration</p><h1>User management</h1><p className="admin-muted">Review account roles and update account status using supported administrator actions.</p></div></header>
    <Card><CardHeader><CardTitle>Platform users</CardTitle><CardDescription>Role assignments are displayed as recorded. This API supports account status changes only.</CardDescription></CardHeader><CardContent>
      <div className="admin-filter-bar"><label className="admin-form-label" htmlFor="admin-user-status">Account status<select id="admin-user-status" className="admin-form-control" value={query.accountStatus} onChange={(event) => changeQuery({ accountStatus: event.target.value as AdminUsersQuery["accountStatus"] })}><option value="ALL">All statuses</option>{ADMIN_USER_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><label className="admin-form-label" htmlFor="admin-user-role">Filter by role<select id="admin-user-role" className="admin-form-control" value={query.role} onChange={(event) => changeQuery({ role: event.target.value as AdminUsersQuery["role"] })}><option value="ALL">All roles</option><option value="BORROWER">Borrower</option><option value="INVESTOR">Investor</option></select></label><label className="admin-form-label" htmlFor="admin-user-sort">Sort by<select id="admin-user-sort" className="admin-form-control" value={query.sortBy} onChange={(event) => changeQuery({ sortBy: event.target.value as AdminUsersQuery["sortBy"] })}><option value="createdAt">Created date</option><option value="email">Email</option></select></label></div>
      {notice ? <p className="admin-success-message" role="status">{notice}</p> : null}{error && state !== "error" ? <p className="admin-filter-error" role="alert">{error}</p> : null}
      {state === "loading" ? <LoadingState label="Loading platform users" /> : null}{state === "error" ? <ErrorState title="User list unavailable" message={error} /> : null}{state === "success" && rows.length === 0 ? <EmptyState title="No users match these filters" description="Try another account status or role." /> : null}
      {state === "success" && rows.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Profiles</th><th>Roles</th><th>Status</th><th>Created</th><th>Account action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><span className="admin-table__strong">{row.email}</span><span className="admin-muted">{row.id}</span></td><td>{row.borrowerProfile?.legalName ?? "—"}{row.investorProfile ? <span className="admin-muted">{row.investorProfile.displayName}</span> : null}</td><td>{row.roles.map(({ role }) => <Badge key={role.code} variant="outline">{role.name}</Badge>)}</td><td><Badge variant={row.accountStatus === "ACTIVE" ? "success" : "warning"}>{row.accountStatus}</Badge></td><td>{new Date(row.createdAt).toLocaleDateString()}</td><td><label className="sr-only" htmlFor={`status-${row.id}`}>New status for {row.email}</label><div className="admin-user-status-action"><select id={`status-${row.id}`} className="admin-form-control" value={pendingStatus[row.id] ?? row.accountStatus} onChange={(event) => setPendingStatus((current) => ({ ...current, [row.id]: event.target.value as AdminUserStatus }))}>{ADMIN_USER_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><Button size="sm" variant="outline" disabled={(pendingStatus[row.id] ?? row.accountStatus) === row.accountStatus} onClick={() => setConfirmUser(row)}>Review</Button></div></td></tr>)}</tbody></table></div> : null}
      {pagination && pagination.totalPages > 1 ? <div className="admin-pagination"><span>{pagination.total} users · page {pagination.page} of {pagination.totalPages}</span><Button variant="outline" disabled={pagination.page <= 1} onClick={() => changeQuery({ page: pagination.page - 1 })}>Previous</Button><Button variant="outline" disabled={pagination.page >= pagination.totalPages} onClick={() => changeQuery({ page: pagination.page + 1 })}>Next</Button></div> : null}
    </CardContent></Card>
    {confirmUser ? <div className="admin-confirm-backdrop" role="presentation"><section className="admin-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="admin-user-confirm-title"><h2 id="admin-user-confirm-title">Confirm account status change</h2><p>Change {confirmUser.email} from {confirmUser.accountStatus} to {pendingStatus[confirmUser.id]}?</p><div><Button variant="outline" disabled={saving} onClick={() => setConfirmUser(null)}>Cancel</Button><Button disabled={saving} onClick={() => void saveStatus()}>{saving ? "Updating…" : "Confirm status change"}</Button></div></section></div> : null}
  </section>;
}
