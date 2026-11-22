"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, FileText, LoaderCircle, PencilLine, Send } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { formatDashboardDate, formatDashboardStatus, formatSatang, notifyBorrowerDashboardMutationComplete } from "../../lib/client/borrower-dashboard";
import {
  buildBorrowerApplicationSnapshot,
  getApplicationErrorMessage,
  loadBorrowerApplication,
  submitBorrowerApplicationRequest,
  updateBorrowerApplication,
  type BorrowerApplicationDetails,
  type BorrowerApplicationFormValues,
} from "../../lib/client/borrower-applications";
import { BorrowerRiskEvaluation } from "./borrower-risk-evaluation";
import { BORROWER_COMPANY_TYPES } from "../../lib/contracts/application";

const COMPANY_TYPE_LABELS: Record<typeof BORROWER_COMPANY_TYPES[number], string> = {
  SOLE_PROPRIETORSHIP: "Sole proprietorship",
  PARTNERSHIP: "Partnership",
  PRIVATE_LIMITED_COMPANY: "Private limited company",
  PUBLIC_LIMITED_COMPANY: "Public limited company",
  COOPERATIVE: "Cooperative or community enterprise",
  OTHER: "Other",
};

const fieldClass = "h-11 w-full rounded-md border border-border bg-background px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

function formFromApplication(application: BorrowerApplicationDetails): BorrowerApplicationFormValues | null {
  const snapshot = application.currentVersion?.submittedData;
  if (!snapshot) return null;
  const { borrower, employment, requested_loan: loan } = snapshot;
  const amount = BigInt(loan.amount_satang);
  return {
    legalName: borrower.legal_name,
    phone: borrower.phone ?? "",
    addressLine1: borrower.address.line1,
    addressLine2: borrower.address.line2 ?? "",
    subdistrict: borrower.address.subdistrict ?? "",
    district: borrower.address.district ?? "",
    province: borrower.address.province ?? "",
    postalCode: borrower.address.postal_code ?? "",
    countryCode: borrower.address.country_code ?? "",
    employmentStatus: employment.employment_status,
    employerName: employment.employer_name ?? "",
    occupation: employment.occupation ?? "",
    monthsInRole: employment.months_in_role === null ? "" : String(employment.months_in_role),
    companyName: employment.company_name ?? "",
    companyType: employment.company_type ?? "",
    amountBaht: `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`,
    termMonths: String(loan.term_months),
    purpose: loan.purpose,
  };
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-foreground">{children || "—"}</dd></div>;
}

