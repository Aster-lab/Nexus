"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Landmark, RefreshCw } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { formatDashboardDate, formatDashboardStatus, formatSatang } from "../../lib/client/borrower-dashboard";
import { DEFAULT_BORROWER_LOANS_PAGE_SIZE, hasBorrowerLoans, loadBorrowerLoans, type BorrowerLoan } from "../../lib/client/borrower-loans";
import { getApplicationErrorMessage } from "../../lib/client/borrower-applications";
import type { ApiPagination } from "../../lib/client/api-client";

export function BorrowerLoanList() {
  const [loans, setLoans] = useState<BorrowerLoan[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<ApiPagination>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await loadBorrowerLoans({ page, limit: DEFAULT_BORROWER_LOANS_PAGE_SIZE, sortOrder: "desc" });
      setLoans(response.data);
      setPagination(response.pagination);
      setError(null);
    } catch (cause) {
      setError(getApplicationErrorMessage(cause));
    } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  return <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-9">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">Borrower workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Your loans</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Track each loan, the remaining principal, and its repayment schedule.</p></div><Link className={buttonVariants({ variant: "outline" })} href="/borrower/offers">Review offers</Link></header>
    {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><span>{error}</span><Button size="sm" variant="outline" onClick={() => void refresh()}><RefreshCw className="size-4"/>Retry</Button></div> : null}
    {loading && loans.length === 0 ? <div aria-busy="true" aria-label="Loading loans" className="grid gap-4 md:grid-cols-2"><div className="h-56 animate-pulse rounded-xl bg-muted"/><div className="h-56 animate-pulse rounded-xl bg-muted"/></div> : null}
    {!loading && !error && !hasBorrowerLoans(loans, pagination) ? <Card><CardContent className="grid justify-items-center gap-3 py-12 text-center"><Landmark className="size-9 text-muted-foreground"/><h2 className="text-lg font-semibold">No loans yet</h2><p className="max-w-md text-sm text-muted-foreground">Loans created after offer acceptance will appear here.</p><Link className={buttonVariants({ variant: "outline" })} href="/borrower/offers">Review offers</Link></CardContent></Card> : null}
    {loans.length ? <div className="grid gap-4 md:grid-cols-2">{loans.map((loan) => <Card key={loan.id} className="flex flex-col"><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardDescription>Loan reference</CardDescription><CardTitle className="mt-1 break-all text-base">{loan.id}</CardTitle></div><Badge variant={loan.status === "REPAID" ? "success" : loan.status === "DELINQUENT" ? "warning" : "secondary"}>{formatDashboardStatus(loan.status)}</Badge></div></CardHeader><CardContent className="flex flex-1 flex-col gap-4"><dl className="grid grid-cols-2 gap-4"><div><dt className="text-xs text-muted-foreground">Original principal</dt><dd className="mt-1 font-semibold">{formatSatang(loan.originalPrincipalSatang)}</dd></div><div><dt className="text-xs text-muted-foreground">Outstanding principal</dt><dd className="mt-1 font-semibold">{loan.outstandingPrincipalSatang === null ? "Schedule pending" : formatSatang(loan.outstandingPrincipalSatang)}</dd></div><div><dt className="text-xs text-muted-foreground">Interest rate</dt><dd className="mt-1 font-semibold">{(Number(loan.annualInterestRate) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}% p.a.</dd></div><div><dt className="text-xs text-muted-foreground">Term</dt><dd className="mt-1 font-semibold">{loan.termMonths} months</dd></div></dl><p className="text-sm text-muted-foreground">Disbursed {formatDashboardDate(loan.disbursedAt)}</p><Link href={`/borrower/loans/${loan.id}`} className={`${buttonVariants({ variant: "outline" })} mt-auto w-full`}>Loan details and schedule <ArrowRight className="size-4"/></Link></CardContent></Card>)}</div> : null}
    {pagination && pagination.totalPages > 1 ? <nav aria-label="Loan pages" className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Page {page} of {pagination.totalPages}</p><div className="flex gap-2"><Button variant="outline" disabled={!pagination.hasPreviousPage || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button variant="outline" disabled={!pagination.hasNextPage || loading} onClick={() => setPage((value) => value + 1)}>Next</Button></div></nav> : null}
  </main>;
}
