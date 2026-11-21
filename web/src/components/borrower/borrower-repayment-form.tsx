"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, LoaderCircle, RefreshCw, WalletCards } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { ApiClientError } from "../../lib/client/api-client";
import { formatDashboardDate, formatDashboardStatus, formatSatang, notifyBorrowerDashboardMutationComplete } from "../../lib/client/borrower-dashboard";
import { getApplicationErrorMessage } from "../../lib/client/borrower-applications";
import { loadBorrowerLoan, loadBorrowerSchedule, type BorrowerLoanDetails, type BorrowerRepaymentSchedule } from "../../lib/client/borrower-loans";
import {
  createRepaymentSubmissionLock,
  isRepaymentOutcomeUncertain,
  loadBorrowerPayable,
  loadBorrowerRepaymentHistory,
  loadBorrowerWallet,
  submitBorrowerRepayment,
  validateRepaymentAmount,
  type BorrowerPayableSummary,
  type BorrowerRepaymentHistoryItem,
  type BorrowerRepaymentResult,
  type BorrowerWalletSnapshot,
} from "../../lib/client/borrower-repayments";

interface PendingRepaymentRequest {
  loanId: string;
  amountSatang: string;
  idempotencyKey: string;
  startedAt: string;
}

function clearSavedRepaymentRequest(loanId: string): void {
  try { window.sessionStorage.removeItem(`nexus:repayment-pending:${loanId}`); } catch { /* Session storage can be unavailable in privacy-restricted browsers. */ }
}

