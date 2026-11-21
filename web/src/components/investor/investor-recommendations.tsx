"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ApiClientError } from "../../lib/client/api-client";
import { formatSatang, formatFinancialStatus } from "../../lib/client/financial-format";
import { getInvestorRecommendationsPath, getMlRequestFailureDisposition, loadInvestorPreferences, loadInvestorRecommendations, requestInvestorRecommendations, saveInvestorPreferences, type InvestorPreferences, type RecommendationRun } from "../../lib/client/ml-features";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

const RISK_TIERS: InvestorPreferences["risk_tier"] = ["TIER_A", "TIER_B", "TIER_C", "TIER_D"];
const PURPOSES: InvestorPreferences["loan_purpose"] = ["business", "education", "medical", "personal", "home", "other"];
type PreferencesDraft = Omit<InvestorPreferences, "schema_version" | "interest_rate" | "loan_duration" | "investment_amount"> & {
  interest_rate: { min: string; max: string };
  loan_duration: { min: string; max: string };
  investment_amount: { min: string; max: string };
};
const EMPTY_DRAFT: PreferencesDraft = { risk_tier: [], interest_rate: { min: "", max: "" }, loan_duration: { min: "", max: "" }, investment_amount: { min: "", max: "" }, loan_purpose: [] };
const SCORE_LABELS = [
  ["risk_tier", "Risk profile compatibility"],
  ["interest_rate", "Interest rate match"],
  ["loan_duration", "Loan term match"],
  ["loan_amount", "Investment amount fit"],
  ["loan_purpose", "Loan purpose match"],
] as const;

function percent(value: number): string { return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value); }
function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function apiMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiClientError)) return fallback;
  if (error.code === "ML_SERVICE_TIMEOUT") return "The recommendation service timed out before saving a run. You can retry.";
  if (error.code === "ML_SERVICE_UNAVAILABLE") return "The recommendation service is unavailable. No run was saved. You can retry when it is available.";
  if (error.code === "INVALID_ML_RESPONSE") return "The recommendation service returned an invalid response. No run was saved. You can retry later.";
  if (error.code === "NETWORK_ERROR") return "The connection ended before the result could be confirmed. The request may still have completed. Reload saved results before taking another action.";
  return error.message;
}

