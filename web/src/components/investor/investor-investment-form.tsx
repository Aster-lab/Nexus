"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, LoaderCircle, WalletCards } from "lucide-react";
import { ApiClientError } from "../../lib/client/api-client";
import { formatDashboardDate, formatDashboardStatus, formatSatang } from "../../lib/client/borrower-dashboard";
import { getApplicationErrorMessage } from "../../lib/client/borrower-applications";
import { loadInvestorDashboardResource, notifyInvestorDashboardMutationComplete, type InvestorDashboardPortfolio } from "../../lib/client/investor-dashboard";
import { loadInvestorMarketplaceDetail, type InvestorMarketplaceOpportunity } from "../../lib/client/investor-marketplace";
import {
  createInvestorContributionIdempotencyKey,
  isInvestorContributionOutcomeUncertain,
  submitInvestorContribution,
  validateInvestorContributionAmount,
  type InvestorContributionResult,
} from "../../lib/client/investor-investments";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

interface PendingContributionRequest {
  loanId: string;
  amountSatang: string;
  idempotencyKey: string;
}

function pendingStorageKey(loanId: string): string { return `nexus:investment-pending:${loanId}`; }

function clearPendingContribution(loanId: string): void {
  try { window.sessionStorage.removeItem(pendingStorageKey(loanId)); } catch {  }
}

function amountErrorMessage(code: ReturnType<typeof validateInvestorContributionAmount>["code"]): string | null {
  switch (code) {
    case "REQUIRED": return "Enter an investment amount.";
    case "FORMAT": return "Enter a valid THB amount.";
    case "PRECISION": return "Use no more than two decimal places.";
    case "POSITIVE": return "Investment amount must be greater than zero.";
    case "AMOUNT_LIMIT": return "The amount is outside the supported request range.";
    case "ABOVE_WALLET": return "The amount exceeds your available wallet balance.";
    case "ABOVE_CAPACITY": return "The amount exceeds the opportunity's remaining funding capacity.";
    case "LIMIT_UNAVAILABLE": return "The wallet or opportunity limit could not be verified. Refresh and try again.";
    default: return null;
  }
}