function validationMessage(code: ReturnType<typeof validateRepaymentAmount>["code"]): string | null {
  switch (code) {
    case "REQUIRED": return "Enter a repayment amount.";
    case "FORMAT": return "Enter a valid THB amount.";
    case "PRECISION": return "Use no more than two decimal places.";
    case "POSITIVE": return "Repayment amount must be greater than zero.";
    case "ABOVE_PAYABLE": return "The amount cannot exceed the currently payable amount.";
    case "NOT_PAYABLE": return "There is no amount currently payable for this loan.";
    default: return null;
  }
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function Notice({ children, variant = "error" }: { children: ReactNode; variant?: "error" | "success" | "warning" }) {
  const classes = variant === "success"
    ? "border-success/30 bg-success/5 text-success"
    : variant === "warning" ? "border-warning/30 bg-warning/5 text-foreground" : "border-destructive/30 bg-destructive/5 text-destructive";
  return <div role={variant === "success" ? "status" : "alert"} className={`flex items-start gap-2 rounded-lg border p-4 text-sm ${classes}`}>{variant === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0"/> : <AlertCircle className="mt-0.5 size-4 shrink-0"/>}<div>{children}</div></div>;
}

export function BorrowerRepaymentForm({ loanId }: { loanId: string }) {
  const submissionLock = useMemo(() => createRepaymentSubmissionLock(), [loanId]);
  const postingRef = useRef(false);
  const [loan, setLoan] = useState<BorrowerLoanDetails | null>(null);
  const [payable, setPayable] = useState<BorrowerPayableSummary | null>(null);
  const [schedule, setSchedule] = useState<BorrowerRepaymentSchedule | null>(null);
  const [wallet, setWallet] = useState<BorrowerWalletSnapshot["wallet"]>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<BorrowerRepaymentResult | null>(null);
  const [pendingRequest, setPendingRequest] = useState<PendingRepaymentRequest | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [historyChecked, setHistoryChecked] = useState(false);
  const [recentHistory, setRecentHistory] = useState<BorrowerRepaymentHistoryItem[]>([]);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [checkingHistory, setCheckingHistory] = useState(false);

  const refreshInitial = useCallback(async () => {
    setInitialLoading(true);
    setLoadingError(null);
    try {
      const [loanResult, payableResult] = await Promise.all([
        loadBorrowerLoan(loanId),
        loadBorrowerPayable(loanId),
      ]);
      setLoan(loanResult.data);
      setPayable(payableResult.data);
      if (loanResult.data.disbursedAt) {
        try {
          const scheduleResult = await loadBorrowerSchedule(loanId);
          setSchedule(scheduleResult.data);
        } catch {
          setSchedule(null);
        }
      } else setSchedule(null);
      try {
        const walletResult = await loadBorrowerWallet();
        setWallet(walletResult.data.wallet);
      } catch {
        setWallet(null);
      }
    } catch (cause) {
      setLoadingError(getApplicationErrorMessage(cause));
    } finally { setInitialLoading(false); }
  }, [loanId]);

  useEffect(() => { queueMicrotask(() => { void refreshInitial(); }); }, [refreshInitial]);

  useEffect(() => {
    queueMicrotask(() => {
    try {
      const saved = window.sessionStorage.getItem(`nexus:repayment-pending:${loanId}`);
      if (!saved) return;
      const parsed: unknown = JSON.parse(saved);
      if (typeof parsed === "object" && parsed !== null &&
        "loanId" in parsed && parsed.loanId === loanId &&
        "amountSatang" in parsed && typeof parsed.amountSatang === "string" &&
        "idempotencyKey" in parsed && typeof parsed.idempotencyKey === "string" &&
        "startedAt" in parsed && typeof parsed.startedAt === "string") {
        setPendingRequest(parsed as PendingRepaymentRequest);
        setUncertain(true);
        setError("A previous repayment request for this loan has an uncertain result. Check repayment history before retrying.");
      }
    } catch {
      clearSavedRepaymentRequest(loanId);
    }
    });
  }, [loanId]);

  const validation = validateRepaymentAmount(amount, payable?.payableAmountSatang ?? "0");
  const amountError = touched ? validationMessage(validation.code) : null;
  const payableInstallments = payable?.installments ?? [];
  const overdueInstallments = payableInstallments.filter((item) => item.status === "OVERDUE");

  async function refreshAfterSuccess() {
    const results = await Promise.allSettled([
      loadBorrowerLoan(loanId).then((result) => setLoan(result.data)),
      loadBorrowerPayable(loanId).then((result) => setPayable(result.data)),
      loadBorrowerSchedule(loanId).then((result) => setSchedule(result.data)),
      loadBorrowerWallet().then((result) => setWallet(result.data.wallet)),
      loadBorrowerRepaymentHistory().then((result) => setRecentHistory(result.data.filter((item) => item.loanId === loanId))),
    ]);
    if (results.some((result) => result.status === "rejected")) {
      setRefreshWarning("The repayment was posted, but some account information could not be refreshed. Use Refresh to try again.");
    }
    notifyBorrowerDashboardMutationComplete();
  }

  async function postRequest(request: PendingRepaymentRequest) {
    if (postingRef.current) return;
    postingRef.current = true;
    setBusy(true); setError(null); setRefreshWarning(null);
    const timeoutController = new AbortController();
    const timeoutId = window.setTimeout(() => timeoutController.abort(), 30_000);
    try {
      const locked = await submissionLock(() => submitBorrowerRepayment(
        { loanId: request.loanId, amountSatang: request.amountSatang },
        request.idempotencyKey,
        undefined,
        { signal: timeoutController.signal },
      ));
      if (!locked.submitted) return;
      const result = locked.result.data;
      if (result.receipt.status !== "POSTED" || !result.ledgerTransactionId) {
        throw new ApiClientError(0, "UNCONFIRMED_REPAYMENT", "The server did not confirm a posted repayment.");
      }
      setSuccess(result);
      setPendingRequest(null);
      clearSavedRepaymentRequest(loanId);
      setUncertain(false);
      setConfirming(false);
      setAmount("");
      setTouched(false);
      await refreshAfterSuccess();
    } catch (cause) {
      if (isRepaymentOutcomeUncertain(cause)) {
        setPendingRequest(request);
        setUncertain(true);
        setHistoryChecked(false);
        setError("We could not confirm whether the repayment was posted. Check repayment history before retrying. Any retry will reuse the same request key.");
      } else {
        setPendingRequest(null);
        clearSavedRepaymentRequest(loanId);
        setUncertain(false);
        setError(getApplicationErrorMessage(cause));
      }
      setConfirming(false);
    } finally { window.clearTimeout(timeoutId); postingRef.current = false; setBusy(false); }
  }

  function openConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    setError(null);
    if (!loan || !payable || validation.code) return;
    setConfirming(true);
  }

  function createPendingRequest(amountSatang: string): PendingRepaymentRequest {
    return {
      loanId,
      amountSatang,
      idempotencyKey: `nexus-repayment-${window.crypto.randomUUID()}`,
      startedAt: new Date().toISOString(),
    };
  }

  async function confirmSubmission() {
    if (!payable || validation.code || busy || postingRef.current) return;
    const request = pendingRequest ?? createPendingRequest(validation.amountSatang!);
    setPendingRequest(request);
    try { window.sessionStorage.setItem(`nexus:repayment-pending:${loanId}`, JSON.stringify(request)); } catch { /* Keep the in-memory retry key if storage is unavailable. */ }
    await postRequest(request);
  }

  async function checkHistory() {
    if (!pendingRequest) return;
    setCheckingHistory(true); setError(null);
    try {
      const result = await loadBorrowerRepaymentHistory();
      const relevant = result.data.filter((item) => item.loanId === loanId && new Date(item.receivedAt).getTime() >= new Date(pendingRequest.startedAt).getTime());
      setRecentHistory(relevant);
      setHistoryChecked(true);
      const [payableResult, scheduleResult, loanResult, walletResult] = await Promise.allSettled([
        loadBorrowerPayable(loanId).then((value) => setPayable(value.data)),
        loadBorrowerSchedule(loanId).then((value) => setSchedule(value.data)),
        loadBorrowerLoan(loanId).then((value) => setLoan(value.data)),
        loadBorrowerWallet().then((value) => setWallet(value.data.wallet)),
      ]);
      if ([payableResult, scheduleResult, loanResult, walletResult].some((item) => item.status === "rejected")) {
        setRefreshWarning("History loaded, but one or more balances could not be refreshed.");
      }
    } catch (cause) {
      setError(`Could not check repayment history: ${getApplicationErrorMessage(cause)}`);
    } finally { setCheckingHistory(false); }
  }

  if (initialLoading && !loan) return <main className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-8 sm:px-6"><p role="status" aria-busy="true" className="text-sm text-muted-foreground">Loading repayment information</p><div className="h-8 w-1/3 animate-pulse rounded bg-muted"/><div className="h-64 animate-pulse rounded-xl bg-muted"/></main>;
  if (!loan || !payable) return <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6"><Card><CardContent className="grid justify-items-center gap-3 py-10 text-center"><AlertCircle className="size-8 text-destructive"/><h1 className="text-xl font-semibold">Repayment unavailable</h1><p role="alert" className="max-w-lg text-sm text-muted-foreground">{loadingError ?? "Loan or payable information is unavailable."}</p><div className="flex gap-2"><Button variant="outline" onClick={() => void refreshInitial()}>Retry</Button><Link href={`/borrower/loans/${loanId}`} className={buttonVariants({ variant: "outline" })}>Back to loan</Link></div></CardContent></Card></main>;

  return <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-6 sm:px-6 sm:py-9">
    <Link href={`/borrower/loans/${loanId}`} className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4"/>Loan details</Link>
    <header><p className="text-sm font-medium text-primary">Borrower workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Make a repayment</h1><p className="mt-2 break-all text-sm text-muted-foreground">Loan {loan.id}</p></header>
    {error ? <Notice>{error}</Notice> : null}
    {refreshWarning ? <Notice variant="warning">{refreshWarning}</Notice> : null}
    {success ? <Card className="border-success/30"><CardHeader><CardTitle className="flex items-center gap-2 text-success"><CheckCircle2 className="size-5"/>Repayment posted</CardTitle><CardDescription>The backend confirmed the ledger transaction is POSTED.</CardDescription></CardHeader><CardContent className="grid gap-4"><dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Amount received</dt><dd className="mt-1 font-semibold">{formatSatang(success.receipt.totalReceivedSatang)}</dd></div><div><dt className="text-xs text-muted-foreground">Transaction reference</dt><dd className="mt-1 break-all font-mono text-sm">{success.ledgerTransactionId}</dd></div><div><dt className="text-xs text-muted-foreground">Posted at</dt><dd className="mt-1">{formatTimestamp(success.receipt.receiptTimestamp)}</dd></div><div><dt className="text-xs text-muted-foreground">Wallet balance</dt><dd className="mt-1">{wallet ? formatSatang(wallet.balanceSatang) : "Could not refresh"}</dd></div></dl><div className="flex flex-wrap gap-2">{success.receipt.repaymentIds[0] ? <Link className={buttonVariants({ variant: "outline" })} href={`/borrower/repayments/${success.receipt.repaymentIds[0]}/receipt`}>Open receipt</Link> : null}<Link className={buttonVariants({ variant: "outline" })} href="/borrower/loans">View loans</Link></div><ul className="grid gap-2 text-sm">{success.receipt.repayments.map((row) => <li key={row.repaymentId} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/50 p-3"><span>Installment {row.installmentNumber}: principal {formatSatang(row.principalSatang)}, interest {formatSatang(row.interestSatang)}</span><span className="font-semibold">{formatSatang(row.totalSatang)}</span></li>)}</ul></CardContent></Card> : null}
    {uncertain && pendingRequest ? <Card className="border-warning/30"><CardHeader><CardTitle className="text-base">Repayment result needs checking</CardTitle><CardDescription>The request for {formatSatang(pendingRequest.amountSatang)} may have reached the server. Check recent repayment history before deciding whether to retry.</CardDescription></CardHeader><CardContent className="grid gap-4"><Button variant="outline" disabled={checkingHistory} onClick={() => void checkHistory()}>{checkingHistory ? <LoaderCircle className="size-4 animate-spin"/> : <RefreshCw className="size-4"/>}Check repayment history</Button>{historyChecked ? <div className="grid gap-3"><p className="text-sm text-muted-foreground">{recentHistory.length ? "Recent repayment rows for this loan are shown below. Compare the posted amount and time before retrying." : "No recent repayment rows were found. This does not prove the request failed."}</p>{recentHistory.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"><span>{formatTimestamp(item.receivedAt)} · {formatDashboardStatus(item.status)} · transaction {item.ledgerTransactionId}</span><span className="font-semibold">{formatSatang(item.totalSatang)}</span><Link className="text-primary underline" href={`/borrower/repayments/${item.id}/receipt`}>Receipt</Link></div>)}<Button disabled={busy} onClick={() => void postRequest(pendingRequest)}>{busy ? <LoaderCircle className="size-4 animate-spin"/> : null}Retry same request safely</Button></div> : null}</CardContent></Card> : null}
    <div className="grid gap-4 md:grid-cols-3"><Card><CardHeader><CardDescription>Outstanding obligation</CardDescription><CardTitle className="text-xl">{loan.outstandingBalanceSatang === null ? "Schedule pending" : formatSatang(loan.outstandingBalanceSatang)}</CardTitle></CardHeader></Card><Card><CardHeader><CardDescription>Currently payable</CardDescription><CardTitle className="text-xl">{formatSatang(payable.payableAmountSatang)}</CardTitle></CardHeader></Card><Card><CardHeader><CardDescription>Installments due</CardDescription><CardTitle className="text-xl">{payable.installments.length}</CardTitle><CardDescription>{overdueInstallments.length} overdue</CardDescription></CardHeader></Card></div>
    {payable.installments.length ? <Card><CardHeader><CardTitle>Installments currently payable</CardTitle><CardDescription>Due amounts and statuses come from the payable summary service.</CardDescription></CardHeader><CardContent><div className="grid gap-3">{payable.installments.map((item) => <div key={item.installmentId} className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Installment {item.installmentNumber}</p><p className="mt-1 text-sm text-muted-foreground">Due {formatDashboardDate(item.dueDate)} · remaining principal {formatSatang(item.remainingPrincipalSatang)} · interest {formatSatang(item.remainingInterestSatang)}</p></div><div className="flex items-center gap-3"><Badge variant={item.status === "OVERDUE" ? "warning" : item.status === "PAID" ? "success" : "secondary"}>{formatDashboardStatus(item.status)}</Badge><span className="font-semibold">{formatSatang(item.remainingBalanceSatang)}</span></div></div>)}</div></CardContent></Card> : null}
    {payable.payableAmountSatang === "0" ? <Notice variant="warning">{loan.status === "REPAID" ? "This loan is fully repaid." : "There are no installments currently due. Early repayment is not available; try again after the next due date."}</Notice> : null}
    {schedule?.installments.length ? <Card><CardHeader><CardTitle>Schedule status</CardTitle><CardDescription>Current installment statuses are displayed as persisted by the schedule service.</CardDescription></CardHeader><CardContent><div className="flex flex-wrap gap-2">{schedule.installments.filter((item) => item.status === "OVERDUE").map((item) => <Badge key={item.id} variant="warning">Installment {item.installmentNumber} overdue</Badge>)}{!schedule.installments.some((item) => item.status === "OVERDUE") ? <p className="text-sm text-muted-foreground">No overdue installments are marked in the current schedule.</p> : null}</div></CardContent></Card> : null}
    <Card><CardHeader><CardTitle>Repayment amount</CardTitle><CardDescription>Enter a THB amount up to the currently payable amount. The backend determines the final allocation.</CardDescription></CardHeader><CardContent><form className="grid gap-4" onSubmit={openConfirmation} noValidate><label className="grid max-w-sm gap-1.5 text-sm font-medium" htmlFor="repayment-amount">Amount (THB)<input id="repayment-amount" className="h-11 rounded-md border border-border bg-background px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} disabled={uncertain || busy} aria-invalid={Boolean(amountError)} aria-describedby={amountError ? "repayment-amount-error" : undefined} onBlur={() => setTouched(true)} onChange={(event) => { setAmount(event.target.value); setSuccess(null); setError(null); }} /></label>{amountError ? <p id="repayment-amount-error" className="text-sm text-destructive" role="alert">{amountError}</p> : null}<p className="text-xs text-muted-foreground">Amounts are entered in THB with up to two decimal places. The backend allocates to the oldest payable installments, interest first.</p><Button type="submit" className="w-full sm:w-fit" disabled={busy || uncertain || initialLoading || payable.payableAmountSatang === "0" || validation.code !== null}>Review repayment</Button></form></CardContent></Card>
    {confirming ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setConfirming(false); }}><section role="dialog" aria-modal="true" aria-labelledby="repayment-confirm-title" aria-describedby="repayment-confirm-description" className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xl"><h2 id="repayment-confirm-title" className="text-lg font-semibold">Confirm repayment</h2><p id="repayment-confirm-description" className="mt-2 text-sm text-muted-foreground">You are submitting {validation.amountSatang ? formatSatang(validation.amountSatang) : "—"} for loan {loan.id}. The backend will verify the current payable amount and post the final allocation.</p><dl className="mt-4 grid gap-3 rounded-lg bg-muted/50 p-4 text-sm"><div className="flex justify-between gap-3"><dt>Amount payable</dt><dd className="font-semibold">{formatSatang(payable.payableAmountSatang)}</dd></div><div className="flex justify-between gap-3"><dt>Installments affected</dt><dd className="font-semibold">{payable.installments.length}</dd></div></dl><div className="mt-5 flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Continue editing</Button><Button disabled={busy} onClick={() => void confirmSubmission()}>{busy ? <LoaderCircle className="size-4 animate-spin"/> : null}<WalletCards className="size-4"/>Confirm repayment</Button></div></section></div> : null}
  </main>;
}