export function InvestorRecommendationsPage() {
  const [preferences, setPreferences] = useState<InvestorPreferences | null>(null);
  const [draft, setDraft] = useState<PreferencesDraft>(EMPTY_DRAFT);
  const [preferencesState, setPreferencesState] = useState<"loading" | "ready" | "error">("loading");
  const [preferencesError, setPreferencesError] = useState("");
  const [preferencesNotice, setPreferencesNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [run, setRun] = useState<RecommendationRun | null>(null);
  const [recommendationState, setRecommendationState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [recommendationError, setRecommendationError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [recommendationRetryAvailable, setRecommendationRetryAvailable] = useState(false);
  const [recommendationUncertain, setRecommendationUncertain] = useState(false);

  useEffect(() => {
    let active = true;
    void loadInvestorPreferences().then((result) => {
      if (!active) return;
      setPreferences(result.preferences);
      if (result.preferences) setDraft({ risk_tier: result.preferences.risk_tier, interest_rate: { min: String(result.preferences.interest_rate.min), max: String(result.preferences.interest_rate.max) }, loan_duration: { min: String(result.preferences.loan_duration.min), max: String(result.preferences.loan_duration.max) }, investment_amount: { min: String(result.preferences.investment_amount.min), max: String(result.preferences.investment_amount.max) }, loan_purpose: result.preferences.loan_purpose });
      setPreferencesState("ready");
    }).catch((error: unknown) => { if (!active) return; setPreferencesError(apiMessage(error, "Preferences could not be loaded.")); setPreferencesState("error"); });
    const runId = typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get("runId") ?? undefined;
    void loadInvestorRecommendations(runId).then((result) => {
      if (!active) return;
      setRun(result);
      setRecommendationState(result.recommendations.length ? "ready" : "empty");
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof ApiClientError && error.status === 404 && error.code === "NOT_FOUND") { setRecommendationState("empty"); return; }
      setRecommendationError(apiMessage(error, "Recommendations are unavailable."));
      setRecommendationState("error");
    });
    return () => { active = false; };
  }, []);

  function setRange<K extends "interest_rate" | "loan_duration" | "investment_amount">(key: K, field: "min" | "max", value: string) {
    setDraft((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
  }
  function toggleRisk(tier: InvestorPreferences["risk_tier"][number]) { setDraft((current) => ({ ...current, risk_tier: current.risk_tier.includes(tier) ? current.risk_tier.filter((value) => value !== tier) : [...current.risk_tier, tier] })); }
  function togglePurpose(purpose: InvestorPreferences["loan_purpose"][number]) { setDraft((current) => ({ ...current, loan_purpose: current.loan_purpose.includes(purpose) ? current.loan_purpose.filter((value) => value !== purpose) : [...current.loan_purpose, purpose] })); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rangeValues = [draft.interest_rate, draft.loan_duration, draft.investment_amount].map(({ min, max }) => ({ min: Number(min), max: Number(max), valid: min.trim() !== "" && max.trim() !== "" && Number.isFinite(Number(min)) && Number.isFinite(Number(max)) }));
    if (!draft.risk_tier.length || !draft.loan_purpose.length || rangeValues.some((range) => !range.valid || range.min > range.max)) {
      setPreferencesError("Choose at least one risk tier and purpose, enter both ends of each range, and keep each minimum no greater than its maximum.");
      return;
    }
    setSaving(true); setPreferencesError(""); setPreferencesNotice("");
    try {
      const result = await saveInvestorPreferences({ schema_version: "nexus_investor_preference.v1", risk_tier: draft.risk_tier, loan_purpose: draft.loan_purpose, interest_rate: rangeValues[0], loan_duration: rangeValues[1], investment_amount: rangeValues[2] });
      setPreferences(result.preferences); setPreferencesNotice("Your recommendation preferences are saved.");
    } catch (error) { setPreferencesError(apiMessage(error, "Preferences could not be saved.")); }
    finally { setSaving(false); }
  }

  async function refreshLatest() {
    setRefreshing(true); setRecommendationError("");
    try {
      const runId = typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get("runId") ?? undefined;
      const result = await loadInvestorRecommendations(runId);
      setRun(result); setRecommendationState(result.recommendations.length ? "ready" : "empty");
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404 && error.code === "NOT_FOUND") { setRun(null); setRecommendationState("empty"); }
      else { setRecommendationError(apiMessage(error, "Saved recommendations could not be loaded.")); setRecommendationState("error"); }
    } finally { setRefreshing(false); }
  }

  async function getRecommendations() {
    if (!preferences || requesting || recommendationUncertain) return;
    setRequesting(true); setRecommendationError(""); setRecommendationRetryAvailable(false);
    try {
      const result = await requestInvestorRecommendations();
      setRun(result); setRecommendationState(result.recommendations.length ? "ready" : "empty");
      setRecommendationUncertain(false);
      window.history.replaceState(null, "", `${window.location.pathname}?${new URLSearchParams({ runId: result.recommendationRunId })}`);
    } catch (error) {
      setRecommendationError(apiMessage(error, "Recommendations could not be generated. No result is shown unless the backend confirms a saved run."));
      if (error instanceof ApiClientError) {
        const disposition = getMlRequestFailureDisposition(error.code);
        if (disposition === "uncertain") setRecommendationUncertain(true);
        if (disposition === "retryable") setRecommendationRetryAvailable(true);
      }
      setRecommendationState("error");
    }
    finally { setRequesting(false); }
  }

  return <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-9">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-primary">Investor workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Loan recommendations</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Review a ranked shortlist based on your saved preferences and loans currently available for funding.</p></div><Link href="/investor/marketplace" className={`${buttonVariants({ variant: "outline" })} w-full sm:w-fit`}>Browse all eligible loans</Link></header>
    <Card><CardHeader><CardTitle>Investor preferences</CardTitle><CardDescription>These settings shape recommendation matching. They do not change investment eligibility or guarantee a return.</CardDescription></CardHeader><CardContent>
      {preferencesState === "loading" ? <div role="status" aria-busy="true" aria-label="Loading investor preferences" className="h-40 animate-pulse rounded-lg bg-muted"/> : null}
      {preferencesState === "error" ? <div role="alert" className="grid justify-items-start gap-3 text-sm text-destructive"><p>{preferencesError}</p><Button variant="outline" onClick={() => { setPreferencesState("loading"); void loadInvestorPreferences().then((result) => { setPreferences(result.preferences); if (result.preferences) setDraft({ risk_tier: result.preferences.risk_tier, interest_rate: { min: String(result.preferences.interest_rate.min), max: String(result.preferences.interest_rate.max) }, loan_duration: { min: String(result.preferences.loan_duration.min), max: String(result.preferences.loan_duration.max) }, investment_amount: { min: String(result.preferences.investment_amount.min), max: String(result.preferences.investment_amount.max) }, loan_purpose: result.preferences.loan_purpose }); setPreferencesState("ready"); }).catch((error: unknown) => { setPreferencesError(apiMessage(error, "Preferences could not be loaded.")); setPreferencesState("error"); }); }}>Retry preference load</Button></div> : null}
      {preferencesState === "ready" ? <form className="grid gap-5" onSubmit={save}>
        <fieldset className="grid gap-2"><legend className="text-sm font-medium">Preferred risk tiers</legend><div className="flex flex-wrap gap-3">{RISK_TIERS.map((tier) => <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm" key={tier}><input type="checkbox" checked={draft.risk_tier.includes(tier)} onChange={() => toggleRisk(tier)}/>{tier}</label>)}</div></fieldset>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RangeFields id="interest-range" label="Annual interest rate (%)" value={draft.interest_rate} onChange={(field, value) => setRange("interest_rate", field, value)}/>
          <RangeFields id="duration-range" label="Loan duration (months)" value={draft.loan_duration} onChange={(field, value) => setRange("loan_duration", field, value)}/>
          <RangeFields id="amount-range" label="Investment amount (THB)" value={draft.investment_amount} onChange={(field, value) => setRange("investment_amount", field, value)}/>
        </div>
        <fieldset className="grid gap-2"><legend className="text-sm font-medium">Loan purposes</legend><div className="flex flex-wrap gap-3">{PURPOSES.map((purpose) => <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm capitalize" key={purpose}><input type="checkbox" checked={draft.loan_purpose.includes(purpose)} onChange={() => togglePurpose(purpose)}/>{purpose}</label>)}</div></fieldset>
        {preferencesError ? <p role="alert" className="text-sm text-destructive">{preferencesError}</p> : null}{preferencesNotice ? <p role="status" className="text-sm text-success">{preferencesNotice}</p> : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap"><Button className="w-full sm:w-fit" type="submit" disabled={saving}>{saving ? "Saving…" : preferences ? "Save preferences" : "Save preferences to continue"}</Button><Button className="w-full sm:w-fit" type="button" variant="outline" disabled={!preferences || requesting || recommendationUncertain} onClick={() => void getRecommendations()}>{requesting ? "Requesting…" : recommendationUncertain ? "Request outcome uncertain" : "Get recommendations"}</Button></div>
      </form> : null}
    </CardContent></Card>
    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Ranked loans</CardTitle><CardDescription>The match score shows preference similarity, not default probability, confidence, or expected return.</CardDescription></div><Button variant="outline" disabled={refreshing || recommendationState === "loading"} onClick={() => void refreshLatest()}>{refreshing ? "Refreshing…" : "Reload saved results"}</Button></div></CardHeader><CardContent className="grid gap-4">
      {recommendationState === "loading" ? <div role="status" aria-busy="true" aria-label="Loading recommendations" className="h-40 animate-pulse rounded-lg bg-muted"/> : null}
      {recommendationState === "error" ? <div role="alert" className="grid justify-items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><p>{recommendationError}</p>{recommendationRetryAvailable && !recommendationUncertain ? <Button variant="outline" disabled={requesting || refreshing} onClick={() => void getRecommendations()}>Try again</Button> : null}</div> : null}
      {recommendationUncertain ? <p role="status" className="text-sm text-muted-foreground">Reload saved results to check whether the request completed. The current API exposes the latest run but cannot identify a request by a client reference, so another request stays disabled while its outcome is uncertain.</p> : null}
      {recommendationState === "empty" ? <div className="rounded-lg border border-dashed border-border p-5"><h2 className="font-medium">{run ? "No current matches" : "No saved recommendations yet"}</h2><p className="mt-1 text-sm text-muted-foreground">{run ? "No currently eligible funding loans were returned for this saved run." : preferences ? "Request recommendations to create a ranked result from your saved preferences." : "Save your preferences before requesting recommendations."}</p></div> : null}
      {run?.isStale ? <p role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">Some loans from this saved run are no longer available for funding and have been omitted.</p> : null}
      {recommendationState === "ready" && run ? <><p className="text-xs text-muted-foreground">Saved {formatDate(run.createdAt)} · {run.recommendations.length} eligible loan matches</p><ol className="grid gap-4">{run.recommendations.map((item) => <li key={item.recommendationId ?? `${run.recommendationRunId}-${item.loanId}`}><Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardDescription>Rank {item.rankingPosition} · Match score</CardDescription><CardTitle className="mt-1 break-all text-base">Loan {item.loanId}</CardTitle></div><Badge variant="outline">{percent(Number(item.score))}</Badge></div></CardHeader><CardContent className="grid gap-4"><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Principal" value={formatSatang(item.loan.principalSatang)}/><Metric label="Remaining funding" value={formatSatang(item.loan.remainingFundingSatang)}/><Metric label="Annual interest rate" value={percent(Number(item.loan.annualInterestRate))}/><Metric label="Term" value={`${item.loan.termMonths} months`}/>{item.loan.loanPurpose ? <Metric label="Purpose" value={formatFinancialStatus(item.loan.loanPurpose)}/> : null}{item.loan.riskTier ? <Metric label="Risk tier" value={item.loan.riskTier}/> : null}</dl><details className="rounded-md border border-border p-3"><summary className="cursor-pointer text-sm font-medium">How this match was scored</summary><dl className="mt-3 grid gap-2 sm:grid-cols-2">{SCORE_LABELS.map(([key, label]) => <Metric key={key} label={label} value={percent(item.explanation.feature_scores[key])}/>)}</dl></details><p className="text-xs text-muted-foreground">Rankings are informational only. Review full loan terms; investing is a separate decision and remains subject to backend eligibility checks.</p><Link className={buttonVariants({ variant: "outline" })} href={`/investor/marketplace/${encodeURIComponent(item.loanId)}`}>Review loan details</Link></CardContent></Card></li>)}</ol></> : null}
    </CardContent></Card>
  </main>;
}

function RangeFields({ id, label, value, onChange }: { id: string; label: string; value: { min: string; max: string }; onChange: (field: "min" | "max", value: string) => void }) {
  return <fieldset className="grid gap-2"><legend className="text-sm font-medium">{label}</legend><div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-xs text-muted-foreground" htmlFor={`${id}-min`}>Minimum<input id={`${id}-min`} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground" type="number" min="0" step="any" required value={value.min} onChange={(event) => onChange("min", event.target.value)}/></label><label className="grid gap-1 text-xs text-muted-foreground" htmlFor={`${id}-max`}>Maximum<input id={`${id}-max`} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground" type="number" min="0" step="any" required value={value.max} onChange={(event) => onChange("max", event.target.value)}/></label></div></fieldset>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd></div>; }