export function InvestorInvestmentFormPage({ loanId }: { loanId: string }) {
  const postingRef = useRef(false);
  const [opportunity, setOpportunity] = useState<InvestorMarketplaceOpportunity | null>(null);
  const [portfolio, setPortfolio] = useState<InvestorDashboardPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<InvestorContributionResult | null>(null);
  const [pendingRequest, setPendingRequest] = useState<PendingContributionRequest | null>(null);
  const [uncertain, setUncertain] = useState(false);

  const refreshInformation = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [opportunityResult, portfolioResult] = await Promise.all([
        loadInvestorMarketplaceDetail(loanId),
        loadInvestorDashboardResource("portfolio"),
      ]);
      if (portfolioResult.status !== "success") {
        throw new Error(portfolioResult.status === "error" ? portfolioResult.message : "Portfolio information is still loading.");
      }
      setOpportunity(opportunityResult.data);
      setPortfolio(portfolioResult.data);
    } catch (cause) {
      setLoadError(getApplicationErrorMessage(cause));
    } finally { setLoading(false); }
  }, [loanId]);

  useEffect(() => { queueMicrotask(() => { void refreshInformation(); }); }, [refreshInformation]);

  useEffect(() => {
    queueMicrotask(() => {
    try {
      const saved = window.sessionStorage.getItem(pendingStorageKey(loanId));
      if (!saved) return;
      const parsed: unknown = JSON.parse(saved);
      if (typeof parsed === "object" && parsed !== null && "loanId" in parsed && parsed.loanId === loanId &&
        "amountSatang" in parsed && typeof parsed.amountSatang === "string" && /^[1-9][0-9]*$/.test(parsed.amountSatang) &&
        "idempotencyKey" in parsed && typeof parsed.idempotencyKey === "string" && parsed.idempotencyKey.length > 0 && parsed.idempotencyKey.length <= 255) {
        const amountSatang = BigInt(parsed.amountSatang);
        const cents = (amountSatang % 100n).toString().padStart(2, "0");
        setPendingRequest(parsed as PendingContributionRequest);
        setAmount(`${amountSatang / 100n}.${cents}`);
        setUncertain(true);
        setError("A previous investment request has an uncertain result. You can safely retry the exact same request with its original key.");
      } else clearPendingContribution(loanId);
    } catch {
      clearPendingContribution(loanId);
    }
    });
  }, [loanId]);

  const wallet = portfolio?.wallet ?? null;
  const walletUsable = Boolean(wallet && wallet.status === "ACTIVE" && wallet.currency === "THB");
  const validation = validateInvestorContributionAmount(amount, wallet?.balanceSatang ?? "invalid", opportunity?.remainingFundingSatang ?? "invalid");
  const amountError = touched ? amountErrorMessage(validation.code) : null;

  function openConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    setError(null);
    if (!opportunity || !walletUsable || validation.code) return;
    setConfirming(true);
  }

  async function postRequest(request: PendingContributionRequest) {
    if (postingRef.current) return;
    postingRef.current = true;
    setBusy(true);
    setError(null);
    setConfirming(false);
    setPendingRequest(request);
    try { window.sessionStorage.setItem(pendingStorageKey(loanId), JSON.stringify(request)); } catch {  }
    const timeoutController = new AbortController();
    const timeoutId = window.setTimeout(() => timeoutController.abort(), 30_000);
    try {
      const response = await submitInvestorContribution(
        { loanId: request.loanId, amountSatang: request.amountSatang },
        request.idempotencyKey,
        undefined,
        { signal: timeoutController.signal },
      );
      const result = response.data;
      if (result.ledgerStatus !== "POSTED" || !result.ledgerTransactionId) {
        throw new ApiClientError(0, "UNCONFIRMED_INVESTMENT", "The server did not confirm a posted investment.");
      }
      setSuccess(result);
      setPendingRequest(null);
      clearPendingContribution(loanId);
      setUncertain(false);
      setAmount("");
      setTouched(false);
      notifyInvestorDashboardMutationComplete();
      void refreshInformation();
    } catch (cause) {
      if (isInvestorContributionOutcomeUncertain(cause)) {
        setPendingRequest(request);
        setUncertain(true);
        setError("We could not confirm whether this investment posted. The request is saved; retry only with the same amount and key.");
      } else {
        setPendingRequest(null);
        clearPendingContribution(loanId);
        setUncertain(false);
        setError(getApplicationErrorMessage(cause));
      }
    } finally { window.clearTimeout(timeoutId); postingRef.current = false; setBusy(false); }
  }

  function confirmInvestment() {
    if (!validation.amountSatang || !opportunity) return;
    let idempotencyKey: string;
    try { idempotencyKey = createInvestorContributionIdempotencyKey(); }
    catch (cause) { setError(getApplicationErrorMessage(cause)); return; }
    void postRequest({ loanId, amountSatang: validation.amountSatang, idempotencyKey });
  }

  if (loading && !opportunity && !loadError) return <main className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-8 sm:px-6"><p role="status" aria-busy="true" className="text-sm text-muted-foreground">Loading investment information</p><div className="h-72 animate-pulse rounded-xl bg-muted"/></main>;
  if ((!opportunity || !portfolio) && !success) return <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6"><Card><CardContent className="grid justify-items-center gap-3 py-10 text-center"><AlertCircle className="size-8 text-destructive"/><h1 className="text-xl font-semibold">Investment information unavailable</h1><p role="alert" className="max-w-lg text-sm text-muted-foreground">{loadError ?? "Refresh the opportunity and wallet information before continuing."}</p><div className="flex gap-2"><Button variant="outline" onClick={() => void refreshInformation()}>Retry</Button><Link href={`/investor/marketplace/${loanId}`} className={buttonVariants({ variant: "outline" })}>Back to opportunity</Link></div></CardContent></Card></main>;

  return <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-6 sm:px-6 sm:py-9"><Link href={`/investor/marketplace/${loanId}`} className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4"/>Opportunity details</Link>
    <header><p className="text-sm font-semibold text-primary">Investor workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Invest in this opportunity</h1><p className="mt-2 break-all text-sm text-muted-foreground">Loan reference: {loanId}</p></header>

    {success ? <Card className="border-success/30"><CardContent className="grid gap-4 pt-5"><div role="status" className="flex items-start gap-3 text-success"><CheckCircle2 className="mt-0.5 size-5 shrink-0"/><div><h2 className="font-semibold">Investment confirmed</h2><p className="mt-1 text-sm">NEXUS confirmed a posted contribution of {formatSatang(success.amountSatang)}.</p></div></div><dl className="grid gap-3 text-sm sm:grid-cols-2"><Summary label="Contribution reference">{success.contributionId}</Summary><Summary label="Investment reference">{success.investmentId}</Summary><Summary label="Ledger transaction">{success.ledgerTransactionId}</Summary><Summary label="Posted at">{formatDashboardDate(success.createdAt)}</Summary></dl>{loadError ? <p role="alert" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">The contribution is confirmed, but some account information could not be refreshed. Visit your portfolio and wallet summary to reload persisted data.</p> : <p className="text-sm text-muted-foreground">Your portfolio and wallet summary are being refreshed from persisted records.</p>}<Link href="/investor/portfolio" className={buttonVariants({ variant: "outline" })}>View portfolio</Link></CardContent></Card> : null}

    {!success && opportunity && portfolio ? <>
      <Card><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>Investment details</CardTitle><CardDescription className="mt-1">The backend rechecks eligibility, wallet funds, and remaining capacity when you confirm.</CardDescription></div><Badge variant="success">{formatDashboardStatus(opportunity.status)}</Badge></div></CardHeader><CardContent><dl className="grid gap-4 sm:grid-cols-2"><Summary label="Remaining funding opportunity">{formatSatang(opportunity.remainingFundingSatang)}</Summary><Summary label="Loan term">{opportunity.termMonths} months</Summary><Summary label="Annual interest rate">{(Number(opportunity.annualInterestRate) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}% p.a.</Summary><Summary label="Funding deadline">{formatDashboardDate(opportunity.fundingDeadline)}</Summary></dl></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="size-5 text-primary"/>Simulated investor wallet</CardTitle><CardDescription>Wallet balance changes only after a backend-confirmed posting.</CardDescription></CardHeader><CardContent>{wallet ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-4"><div><p className="text-sm text-muted-foreground">Available balance</p><p className="mt-1 text-xl font-bold">{formatSatang(wallet.balanceSatang)} {wallet.currency}</p></div><Badge variant={wallet.status === "ACTIVE" && wallet.currency === "THB" ? "success" : "warning"}>{formatDashboardStatus(wallet.status)} · {wallet.currency}</Badge></div> : <p className="text-sm text-muted-foreground">No investor wallet is linked to this account.</p>}</CardContent></Card>
      {loadError ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{loadError}</div> : null}
      {error ? <div role="alert" className={`rounded-lg border p-4 text-sm ${uncertain ? "border-warning/30 bg-warning/5 text-foreground" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>{error}</div> : null}

      {!uncertain ? <form className="grid gap-4" onSubmit={openConfirmation}>
        <div className="grid gap-2"><label htmlFor="investment-amount" className="text-sm font-medium">Investment amount (THB)</label><input id="investment-amount" name="amount" type="text" inputMode="decimal" autoComplete="off" placeholder="e.g. 1,000.00" value={amount} disabled={!walletUsable || busy} onChange={(event) => { setAmount(event.target.value); setSuccess(null); }} onBlur={() => setTouched(true)} aria-invalid={Boolean(amountError)} aria-describedby={amountError ? "investment-amount-error" : "investment-amount-help"} className="h-11 rounded-md border border-input bg-background px-3 text-base"/><p id={amountError ? "investment-amount-error" : "investment-amount-help"} className={`text-sm ${amountError ? "text-destructive" : "text-muted-foreground"}`}>{amountError ?? `Maximum based on current data: ${formatSatang(wallet?.balanceSatang ?? "0")} wallet balance and ${formatSatang(opportunity.remainingFundingSatang)} remaining capacity. No frontend minimum is imposed.`}</p></div>
        {!walletUsable ? <p role="alert" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">An active THB investor wallet is required to submit an investment.</p> : null}
        <Button type="submit" disabled={busy || !walletUsable || opportunity.status !== "FUNDING"}>{busy ? <LoaderCircle className="size-4 animate-spin"/> : null}Review investment</Button>
      </form> : null}
      {uncertain && pendingRequest ? <div className="grid gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4"><p className="text-sm">The server supports idempotent retries. Repeating this exact request with the same key returns the original logical result if it already posted.</p><Button disabled={busy} onClick={() => void postRequest(pendingRequest)}>{busy ? <LoaderCircle className="size-4 animate-spin"/> : null}Retry the same request safely</Button></div> : null}
    </> : null}

    {confirming && opportunity && portfolio ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="investment-confirmation-title" className="w-full max-w-lg rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl sm:p-6"><h2 id="investment-confirmation-title" className="text-lg font-semibold">Confirm investment</h2><p className="mt-2 text-sm text-muted-foreground">Review this request before submitting. NEXUS will not deduct funds unless the backend confirms a posted transaction.</p><dl className="my-5 grid gap-4 rounded-lg bg-muted/50 p-4 sm:grid-cols-2"><Summary label="Loan reference">{loanId}</Summary><Summary label="Investment amount">{validation.amountSatang ? formatSatang(validation.amountSatang) : "—"}</Summary><Summary label="Current wallet balance">{wallet ? formatSatang(wallet.balanceSatang) : "Unavailable"}</Summary><Summary label="Remaining opportunity">{formatSatang(opportunity.remainingFundingSatang)}</Summary></dl><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Go back</Button><Button disabled={busy || !validation.amountSatang} onClick={confirmInvestment}>{busy ? <LoaderCircle className="size-4 animate-spin"/> : null}Confirm investment</Button></div></section></div> : null}
  </main>;
}

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 break-all font-semibold">{children}</dd></div>;
}
