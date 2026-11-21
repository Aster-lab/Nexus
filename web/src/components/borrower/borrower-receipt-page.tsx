"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, FileCheck2 } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { formatDashboardStatus, formatSatang } from "../../lib/client/borrower-dashboard";
import { getApplicationErrorMessage } from "../../lib/client/borrower-applications";
import { loadBorrowerReceipt, type BorrowerReceipt } from "../../lib/client/borrower-receipts";

function formatReceiptTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(date);
}

export function BorrowerReceiptPage({ repaymentId }: { repaymentId: string }) {
  const [receipt, setReceipt] = useState<BorrowerReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadBorrowerReceipt(repaymentId);
      setReceipt(result.data);
      setError(null);
    } catch (cause) {
      setError(getApplicationErrorMessage(cause));
    } finally { setLoading(false); }
  }, [repaymentId]);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  if (loading && !receipt) return <main className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-8 sm:px-6"><p role="status" aria-busy="true" className="text-sm text-muted-foreground">Loading receipt</p><div className="h-72 animate-pulse rounded-xl bg-muted"/></main>;
  if (!receipt) return <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6"><Card><CardContent className="grid justify-items-center gap-3 py-10 text-center"><AlertCircle className="size-8 text-destructive"/><h1 className="text-xl font-semibold">Receipt unavailable</h1><p role="alert" className="max-w-lg text-sm text-muted-foreground">{error ?? "We could not retrieve this receipt."}</p><div className="flex flex-wrap justify-center gap-2"><Button variant="outline" onClick={() => void refresh()}>Retry</Button><Link href="/borrower/repayments" className={buttonVariants({ variant: "outline" })}>Back to history</Link></div></CardContent></Card></main>;

  return <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-6 sm:px-6 sm:py-9 print:max-w-none print:px-0">
    <Link href="/borrower/repayments" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground print:hidden"><ArrowLeft className="size-4"/>Repayment history</Link>
    {error ? <div role="alert" className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm">{error}</div> : null}
    <Card className="overflow-hidden border-primary/20"><div className="h-1.5 bg-primary"/><CardHeader className="gap-3 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary"><FileCheck2 className="size-5"/></div><div><p className="text-sm font-medium text-primary">NEXUS repayment receipt</p><CardTitle className="mt-1 break-all text-xl sm:text-2xl">{receipt.receiptId}</CardTitle></div></div><Badge variant={receipt.status === "POSTED" ? "success" : "secondary"}><CheckCircle2 className="mr-1 size-3.5"/>{formatDashboardStatus(receipt.status)}</Badge></div><CardDescription>Receipt assembled from persisted repayment rows and the linked posted ledger transaction.</CardDescription></CardHeader><CardContent className="grid gap-7 sm:px-8 sm:pb-8">
      <section><h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Payment details</h2><dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Borrower</dt><dd className="mt-1 font-medium">{receipt.borrower.legalName}</dd></div><div><dt className="text-xs text-muted-foreground">Loan reference</dt><dd className="mt-1 break-all font-medium"><Link className="text-primary underline" href={`/borrower/loans/${receipt.loanId}`}>{receipt.loanId}</Link></dd></div><div><dt className="text-xs text-muted-foreground">Repayment date</dt><dd className="mt-1 font-medium">{formatReceiptTimestamp(receipt.repaymentDate)}</dd></div><div><dt className="text-xs text-muted-foreground">Transaction status</dt><dd className="mt-1 font-medium">{formatDashboardStatus(receipt.status)}</dd></div><div><dt className="text-xs text-muted-foreground">Ledger transaction</dt><dd className="mt-1 break-all font-mono text-xs">{receipt.ledgerTransactionId}</dd></div></dl></section>
      <section><h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Amount received</h2><div className="mt-3 grid gap-3 rounded-xl bg-muted/40 p-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Total repayment</p><p className="mt-1 text-xl font-bold">{formatSatang(receipt.totalReceivedSatang)}</p></div><div><p className="text-xs text-muted-foreground">Principal portion</p><p className="mt-1 text-lg font-semibold">{formatSatang(receipt.principalSatang)}</p></div><div><p className="text-xs text-muted-foreground">Interest portion</p><p className="mt-1 text-lg font-semibold">{formatSatang(receipt.interestSatang)}</p></div></div></section>
      <section><h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Installment allocation</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] border-collapse text-left text-sm"><caption className="sr-only">Installment allocations for receipt {receipt.receiptId}</caption><thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">{["Repayment reference", "Installment", "Principal", "Interest", "Amount received", "Remaining balance"].map((label) => <th key={label} scope="col" className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{receipt.repayments.map((row) => <tr key={row.repaymentId} className="border-b border-border last:border-0"><th scope="row" className="max-w-40 break-all px-3 py-3 font-mono text-xs">{row.repaymentId}</th><td className="px-3 py-3">{row.installmentNumber}</td><td className="whitespace-nowrap px-3 py-3">{formatSatang(row.principalSatang)}</td><td className="whitespace-nowrap px-3 py-3">{formatSatang(row.interestSatang)}</td><td className="whitespace-nowrap px-3 py-3 font-semibold">{formatSatang(row.totalSatang)}</td><td className="whitespace-nowrap px-3 py-3">{formatSatang(row.remainingBalanceSatang)}</td></tr>)}</tbody></table></div></section>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-xs text-muted-foreground">Receipt timestamp: {formatReceiptTimestamp(receipt.receiptTimestamp)} · Currency: THB</p><Link href={`/borrower/loans/${receipt.loanId}`} className={buttonVariants({ variant: "outline" })}>View loan</Link></footer>
    </CardContent></Card>
  </main>;
}
