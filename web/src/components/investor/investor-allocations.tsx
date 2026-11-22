"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, RefreshCw, Scale } from "lucide-react";
import { getApplicationErrorMessage } from "../../lib/client/borrower-applications";
import type { ApiPagination } from "../../lib/client/api-client";
import { formatDashboardDate, formatDashboardStatus, formatSatang } from "../../lib/client/borrower-dashboard";
import {
  DEFAULT_INVESTOR_ALLOCATIONS_PAGE_SIZE,
  hasInvestorAllocations,
  loadInvestorAllocations,
  type InvestorAllocationRecord,
} from "../../lib/client/investor-allocations";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

type LoadStatus = "loading" | "success" | "error";

export function InvestorAllocationHistoryPage({ initialAllocations, initialStatus = "loading", initialError }: {
  initialAllocations?: InvestorAllocationRecord[];
  initialStatus?: LoadStatus;
  initialError?: string;
}) {
  const [allocations, setAllocations] = useState<InvestorAllocationRecord[]>(initialAllocations ?? []);
  const [status, setStatus] = useState<LoadStatus>(initialStatus);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [pagination, setPagination] = useState<ApiPagination>();

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await loadInvestorAllocations({ page, limit: DEFAULT_INVESTOR_ALLOCATIONS_PAGE_SIZE, sortOrder });
      setAllocations(response.data);
      setPagination(response.pagination);
      setError(null);
      setStatus("success");
    } catch (cause) {
      setError(getApplicationErrorMessage(cause));
      setStatus("error");
    }
  }, [page, sortOrder]);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  return <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 sm:py-9">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-primary">Investor workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Repayment allocations</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">See how borrower repayments are shared across your investments. An allocation is not a wallet credit; completed payouts appear separately.</p></div><div className="flex gap-2"><Button variant="outline" disabled={status === "loading"} onClick={() => void refresh()}><RefreshCw className={`size-4 ${status === "loading" ? "animate-spin" : ""}`}/>Refresh</Button><Link href="/investor/portfolio" className={buttonVariants({ variant: "outline" })}>View portfolio</Link></div></header>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{pagination ? `${pagination.total} allocations` : "Repayment allocation history"}</p><label className="flex items-center gap-2 text-sm">Sort by date<select className="h-10 rounded-md border border-input bg-background px-3" value={sortOrder} onChange={(event) => { setPage(1); setSortOrder(event.target.value as "asc" | "desc"); }}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label></div>
    {status === "error" ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><span>{error}</span><Button size="sm" variant="outline" onClick={() => void refresh()}><RefreshCw className="size-4"/>Retry</Button></div> : null}
    {status === "loading" && allocations.length === 0 ? <div role="status" aria-busy="true" aria-label="Loading repayment allocations" className="h-64 animate-pulse rounded-xl bg-muted"/> : null}
    {status === "loading" && allocations.length > 0 ? <p role="status" aria-live="polite">Refreshing allocation history</p> : null}
    {status === "success" && !hasInvestorAllocations(allocations, pagination) ? <Card><CardContent className="grid justify-items-center gap-3 py-12 text-center"><Scale className="size-9 text-muted-foreground"/><h2 className="text-lg font-semibold">No repayment allocations yet</h2><p className="max-w-lg text-sm text-muted-foreground">Allocations will appear here after a borrower makes a repayment on one of your investments.</p><Link href="/investor/portfolio" className={buttonVariants({ variant: "outline" })}>View portfolio</Link></CardContent></Card> : null}
    {allocations.length > 0 ? <Card><CardHeader><CardTitle>Allocation records</CardTitle><CardDescription>Amounts are provided by NEXUS and shown as recorded. Payouts appear separately once complete.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[1100px] border-collapse text-left text-sm"><caption className="sr-only">Investor repayment allocation history</caption><thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">{["Allocation reference", "Investment", "Loan", "Repayment", "Allocation date", "Principal", "Interest", "Recovery", "Method", "Payout"].map((label) => <th key={label} scope="col" className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{allocations.map((allocation) => <AllocationRow key={allocation.id} allocation={allocation}/>)}</tbody></table></div></CardContent></Card> : null}
    {pagination && pagination.totalPages > 1 ? <nav aria-label="Allocation history pages" className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Page {page} of {pagination.totalPages}</p><div className="flex gap-2"><Button variant="outline" disabled={!pagination.hasPreviousPage || status === "loading"} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button variant="outline" disabled={!pagination.hasNextPage || status === "loading"} onClick={() => setPage((value) => value + 1)}>Next</Button></div></nav> : null}
  </main>;
}

function AllocationRow({ allocation }: { allocation: InvestorAllocationRecord }) {
  const payout = allocation.investorPayout;
  const credited = payout?.status === "COMPLETED" && Boolean(payout.ledgerTransactionId);
  return <tr className="border-b border-border last:border-0 align-top"><th scope="row" className="max-w-40 break-all px-3 py-3 font-mono text-xs">{allocation.id}</th><td className="max-w-40 break-all px-3 py-3"><Link href={`/investor/investments/${allocation.investmentId}`} className="inline-flex items-center gap-1 text-primary underline">{allocation.investmentId}<ArrowRight className="size-3.5"/></Link></td><td className="max-w-40 break-all px-3 py-3">{allocation.repayment.loanId}</td><td className="max-w-40 break-all px-3 py-3"><span className="font-mono text-xs">{allocation.repaymentId}</span><Badge className="mt-1" variant={allocation.repayment.status === "POSTED" ? "success" : "secondary"}>{formatDashboardStatus(allocation.repayment.status)}</Badge></td><td className="whitespace-nowrap px-3 py-3">{formatDashboardDate(allocation.createdAt)}</td><td className="whitespace-nowrap px-3 py-3">{formatSatang(allocation.principalSatang)}</td><td className="whitespace-nowrap px-3 py-3">{formatSatang(allocation.interestSatang)}</td><td className="whitespace-nowrap px-3 py-3">{formatSatang(allocation.recoverySatang)}</td><td className="px-3 py-3">{formatDashboardStatus(allocation.allocationMethod)}</td><td className="px-3 py-3">{payout ? <><Badge variant={credited ? "success" : payout.status === "FAILED" ? "warning" : "secondary"}>{formatDashboardStatus(payout.status)}</Badge><p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">{credited ? "Credited to wallet" : "Not credited to wallet"}</p></> : <span className="text-muted-foreground">Not paid out</span>}</td></tr>;
}
