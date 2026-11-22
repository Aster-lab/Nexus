"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "../../lib/client/api-client";
import { activateAdminEscrow, loadAdminEscrowReadiness, type AdminEscrowReadiness } from "../../lib/client/admin-escrow";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

export function AdminEscrowStatus() {
  const [readiness, setReadiness] = useState<AdminEscrowReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("Restore demo loan funding configuration");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const result = await loadAdminEscrowReadiness();
      setReadiness(result);
      setError("");
      setLoading(false);
    } catch (cause: unknown) {
      setError(cause instanceof ApiClientError ? cause.message : "Escrow funding status could not be loaded.");
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  async function confirmActivation() {
    if (busy || !reason.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await activateAdminEscrow(reason.trim());
      await refresh();
      setNotice("Escrow account and wallet are active. The wallet balance was not changed.");
      setConfirming(false);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Escrow activation could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  const canActivate = Boolean(readiness && (!readiness.account ||
    (readiness.account.accountCode === "2200" && readiness.account.accountName === "Simulated Escrow" && readiness.account.accountType === "LIABILITY" && readiness.account.currency === "THB")) &&
    (readiness.account?.walletCount ?? 0) <= 1 &&
    readiness.wallet?.status !== "CLOSED");

  return <Card>
    <CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1"><CardTitle>Loan funding escrow</CardTitle><CardDescription>Account 2200 and its shared THB wallet must be active before borrowers can accept offers. Activation never changes the wallet balance.</CardDescription></div>
        {!loading && readiness ? <Badge variant={readiness.ready ? "success" : "warning"}>{readiness.ready ? "Ready" : "Needs attention"}</Badge> : null}
      </div>
    </CardHeader>
    <CardContent className="grid gap-4">
      {loading ? <p role="status" className="text-sm text-muted-foreground">Checking escrow setup…</p> : null}
      {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">{notice}</p> : null}
      {readiness?.account ? <dl className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-3">
        <div><dt className="text-xs font-semibold uppercase text-muted-foreground">Platform account</dt><dd className="mt-1 text-sm font-medium">{readiness.account.accountCode} · {readiness.account.accountName}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-muted-foreground">Account status</dt><dd className="mt-1 text-sm">{readiness.account.status}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-muted-foreground">Escrow wallet</dt><dd className="mt-1 text-sm">{readiness.wallet ? `${readiness.wallet.status} · ${readiness.wallet.currency}` : "Not provisioned"} · {readiness.account.walletCount} wallet(s)</dd></div>
      </dl> : null}
      {readiness?.account && (readiness.account.accountName !== "Simulated Escrow" || readiness.account.accountType !== "LIABILITY" || readiness.account.currency !== "THB") ? <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">Account 2200 does not match the approved Simulated Escrow THB liability definition. Activation is blocked; review the platform account record.</p> : null}
      {!loading && !readiness?.account ? <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">Platform account 2200 is missing. Confirming activation will provision the approved THB escrow account and a zero-balance wallet.</p> : null}
      {readiness && !readiness.ready && canActivate ? <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="escrow-activation-reason">Reason for activation<input id="escrow-activation-reason" className="admin-form-control" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} /></label>
        {!confirming ? <Button type="button" disabled={busy || !reason.trim()} onClick={() => setConfirming(true)}>Review activation</Button> : null}
      </div> : null}
      {confirming ? <div className="grid gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4" role="group" aria-labelledby="escrow-activation-confirm-title">
        <h3 id="escrow-activation-confirm-title" className="font-semibold">Confirm escrow activation</h3>
        <p className="text-sm text-muted-foreground">This activates platform account 2200 and its shared wallet for loan funding. It does not add, remove, or transfer funds. The action and reason will be recorded in the audit log.</p>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button><Button type="button" disabled={busy || !reason.trim()} onClick={() => void confirmActivation()}>{busy ? "Activating…" : "Confirm activation"}</Button></div>
      </div> : null}
      {readiness?.wallet?.status === "CLOSED" ? <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">The escrow wallet is closed and cannot be reopened. Have an administrator review replacement provisioning.</p> : null}
      {readiness?.account && readiness.account.walletCount > 1 ? <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">Multiple wallets are linked to account 2200. Activation is blocked until the duplicate configuration is reviewed.</p> : null}
    </CardContent>
  </Card>;
}