export function BorrowerApplicationDetailsPage({ applicationId }: { applicationId: string }) {
  const [application, setApplication] = useState<BorrowerApplicationDetails | null>(null);
  const [values, setValues] = useState<BorrowerApplicationFormValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await loadBorrowerApplication(applicationId);
      setApplication(response.data);
      setValues(formFromApplication(response.data));
      setError(null);
    } catch (cause) {
      setError(getApplicationErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  async function saveChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values || !application?.permissions.canEdit) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await updateBorrowerApplication(application.id, buildBorrowerApplicationSnapshot(values));
      await refresh();
      setEditing(false);
      setNotice("Your changes have been saved.");
      notifyBorrowerDashboardMutationComplete();
    } catch (cause) {
      const message = getApplicationErrorMessage(cause);
      await refresh();
      setError(message);
    } finally { setBusy(false); }
  }

  async function submitApplication() {
    if (!application?.permissions.canSubmit) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await submitBorrowerApplicationRequest(application.id);
      await refresh();
      setConfirmSubmit(false);
      setNotice("Your application was submitted.");
      notifyBorrowerDashboardMutationComplete();
    } catch (cause) {
      const message = getApplicationErrorMessage(cause);
      await refresh();
      setError(message);
    } finally { setBusy(false); }
  }

  if (loading && !application) return <main className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-8 sm:px-6"><div className="h-8 w-1/3 animate-pulse rounded bg-muted"/><div className="h-64 animate-pulse rounded-xl bg-muted"/></main>;
  if (!application) return <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6"><Card><CardContent className="grid justify-items-center gap-3 py-10 text-center"><AlertCircle className="size-8 text-destructive"/><h1 className="text-xl font-semibold">Application unavailable</h1><p role="alert" className="max-w-lg text-sm text-muted-foreground">{error ?? "We could not load this application."}</p><Link className={buttonVariants({ variant: "outline" })} href="/borrower/applications">Back to applications</Link></CardContent></Card></main>;

  const snapshot = application.currentVersion?.submittedData;
    const editable = application.permissions.canEdit;
  const field = (name: keyof BorrowerApplicationFormValues, label: string, type = "text") => <label className="grid gap-1.5 text-sm font-medium" key={name}>{label}<input className={fieldClass} type={type} value={values?.[name] ?? ""} onChange={(event) => setValues((current) => current ? { ...current, [name]: event.target.value } : current)} /></label>;

  return <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-6 sm:px-6 sm:py-9">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/borrower/applications" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4"/>Applications</Link><Badge variant={application.status === "APPROVED" ? "success" : application.status === "REJECTED" ? "warning" : "secondary"}>{formatDashboardStatus(application.status)}</Badge></div>
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm text-muted-foreground">Application reference</p><h1 className="mt-1 break-all text-2xl font-bold tracking-tight sm:text-3xl">{application.id}</h1><p className="mt-2 text-sm text-muted-foreground">Created {formatDashboardDate(application.createdAt)} · Updated {formatDashboardDate(application.updatedAt)}</p></div><div className="flex flex-wrap gap-2">{editable && !editing ? <Button variant="outline" onClick={() => setEditing(true)}><PencilLine className="size-4"/>Edit application</Button> : null}{application.permissions.canSubmit && !editing ? <Button onClick={() => setConfirmSubmit(true)}><Send className="size-4"/>Submit application</Button> : null}</div></header>
    {error ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}{notice ? <div role="status" className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-4 text-sm text-success"><CheckCircle2 className="mt-0.5 size-4 shrink-0"/>{notice}</div> : null}
    {editing && values ? <Card><CardHeader><CardTitle>Edit application draft</CardTitle><CardDescription>Changes are saved as a new application version. Your application remains a draft until you submit it.</CardDescription></CardHeader><CardContent><form onSubmit={saveChanges} className="grid gap-5"><div className="grid gap-4 sm:grid-cols-2">{field("legalName", "Legal name")}{field("phone", "Phone")}{field("addressLine1", "Address line 1")}{field("addressLine2", "Address line 2")}{field("subdistrict", "Subdistrict")}{field("district", "District")}{field("province", "Province")}{field("postalCode", "Postal code")}{field("countryCode", "Country code")}{field("employmentStatus", "Employment status")}{field("employerName", "Employer name")}{field("occupation", "Occupation")}{field("monthsInRole", "Months in role", "number")}{field("companyName", "Company or business name")}
      <label className="grid gap-1.5 text-sm font-medium" key="companyType">Company or business type<select className={fieldClass} value={values.companyType} onChange={(event) => setValues((current) => current ? { ...current, companyType: event.target.value } : current)}><option value="">Choose a type</option>{BORROWER_COMPANY_TYPES.map((type) => <option key={type} value={type}>{COMPANY_TYPE_LABELS[type]}</option>)}</select></label>
      {field("amountBaht", "Requested amount (THB)", "number")}{field("termMonths", "Term (months)", "number")}{field("purpose", "Purpose")}</div><div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin"/> : null}Save changes</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setValues(formFromApplication(application)); setEditing(false); }}>Cancel</Button></div></form></CardContent></Card> : <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="size-5 text-primary"/>Application details</CardTitle><CardDescription>Information shown here comes from the saved application version.</CardDescription></CardHeader><CardContent><dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3"><Detail label="Requested amount">{application.currentVersion ? formatSatang(application.currentVersion.requestedPrincipalSatang) : null}</Detail><Detail label="Requested term">{application.currentVersion ? `${application.currentVersion.requestedTermMonths} months` : null}</Detail><Detail label="Purpose">{snapshot?.requested_loan.purpose}</Detail><Detail label="Legal name">{snapshot?.borrower.legal_name}</Detail><Detail label="Employment status">{snapshot?.employment.employment_status}</Detail>{snapshot?.employment.company_name ? <Detail label="Company or business">{snapshot.employment.company_name}{snapshot.employment.company_type ? ` · ${COMPANY_TYPE_LABELS[snapshot.employment.company_type]}` : ""}</Detail> : null}<Detail label="Created">{formatDashboardDate(application.createdAt)}</Detail><Detail label="Submitted">{formatDashboardDate(application.submittedAt)}</Detail><Detail label="Closed">{formatDashboardDate(application.closedAt)}</Detail><Detail label="Version">{application.currentVersion?.versionNumber}</Detail></dl></CardContent></Card>}
    {!editing && application.currentVersion ? <BorrowerRiskEvaluation applicationId={application.id} applicationStatus={application.status} principalSatang={application.currentVersion.requestedPrincipalSatang} termMonths={application.currentVersion.requestedTermMonths}/> : null}
    {application.financialReviews.length || application.informationRequests.length ? <section className="grid gap-4 md:grid-cols-2">{application.financialReviews.length ? <Card><CardHeader><CardTitle>Decision information</CardTitle><CardDescription>Updates provided by the application review team.</CardDescription></CardHeader><CardContent className="grid gap-4">{application.financialReviews.map((review) => <article className="border-b border-border pb-3 last:border-0 last:pb-0" key={review.id}><div className="flex justify-between gap-3"><Badge variant="outline">{formatDashboardStatus(review.decision)}</Badge><time className="text-xs text-muted-foreground">{formatDashboardDate(review.createdAt)}</time></div><p className="mt-2 text-sm">{review.reason}</p></article>)}</CardContent></Card> : null}{application.informationRequests.length ? <Card><CardHeader><CardTitle>Information requests</CardTitle><CardDescription>Requests recorded for this application.</CardDescription></CardHeader><CardContent className="grid gap-4">{application.informationRequests.map((item) => <article className="border-b border-border pb-3 last:border-0 last:pb-0" key={item.id}><div className="flex justify-between gap-3"><Badge variant="outline">{formatDashboardStatus(item.status)}</Badge><time className="text-xs text-muted-foreground">{formatDashboardDate(item.createdAt)}</time></div><p className="mt-2 text-sm">{formatInformationRequestDetails(item.requestDetails)}</p></article>)}</CardContent></Card> : null}</section> : null}
    {confirmSubmit ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setConfirmSubmit(false); }}><section role="dialog" aria-modal="true" aria-labelledby="submit-title" aria-describedby="submit-description" className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xl"><h2 id="submit-title" className="text-lg font-semibold">Submit this application?</h2><p id="submit-description" className="mt-2 text-sm text-muted-foreground">Please confirm that you have reviewed the saved details. You can’t edit the application after submission unless the backend allows it.</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirmSubmit(false)}>Review details</Button><Button disabled={busy} onClick={() => void submitApplication()}>{busy ? <LoaderCircle className="size-4 animate-spin"/> : null}Confirm submission</Button></div></section></div> : null}
  </main>;
}

function formatInformationRequestDetails(details: unknown): string {
  if (typeof details === "string") return details;
  if (details && typeof details === "object") {
    const record = details as Record<string, unknown>;
    for (const key of ["message", "reason", "summary"]) {
      if (typeof record[key] === "string") return record[key];
    }
    return JSON.stringify(details);
  }
  return "Additional information was requested.";
}
