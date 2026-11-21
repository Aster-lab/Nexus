"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertCircle, ArrowLeft, CalendarDays, RefreshCw } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { formatDashboardDate, formatDashboardStatus, formatSatang } from "../../lib/client/borrower-dashboard";
import { getApplicationErrorMessage } from "../../lib/client/borrower-applications";
import { loadBorrowerLoan, loadBorrowerSchedule, type BorrowerLoanDetails, type BorrowerRepaymentSchedule } from "../../lib/client/borrower-loans";

function SummaryItem({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-foreground">{children ?? "—"}</dd></div>;
}

function Money({ value }: { value: string | null }) {
  return <>{value === null ? "Not available yet" : formatSatang(value)}</>;
}

export function BorrowerLoanDetailsPage({ loanId }: { loanId: string }) {
  const [loan, setLoan] = useState<BorrowerLoanDetails | null>(null);
  const [schedule, setSchedule] = useState<BorrowerRepaymentSchedule | null>(null);
  const [loanLoading, setLoanLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [loanError, setLoanError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const refreshSchedule = useCallback(async () => {
    setScheduleLoading(true);
    try {
      const result = await loadBorrowerSchedule(loanId);
      setSchedule(result.data);
      setScheduleError(null);
    } catch (cause) {
      setScheduleError(getApplicationErrorMessage(cause));
    } finally { setScheduleLoading(false); }
  }, [loanId]);

  const refreshLoan = useCallback(async () => {
    setLoanLoading(true);
    try {
      const result = await loadBorrowerLoan(loanId);
      setLoan(result.data);
      setLoanError(null);
      if (result.data.disbursedAt) {
        await refreshSchedule();
      } else {
        setSchedule(null);
        setScheduleError(null);
      }
    } catch (cause) {
      setLoanError(getApplicationErrorMessage(cause));
    } finally { setLoanLoading(false); }
  }, [loanId, refreshSchedule]);

  useEffect(() => { queueMicrotask(() => { void refreshLoan(); }); }, [refreshLoan]);

  if (loanLoading && !loan) return <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-8 sm:px-6"><div className="h-8 w-1/3 animate-pulse rounded bg-muted"/><div className="h-60 animate-pulse rounded-xl bg-muted"/></main>;
  if (!loan) return <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6"><Card><CardContent className="grid justify-items-center gap-3 py-10 text-center"><AlertCircle className="size-8 text-destructive"/><h1 className="text-xl font-semibold">Loan unavailable</h1><p role="alert" className="max-w-lg text-sm text-muted-foreground">{loanError ?? "We could not load this loan."}</p><div className="flex gap-2"><Button variant="outline" onClick={() => void refreshLoan()}>Retry</Button><Link href="/borrower/loans" className={buttonVariants({ variant: "outline" })}>Back to loans</Link></div></CardContent></Card></main>;

  const statusVariant = loan.status === "REPAID" ? "success" : loan.status === "DELINQUENT" ? "warning" : "secondary";

  return <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-9">
    <Link href="/borrower/loans" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4"/>All loans</Link>
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm text-muted-foreground">Loan reference</p><h1 className="mt-1 break-all text-2xl font-bold tracking-tight sm:text-3xl">{loan.id}</h1><p className="mt-2 text-sm text-muted-foreground">Opened {formatDashboardDate(loan.disbursedAt ?? loan.createdAt)}</p></div><div className="flex items-center gap-3"><Badge variant={statusVariant}>{formatDashboardStatus(loan.status)}</Badge>{loan.disbursedAt && (loan.status === "ACTIVE" || loan.status === "DELINQUENT") ? <Link href={`/borrower/loans/${loan.id}/repay`} className={buttonVariants()}>Make repayment</Link> : null}</div></header>
    {loanError ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{loanError}</div> : null}
    <Card><CardHeader><CardTitle>Loan summary</CardTitle><CardDescription>Balances and dates are returned by the loan service from the current persisted schedule.</CardDescription></CardHeader><CardContent><dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3"><SummaryItem label="Original principal"><Money value={loan.originalPrincipalSatang}/></SummaryItem><SummaryItem label="Outstanding principal"><Money value={loan.outstandingPrincipalSatang}/></SummaryItem><SummaryItem label="Outstanding balance"><Money value={loan.outstandingBalanceSatang}/></SummaryItem><SummaryItem label="Principal paid"><Money value={loan.paidPrincipalSatang}/></SummaryItem><SummaryItem label="Interest paid"><Money value={loan.paidInterestSatang}/></SummaryItem><SummaryItem label="Total paid"><Money value={loan.totalPaidSatang}/></SummaryItem><SummaryItem label="Annual interest rate">{(Number(loan.annualInterestRate) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}% p.a.</SummaryItem><SummaryItem label="Term">{loan.termMonths} months</SummaryItem><SummaryItem label="Loan status">{formatDashboardStatus(loan.status)}</SummaryItem><SummaryItem label="Disbursement date">{formatDashboardDate(loan.disbursedAt)}</SummaryItem><SummaryItem label="Maturity date">{formatDashboardDate(loan.maturityDate)}</SummaryItem><SummaryItem label="Installments">{loan.installmentCount || "Schedule pending"}</SummaryItem></dl></CardContent></Card>
    <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><CalendarDays className="size-5 text-primary"/>Repayment schedule</CardTitle><CardDescription>Schedule dates, amounts, and statuses come from the current backend schedule version. Due date is the scheduled payment date in the stored schedule.</CardDescription></div>{loan.disbursedAt ? <Button variant="outline" size="sm" disabled={scheduleLoading} onClick={() => void refreshSchedule()}><RefreshCw className={`size-4 ${scheduleLoading ? "animate-spin" : ""}`}/>Refresh</Button> : null}</div></CardHeader><CardContent>
      {!loan.disbursedAt ? <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">A repayment schedule will be available after the loan is disbursed.</p> : null}
      {scheduleLoading && !schedule ? <div aria-busy="true" aria-label="Loading repayment schedule" className="h-40 animate-pulse rounded-lg bg-muted"/> : null}
      {scheduleError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><span>{scheduleError}</span><Button size="sm" variant="outline" onClick={() => void refreshSchedule()}>Retry schedule</Button></div> : null}
      {schedule && schedule.installments.length === 0 ? <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">The backend schedule has no installments.</p> : null}
      {schedule && schedule.installments.length > 0 ? <div className="overflow-x-auto"><table className="w-full min-w-[1050px] border-collapse text-left text-sm"><caption className="sr-only">Repayment schedule for loan {loan.id}</caption><thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">{["Installment", "Due / scheduled date", "Opening principal", "Interest", "Principal", "Total due", "Paid", "Remaining", "Last payment", "Status"].map((label) => <th key={label} scope="col" className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{schedule.installments.map((installment) => <tr key={installment.id} className="border-b border-border last:border-0"><th scope="row" className="px-3 py-3 font-semibold">{installment.installmentNumber}</th><td className="whitespace-nowrap px-3 py-3">{formatDashboardDate(installment.dueDate)}</td><td className="whitespace-nowrap px-3 py-3">{formatSatang(installment.openingPrincipalSatang)}</td><td className="whitespace-nowrap px-3 py-3">{formatSatang(installment.interestDueSatang)}</td><td className="whitespace-nowrap px-3 py-3">{formatSatang(installment.principalDueSatang)}</td><td className="whitespace-nowrap px-3 py-3 font-semibold">{formatSatang(installment.totalDueSatang)}</td><td className="whitespace-nowrap px-3 py-3">{formatSatang(installment.paidAmountSatang)}</td><td className="whitespace-nowrap px-3 py-3">{formatSatang(installment.remainingAmountSatang)}</td><td className="whitespace-nowrap px-3 py-3">{formatDashboardDate(installment.lastPaidAt)}</td><td className="px-3 py-3"><Badge variant={installment.status === "PAID" ? "success" : installment.status === "OVERDUE" ? "warning" : "secondary"}>{formatDashboardStatus(installment.status)}</Badge></td></tr>)}</tbody></table></div> : null}
    </CardContent></Card>
  </main>;
}
