"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "../../lib/client/api-client";
import { administerPolicyVersion, loadAdminPolicies, type AdminPolicy, type AdminPolicyVersion } from "../../lib/client/admin-policies";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { EmptyState, ErrorState, LoadingState } from "../ui/request-state";

type PendingAction = { policy: AdminPolicy; version: AdminPolicyVersion; action: "APPROVE" | "ACTIVATE" };

function prettyValues(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "Policy values are unavailable.";
}

export function AdminPoliciesPage() {
  const [policies, setPolicies] = useState<AdminPolicy[]>([]);
  const [state, setState] = useState<"loading" | "error" | "success">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await loadAdminPolicies();
      setPolicies(result);
      setError("");
      setState("success");
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Platform policies could not be loaded.");
      setState("error");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function confirmAction() {
    if (!pending) return;
    setSaving(true);
    setError("");
    try {
      await administerPolicyVersion(pending.version.id, pending.action);
      setNotice(`${pending.policy.name} version ${pending.version.versionNumber} ${pending.action === "APPROVE" ? "approved" : "activated"}.`);
      setPending(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "The policy action could not be completed.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="admin-page">
    <header className="admin-page__header"><div><p className="admin-eyebrow">Governance</p><h1>Platform policies</h1><p className="admin-muted">Review proposed rules and explicitly approve and activate the versions used by NEXUS workflows.</p></div><Button variant="outline" onClick={() => void refresh()}>Refresh policies</Button></header>
    <Card><CardHeader><CardTitle>Policy approval and activation</CardTitle><CardDescription>Only active, effective policy versions govern application and loan workflows. Every approval and activation is recorded in the administrator audit log.</CardDescription></CardHeader><CardContent>
      {notice ? <p className="admin-success-message" role="status">{notice}</p> : null}
      {error && state !== "error" ? <p className="admin-filter-error" role="alert">{error}</p> : null}
      {state === "loading" ? <LoadingState label="Loading platform policies" /> : null}
      {state === "error" ? <ErrorState title="Policies unavailable" message={error} /> : null}
      {state === "success" && policies.length === 0 ? <EmptyState title="No platform policies found" description="Seeded or administrator-proposed policies will appear here." /> : null}
      {state === "success" && policies.length > 0 ? <div className="admin-policy-list">{policies.map((policy) => <article className="admin-policy-card" key={policy.id}>
        <div className="admin-policy-card__heading"><div><h2>{policy.name}</h2><code>{policy.policyCode}</code><p>{policy.description ?? "No description provided."}</p></div><Badge variant={policy.versions.some((version) => version.status === "ACTIVE") ? "success" : "warning"}>{policy.versions.some((version) => version.status === "ACTIVE") ? "Active version exists" : "No active version"}</Badge></div>
        {policy.versions.length === 0 ? <p className="admin-muted">No versions have been proposed.</p> : <div className="admin-policy-versions">{policy.versions.map((version) => <section className="admin-policy-version" key={version.id}>
          <div className="admin-policy-version__heading"><h3>Version {version.versionNumber}</h3><Badge variant={version.status === "ACTIVE" ? "success" : version.status === "PROPOSED" || version.status === "APPROVED" ? "warning" : "outline"}>{version.status}</Badge></div>
          <dl className="admin-policy-version__meta"><div><dt>Created</dt><dd>{new Date(version.createdAt).toLocaleString()}</dd></div><div><dt>Effective</dt><dd>{version.effectiveAt ? new Date(version.effectiveAt).toLocaleString() : "Not active"}</dd></div></dl>
          <details className="admin-policy-version__values"><summary>Review policy values</summary><pre>{prettyValues(version.policyValues)}</pre></details>
          <div className="admin-policy-version__action">{version.status === "PROPOSED" ? <Button size="sm" onClick={() => setPending({ policy, version, action: "APPROVE" })}>Approve version</Button> : version.status === "APPROVED" ? <Button size="sm" onClick={() => setPending({ policy, version, action: "ACTIVATE" })}>Activate version</Button> : <span className="admin-muted">No action available</span>}</div>
        </section>)}</div>}
      </article>)}</div> : null}
    </CardContent></Card>
    {pending ? <div className="admin-confirm-backdrop" role="presentation"><section className="admin-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="policy-confirm-title"><h2 id="policy-confirm-title">Confirm policy {pending.action === "APPROVE" ? "approval" : "activation"}</h2><p>{pending.action === "APPROVE" ? "Approve" : "Activate"} {pending.policy.name} version {pending.version.versionNumber}? {pending.action === "ACTIVATE" ? "The current active version for this policy will be superseded, and this version will govern supported workflows immediately." : "Approval alone does not make this version effective."}</p>{error ? <p className="admin-danger-note" role="alert">{error}</p> : null}<div><Button variant="outline" disabled={saving} onClick={() => setPending(null)}>Cancel</Button><Button disabled={saving} onClick={() => void confirmAction()}>{saving ? "Saving…" : pending.action === "APPROVE" ? "Approve version" : "Activate version"}</Button></div></section></div> : null}
  </section>;
}
