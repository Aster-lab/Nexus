"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "../../lib/client/api-client";
import { activateAdminRepaymentClearing, loadAdminRepaymentClearingReadiness, type AdminRepaymentClearingReadiness } from "../../lib/client/admin-repayment-clearing";
import { formatSatang } from "../../lib/client/financial-format";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

export function AdminRepaymentClearingStatus({ onActivated }: { onActivated?: () => void }) {
  const [readiness, setReadiness] = useState<AdminRepaymentClearingReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("Restore demo repayment clearing configuration");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const result = await loadAdminRepaymentClearingReadiness();
      setReadiness(result);
      setError("");
      setLoading(false);
    } catch (cause: unknown) {
      setError(cause instanceof ApiClientError ? cause.message : "Repayment Clearing readiness could not be loaded.");
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
      await activateAdminRepaymentClearing(reason.trim());
      await refresh();
      setNotice("Repayment Clearing is ready. The existing wallet balance was preserved; a newly provisioned wallet starts at zero.");
      setConfirming(false);
      onActivated?.();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Repayment Clearing activation could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  const canActivate = Boolean(readiness && (!readiness.account ||
    (readiness.account.accountCode === "2300" && readiness.account.accountName === "Repayment Clearing" && readiness.account.accountType === "LIABILITY" && readiness.account.currency === "THB")) &&
    readiness.wallet?.status !== "CLOSED");

  return <Card>
    <CardHeader><div className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid gap-1"><CardTitle>Repayment Clearing</CardTitle><CardDescription>Account 2300 and one shared THB wallet receive borrower repayments and fund completed investor payouts. Activation does not move money.</CardDescription></div>
      {!loading && readiness ? <Badge variant={readiness.ready ? "success" : "warning"}>{readiness.ready ? "Ready" : "Needs attention"}</Badge> : null}
    </div></CardHeader>
    <CardContent className="grid gap-4">
      {loading ? <p role="status" className="text-sm text-muted-foreground">Checking clearing account setup…</p> : null}
      {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">{notice}</p> : null}
      {readiness?.account ? <dl className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-3">
        <div><dt className="text-xs font-semibold uppercase text-muted-foreground">Platform account</dt><dd className="mt-1 text-sm font-medium">{readiness.account.accountCode} · {readiness.account.accountName}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-muted-foreground">Account status</dt><dd className="mt-1 text-sm">{readiness.account.status} · {readiness.account.accountType} · {readiness.account.currency}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-muted-foreground">Clearing wallet</dt><dd className="mt-1 text-sm">{readiness.wallet ? `${readiness.wallet.status} · ${readiness.wallet.currency} · ${formatSatang(readiness.wallet.balanceSatang)}` : "Not provisioned"} · {readiness.account.walletCount} wallet(s)</dd></div>
      </dl> : null}
      {!loading && !readiness?.account ? <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">Account 2300 is missing. Activation will create the approved THB liability account and a zero-balance platform wallet.</p> : null}
      {readiness?.account && (readiness.account.accountName !== "Repayment Clearing" || readiness.account.accountType !== "LIABILITY" || readiness.account.currency !== "THB") ? <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">Account 2300 does not match the approved Repayment Clearing THB liability definition. Activation is blocked; review the platform account record.</p> : null}
      {readiness && !readiness.ready && canActivate ? <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="clearing-activation-reason">Reason for activation<input id="clearing-activation-reason" className="admin-form-control" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} /></label>
        {!confirming ? <Button type="button" disabled={busy || !reason.trim()} onClick={() => setConfirming(true)}>Review activation</Button> : null}
      </div> : null}
      {confirming ? <div className="grid gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4" role="group" aria-labelledby="clearing-activation-confirm-title">
        <h3 id="clearing-activation-confirm-title" className="font-semibold">Confirm Repayment Clearing activation</h3>
        <p className="text-sm text-muted-foreground">This activates account 2300 and its platform wallet. It does not add, remove, or transfer funds; an absent wallet will be provisioned with a zero balance. The action and reason will be recorded in the audit log.</p>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button><Button type="button" disabled={busy || !reason.trim()} onClick={() => void confirmActivation()}>{busy ? "Activating…" : "Confirm activation"}</Button></div>
      </div> : null}
      {readiness?.wallet?.status === "CLOSED" ? <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">The clearing wallet is closed and cannot be reactivated. Have an administrator review replacement provisioning.</p> : null}
      {readiness?.account && readiness.account.walletCount > 1 ? <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">Multiple wallets are linked to account 2300. Activation is blocked until the duplicate configuration is reviewed.</p> : null}
    </CardContent>
  </Card>;
}
