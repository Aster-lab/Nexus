"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, FileText, RefreshCw } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { formatDashboardStatus, formatSatang } from "../../lib/client/borrower-dashboard";
import { getApplicationErrorMessage } from "../../lib/client/borrower-applications";
import { loadBorrowerRepaymentHistoryPage, type BorrowerRepaymentHistoryItem } from "../../lib/client/borrower-repayments";
import { canOpenBorrowerReceipt } from "../../lib/client/borrower-receipts";
import type { ApiPagination } from "../../lib/client/api-client";

function formatRepaymentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function BorrowerRepaymentHistoryPage() {
  const [rows, setRows] = useState<BorrowerRepaymentHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<ApiPagination>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadBorrowerRepaymentHistoryPage(page);
      setRows(result.data);
      setPagination(result.pagination);
      setError(null);
    } catch (cause) {
      setError(getApplicationErrorMessage(cause));
    } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  return <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-9">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">Borrower workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Repayment history</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Review repayment records and open receipts for posted transactions.</p></div><div className="flex flex-wrap gap-2"><Link href="/borrower/repayments/make" className={buttonVariants()}>Make a repayment</Link><Link href="/borrower/loans" className={buttonVariants({ variant: "outline" })}>View loans</Link></div></header>
    {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><span>{error}</span><Button size="sm" variant="outline" onClick={() => void refresh()}><RefreshCw className="size-4"/>Retry</Button></div> : null}
    {loading && rows.length === 0 ? <div role="status" aria-busy="true" aria-label="Loading repayment history" className="h-64 animate-pulse rounded-xl bg-muted"/> : null}
    {!loading && !error && rows.length === 0 ? <Card><CardContent className="grid justify-items-center gap-3 py-12 text-center"><FileText className="size-9 text-muted-foreground"/><h2 className="text-lg font-semibold">No repayments yet</h2><p className="max-w-md text-sm text-muted-foreground">Posted repayments will appear here with their installment breakdown and receipt availability.</p><Link href="/borrower/loans" className={buttonVariants({ variant: "outline" })}>View loans</Link></CardContent></Card> : null}
    {rows.length > 0 ? <Card><CardHeader><CardTitle>Repayment records</CardTitle><CardDescription>Each row is a persisted repayment allocation. Rows from one submission may share a transaction and receipt.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[900px] border-collapse text-left text-sm"><caption className="sr-only">Borrower repayment history</caption><thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">{["Repayment reference", "Loan reference", "Repayment date", "Amount paid", "Principal", "Interest", "Status", "Receipt"].map((label) => <th key={label} scope="col" className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{rows.map((row) => { const receiptAvailable = canOpenBorrowerReceipt(row); return <tr key={row.id} className="border-b border-border last:border-0"><th scope="row" className="max-w-44 break-all px-3 py-3 font-mono text-xs">{row.id}</th><td className="max-w-44 break-all px-3 py-3"><Link className="text-primary underline" href={`/borrower/loans/${row.loanId}`}>{row.loanId}</Link></td><td className="whitespace-nowrap px-3 py-3">{formatRepaymentDate(row.receivedAt)}</td><td className="whitespace-nowrap px-3 py-3 font-semibold">{formatSatang(row.totalSatang)}</td><td className="whitespace-nowrap px-3 py-3">{formatSatang(row.principalSatang)}</td><td className="whitespace-nowrap px-3 py-3">{formatSatang(row.interestSatang)}</td><td className="px-3 py-3"><Badge variant={row.status === "POSTED" ? "success" : "secondary"}>{formatDashboardStatus(row.status)}</Badge></td><td className="px-3 py-3">{receiptAvailable ? <Link className="inline-flex items-center gap-1 font-semibold text-primary hover:underline" href={`/borrower/repayments/${row.id}/receipt`}>Open receipt <ArrowRight className="size-4"/></Link> : <span className="text-muted-foreground">Unavailable</span>}</td></tr>; })}</tbody></table></div></CardContent></Card> : null}
    {pagination && pagination.totalPages > 1 ? <nav aria-label="Repayment history pages" className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Page {page} of {pagination.totalPages}</p><div className="flex gap-2"><Button variant="outline" disabled={!pagination.hasPreviousPage || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button variant="outline" disabled={!pagination.hasNextPage || loading} onClick={() => setPage((value) => value + 1)}>Next</Button></div></nav> : null}
  </main>;
}
