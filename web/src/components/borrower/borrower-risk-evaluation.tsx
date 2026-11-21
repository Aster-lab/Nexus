"use client";

import { useEffect, useState } from "react";
import { ApiClientError } from "../../lib/client/api-client";
import { formatSatang, formatFinancialStatus } from "../../lib/client/financial-format";
import { getMlRequestFailureDisposition, loadBorrowerEvaluation, requestBorrowerEvaluation, type BorrowerEvaluation } from "../../lib/client/ml-features";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

const ELIGIBLE_APPLICATION_STATES = new Set(["SUBMITTED", "UNDER_REVIEW", "APPROVED"]);
function probability(value: number): string { return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value); }
function apiMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return "The prediction service could not confirm a result.";
  if (error.code === "ML_MODEL_UNAVAILABLE") return "Prediction is unavailable because no approved compatible model is active.";
  if (error.code === "ML_SERVICE_UNAVAILABLE") return "The prediction service is currently unavailable. No result was saved. You can retry when the service is available.";
  if (error.code === "ML_SERVICE_TIMEOUT") return "The prediction service timed out before saving a result. You can retry.";
  if (error.code === "NETWORK_ERROR") return "The connection ended before the result could be confirmed. Its outcome is uncertain, so avoid sending another request. Reload a saved result if you have its reference.";
  if (error.code === "INVALID_ML_RESPONSE") return "The prediction service returned an invalid response. No result was saved. You can retry later.";
  if (error.code === "FEATURE_SNAPSHOT_NOT_FOUND") return "A validated prediction input snapshot is not available for this application version.";
  if (error.code === "FEATURE_SNAPSHOT_INVALID") return "The saved prediction inputs could not be validated. No prediction is shown.";
  if (error.code === "APPLICATION_NOT_ELIGIBLE") return "The application is not currently eligible for a preliminary evaluation.";
  return error.message;
}

