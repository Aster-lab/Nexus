"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CalendarClock, RefreshCw, WalletCards } from "lucide-react";
import { ApiClientError, apiGet } from "../../lib/client/api-client";
import { loadBorrowerPayable, type BorrowerPayableSummary } from "../../lib/client/borrower-repayments";
import { formatDashboardDate, formatSatang } from "../../lib/client/borrower-dashboard";
import type { BorrowerDashboardSummary } from "../../lib/client/borrower-dashboard";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

interface RepaymentLoanOption {
  loanId: string;
  outstandingBalanceSatang: string;
  nextDueDate: string | null;
  payable: BorrowerPayableSummary | null;
  error: string | null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : "We could not load repayment information. Please retry.";
}

export function BorrowerRepaymentCenter() {
  const [loans, setLoans] = useState<RepaymentLoanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiGet<BorrowerDashboardSummary>("/api/borrower/dashboard");
      const results = await Promise.all(response.data.activeLoans.map(async (loan): Promise<RepaymentLoanOption> => {
        try {
          const payable = await loadBorrowerPayable(loan.loanId);
          return { ...loan, payable: payable.data, error: null };
        } catch (cause) {
          return { ...loan, payable: null, error: getErrorMessage(cause) };
        }
      }));
      setLoans(results);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  return <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-9">
    <header className="flex min-w-0 flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">Borrower workspace</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Make a repayment</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">Choose one of your active loans to see the current payable amount and continue to its secure repayment form. Payable amounts come from NEXUS.</p>
      </div>
      <Link href="/borrower/repayments" className={`${buttonVariants({ variant: "outline" })} w-fit shrink-0`}>Repayment history</Link>
    </header>

    {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><span>{error}</span><Button size="sm" variant="outline" onClick={() => void refresh()}><RefreshCw className="size-4" aria-hidden="true"/>Retry</Button></div> : null}

    {loading ? <div role="status" aria-busy="true" aria-label="Loading payable loans" className="grid gap-4 md:grid-cols-2"><div className="h-56 animate-pulse rounded-xl bg-muted"/><div className="h-56 animate-pulse rounded-xl bg-muted"/></div> : null}

    {!loading && !error && loans.length === 0 ? <Card><CardContent className="grid justify-items-center gap-3 py-12 text-center">
      <WalletCards className="size-9 text-muted-foreground" aria-hidden="true"/><h2 className="text-lg font-semibold">No active loans to repay</h2>
      <p className="max-w-md text-sm text-muted-foreground">Loans with a repayment schedule will appear here after disbursement.</p>
      <Link href="/borrower/loans" className={buttonVariants({ variant: "outline" })}>View loans</Link>
    </CardContent></Card> : null}

    {loans.length > 0 ? <section aria-labelledby="repayment-loans-heading" className="grid gap-4">
      <div><h2 id="repayment-loans-heading" className="text-lg font-semibold">Your active loans</h2><p className="text-sm text-muted-foreground">Review the backend-confirmed payable amount for each loan. This amount can change as due dates pass or repayments post.</p></div>
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">{loans.map((loan) => {
        const payableAmount = loan.payable?.payableAmountSatang ?? null;
        const hasPayableAmount = payableAmount !== null && BigInt(payableAmount) > 0n;
        return <Card key={loan.loanId} className="min-w-0">
          <CardHeader><CardDescription>Loan reference</CardDescription><CardTitle className="break-all text-base">{loan.loanId}</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid grid-cols-2 gap-4">
              <div><dt className="text-xs text-muted-foreground">Outstanding obligation</dt><dd className="mt-1 font-semibold tabular-nums">{formatSatang(loan.outstandingBalanceSatang)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Currently payable</dt><dd className="mt-1 font-semibold tabular-nums">{payableAmount === null ? "Unavailable" : formatSatang(payableAmount)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Next installment</dt><dd className="mt-1 flex items-center gap-1 text-sm"><CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/>{formatDashboardDate(loan.nextDueDate)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Installments payable</dt><dd className="mt-1 font-medium">{loan.payable ? loan.payable.installments.length : "Unavailable"}</dd></div>
            </dl>
            {loan.error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Payable amount could not be loaded. {loan.error}</p> : null}
            <div className="flex min-w-0 flex-col gap-2">
              {hasPayableAmount ? <Link href={`/borrower/loans/${loan.loanId}/repay`} className={`${buttonVariants()} w-full min-w-0 whitespace-normal`}>Continue to repayment<ArrowRight className="size-4 shrink-0" aria-hidden="true"/></Link> : <Button type="button" disabled className="w-full min-w-0 whitespace-normal">{payableAmount === null ? "Payable amount unavailable" : "Nothing payable yet"}</Button>}
              <Link href={`/borrower/loans/${loan.loanId}`} className={`${buttonVariants({ variant: "outline" })} w-full`}>View schedule</Link>
            </div>
          </CardContent>
        </Card>;
      })}</div>
    </section> : null}
  </main>;
}
