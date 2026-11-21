"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, LoaderCircle, ShieldCheck, WalletCards } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { formatDashboardDate, formatDashboardStatus, formatSatang, notifyBorrowerDashboardMutationComplete } from "../../lib/client/borrower-dashboard";
import { getApplicationErrorMessage } from "../../lib/client/borrower-applications";
import { acceptBorrowerOffer, createOfferAcceptanceLock, formatOfferDateTime, loadBorrowerOffer, type BorrowerOfferDetails } from "../../lib/client/borrower-offers";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold text-foreground">{children || "—"}</dd></div>;
}

export function BorrowerOfferDetailsPage({ offerId }: { offerId: string }) {
  const offerAcceptanceLock = useMemo(() => createOfferAcceptanceLock(), [offerId]);
  const [offer, setOffer] = useState<BorrowerOfferDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedLoan, setAcceptedLoan] = useState<{ id: string; status: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await loadBorrowerOffer(offerId);
      setOffer(response.data);
      setError(null);
    } catch (cause) {
      setError(getApplicationErrorMessage(cause));
    } finally { setLoading(false); }
  }, [offerId]);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  async function confirmAcceptance() {
    if (!offer?.permissions.canAccept) return;
    setBusy(true); setError(null);
    try {
      const result = await offerAcceptanceLock(() => acceptBorrowerOffer(offer.id));
      if (!result.accepted) return;
      const loan = result.result.data;
      await refresh();
      setAcceptedLoan({ id: loan.loanId, status: loan.status });
      setConfirm(false);
      notifyBorrowerDashboardMutationComplete();
    } catch (cause) {
      const message = getApplicationErrorMessage(cause);
      await refresh();
      setError(message);
    } finally { setBusy(false); }
  }

  if (loading && !offer) return <main className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-8 sm:px-6"><div className="h-8 w-1/3 animate-pulse rounded bg-muted"/><div className="h-72 animate-pulse rounded-xl bg-muted"/></main>;
  if (!offer) return <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6"><Card><CardContent className="grid justify-items-center gap-3 py-10 text-center"><AlertCircle className="size-8 text-destructive"/><h1 className="text-xl font-semibold">Offer unavailable</h1><p role="alert" className="max-w-lg text-sm text-muted-foreground">{error ?? "We could not load this offer."}</p><div className="flex flex-wrap justify-center gap-2"><Button variant="outline" onClick={() => void refresh()}>Retry</Button><Link className={buttonVariants({ variant: "outline" })} href="/borrower/offers">Back to offers</Link></div></CardContent></Card></main>;

  const stateLabel = offer.isExpired ? "Expired" : formatDashboardStatus(offer.status);
  const stateVariant = offer.status === "ACCEPTED" ? "success" : offer.isExpired ? "warning" : "secondary";

  return <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-6 sm:px-6 sm:py-9">
    <Link href="/borrower/offers" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4"/>All offers</Link>
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm text-muted-foreground">Offer reference</p><h1 className="mt-1 break-all text-2xl font-bold tracking-tight sm:text-3xl">{offer.id}</h1><p className="mt-2 text-sm text-muted-foreground">For application {offer.applicationId}</p></div><Badge variant={stateVariant}>{stateLabel}</Badge></header>
    {error ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
    {acceptedLoan ? <div role="status" className="flex flex-col gap-3 rounded-lg border border-success/30 bg-success/5 p-4 text-sm text-success sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0"/><span>Offer accepted. Loan {acceptedLoan.id} is now {formatDashboardStatus(acceptedLoan.status)}.</span></div><Link className={buttonVariants({ variant: "outline", size: "sm" })} href="/borrower/loans">View loans</Link></div> : null}
    <Card><CardHeader><CardTitle>Offer terms</CardTitle><CardDescription>Review these terms carefully. The final loan schedule is generated by the backend after funding and disbursement.</CardDescription></CardHeader><CardContent><dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2"><Detail label="Principal">{formatSatang(offer.principalSatang)}</Detail><Detail label="Annual interest rate">{(Number(offer.annualInterestRate) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}% p.a.</Detail><Detail label="Term">{offer.termMonths} months</Detail><Detail label="Repayment frequency">{formatDashboardStatus(offer.repaymentFrequency)}</Detail><Detail label="Interest calculation">{formatDashboardStatus(offer.repaymentTerms.calculationMethod)} ({formatDashboardStatus(offer.repaymentTerms.calculationFrequency)})</Detail><Detail label="Currency">{offer.repaymentTerms.currency}</Detail><Detail label="Offer status">{stateLabel}</Detail><Detail label="Expires">{formatOfferDateTime(offer.expiresAt)}</Detail><Detail label="Created">{formatDashboardDate(offer.createdAt)}</Detail>{offer.acceptedAt ? <Detail label="Accepted">{formatDashboardDate(offer.acceptedAt)}</Detail> : null}</dl></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary"/>Platform fee disclosure</CardTitle><CardDescription>This fee is shown separately from repayment obligations and is not deducted from your wallet.</CardDescription></CardHeader><CardContent><dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2"><Detail label="Fee rate">{(offer.platformFee.rateBasisPoints / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%</Detail><Detail label="Calculation basis">{formatDashboardStatus(offer.platformFee.calculationBasis)}</Detail><Detail label="Calculation timing">{formatDashboardStatus(offer.platformFee.calculationTiming)}</Detail><Detail label="Wallet deduction">{offer.platformFee.walletDeduction ? "Yes" : "No"}</Detail><Detail label="Treatment">{formatDashboardStatus(offer.platformFee.treatment)}</Detail><Detail label="Currency">{offer.platformFee.currency}</Detail></dl></CardContent></Card>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4"/>The backend checks offer validity again when you accept.</p>{offer.permissions.canAccept ? <Button onClick={() => setConfirm(true)}><WalletCards className="size-4"/>Accept offer</Button> : <Button disabled>{offer.status === "ACCEPTED" ? "Offer accepted" : offer.isExpired ? "Offer expired" : "Offer unavailable"}</Button>}</div>
    {confirm ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setConfirm(false); }}><section role="dialog" aria-modal="true" aria-labelledby="accept-title" aria-describedby="accept-description" className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xl"><h2 id="accept-title" className="text-lg font-semibold">Accept this offer?</h2><p id="accept-description" className="mt-2 text-sm text-muted-foreground">You are accepting {formatSatang(offer.principalSatang)} at {(Number(offer.annualInterestRate) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}% annual interest for {offer.termMonths} months. The {offer.platformFee.rateBasisPoints / 100}% platform fee is disclosed separately and is not deducted from your wallet.</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>Review terms</Button><Button disabled={busy} onClick={() => void confirmAcceptance()}>{busy ? <LoaderCircle className="size-4 animate-spin"/> : null}Confirm acceptance</Button></div></section></div> : null}
  </main>;
}