export function BorrowerRiskEvaluation({ applicationId, applicationStatus, principalSatang, termMonths }: { applicationId: string; applicationStatus: string; principalSatang: string; termMonths: number }) {
  const [result, setResult] = useState<BorrowerEvaluation | null>(null);
  const [evaluationId, setEvaluationId] = useState("");
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const eligible = ELIGIBLE_APPLICATION_STATES.has(applicationStatus);

  useEffect(() => {
    let active = true;
    const id = new URLSearchParams(window.location.search).get("evaluationId");
    if (id) {
      const task = window.setTimeout(() => {
        if (!active) return;
        setEvaluationId(id);
        setLoadingSaved(true);
        void loadBorrowerEvaluation(id).then((saved) => { if (active) setResult(saved); }).catch((cause: unknown) => { if (active) setError(apiMessage(cause)); }).finally(() => { if (active) setLoadingSaved(false); });
      }, 0);
      return () => { active = false; window.clearTimeout(task); };
    }
    return () => { active = false; };
  }, []);

  async function refreshSaved() {
    if (!evaluationId) return;
    setLoadingSaved(true); setError("");
    try { setResult(await loadBorrowerEvaluation(evaluationId)); }
    catch (cause) { setError(apiMessage(cause)); }
    finally { setLoadingSaved(false); }
  }

  async function evaluate() {
    if (!eligible || busy || uncertain) return;
    setBusy(true); setError(""); setRetryAvailable(false); setConfirm(false);
    try {
      const created = await requestBorrowerEvaluation(applicationId);
      setEvaluationId(created.predictionRecordId);
      window.history.replaceState(null, "", `${window.location.pathname}?${new URLSearchParams({ evaluationId: created.predictionRecordId })}`);
      try { setResult(await loadBorrowerEvaluation(created.predictionRecordId)); }
      catch (cause) { setResult(null); setError(`Prediction was created, but its saved result could not be reloaded. ${apiMessage(cause)}`); }
    } catch (cause) {
      setError(apiMessage(cause));
      if (cause instanceof ApiClientError) {
        const disposition = getMlRequestFailureDisposition(cause.code);
        if (disposition === "uncertain") setUncertain(true);
        if (disposition === "retryable") setRetryAvailable(true);
      }
    } finally { setBusy(false); }
  }

  return <Card><CardHeader><CardTitle>Preliminary risk preview</CardTitle><CardDescription>This uses the validated information already saved with your application. No prediction fields are entered or calculated in this page.</CardDescription></CardHeader><CardContent className="grid gap-4">
    <p className="text-sm text-muted-foreground">The preview is informational, may be unavailable, and is not an approval decision or a guarantee of loan terms. Confidence score is not provided by the model response.</p>
    <div className="rounded-lg bg-muted/40 p-3 text-sm"><span className="text-muted-foreground">Saved request summary: </span>{formatSatang(principalSatang)} · {termMonths} months</div>
    {loadingSaved ? <p role="status" aria-busy="true" className="h-16 animate-pulse rounded-lg bg-muted">Loading saved preview</p> : null}
    {error ? <div role="alert" className="grid justify-items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-foreground"><p>{error}</p><div className="flex flex-wrap gap-2">{retryAvailable && !uncertain ? <Button size="sm" variant="outline" disabled={busy || loadingSaved} onClick={() => setConfirm(true)}>Try again</Button> : null}{evaluationId ? <Button size="sm" variant="outline" disabled={loadingSaved} onClick={() => void refreshSaved()}>Reload last confirmed result</Button> : null}</div></div> : null}
    {uncertain ? <p role="status" className="text-sm text-muted-foreground">This application’s evaluation history cannot be listed by the current API. Keep this page open and check with an administrator before requesting again.</p> : null}
    {result ? <section aria-label={error ? "Last confirmed preliminary prediction" : "Persisted preliminary prediction"} className="grid gap-4 rounded-lg border border-border p-4">{error ? <p className="text-xs font-medium text-muted-foreground">Last confirmed preview</p> : null}<div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">Estimated default probability</p><p className="mt-1 text-2xl font-bold">{probability(result.prediction.default_probability)}</p></div><Badge variant="outline">{formatFinancialStatus(result.prediction.tier.tier_name)} · {result.prediction.tier.tier_code}</Badge></div><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Risk level</dt><dd className="mt-1 font-semibold">{formatFinancialStatus(result.prediction.tier.risk_level)}</dd></div><div><dt className="text-xs text-muted-foreground">Prediction type</dt><dd className="mt-1 font-semibold">{formatFinancialStatus(result.predictionType)}</dd></div><div><dt className="text-xs text-muted-foreground">Evaluated</dt><dd className="mt-1 font-semibold">{new Date(result.evaluatedAt).toLocaleString()}</dd></div><div><dt className="text-xs text-muted-foreground">Evaluation reference</dt><dd className="mt-1 break-all font-mono text-xs">{result.predictionRecordId}</dd></div></dl><p className="text-xs text-muted-foreground">This result is a model estimate based on saved application data. It does not guarantee approval, eligibility, or a particular interest rate.</p></section> : null}
    {!result && !error ? <Button className="w-full sm:w-fit" disabled={!eligible || busy || uncertain || loadingSaved} onClick={() => setConfirm(true)}>{uncertain ? "Result not confirmed" : busy ? "Requesting preview…" : eligible ? "Request preliminary preview" : "Available after application submission"}</Button> : null}
    {confirm ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="risk-preview-confirm-title" className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"><h2 id="risk-preview-confirm-title" className="text-lg font-semibold">Request a preliminary preview?</h2><p className="mt-2 text-sm text-muted-foreground">NEXUS will evaluate the validated snapshot already saved for application <span className="break-all font-mono">{applicationId}</span>. This is not an official loan decision. Inputs: {formatSatang(principalSatang)} for {termMonths} months.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button className="w-full sm:w-auto" variant="outline" disabled={busy} onClick={() => setConfirm(false)}>Keep reviewing</Button><Button className="w-full sm:w-auto" disabled={busy} onClick={() => void evaluate()}>{busy ? "Requesting…" : "Confirm request"}</Button></div></section></div> : null}
    {evaluationId && !result ? <p className="text-xs text-muted-foreground">The saved evaluation can be reloaded from this page link. Older predictions cannot be listed by the current API.</p> : null}
    {result ? <Button variant="outline" className="w-full sm:w-fit" disabled={busy} onClick={() => setConfirm(true)}>Request a new preview</Button> : null}
  </CardContent></Card>;
}
