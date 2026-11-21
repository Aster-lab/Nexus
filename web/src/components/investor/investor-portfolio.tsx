"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, RefreshCw } from "lucide-react";
import { getApplicationErrorMessage } from "../../lib/client/borrower-applications";
import type { ApiPagination } from "../../lib/client/api-client";
import { formatDashboardDate, formatDashboardStatus, formatSatang } from "../../lib/client/borrower-dashboard";
import {
  DEFAULT_INVESTOR_PORTFOLIO_PAGE_SIZE,
  hasInvestorInvestments,
  loadInvestorInvestment,
  loadInvestorInvestments,
  type InvestorInvestmentListRecord,
  type InvestorInvestmentRecord,
} from "../../lib/client/investor-portfolio";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

type LoadStatus = "loading" | "success" | "error";

export function InvestorPortfolioPage({ initialInvestments, initialStatus = "loading", initialError }: {
  initialInvestments?: InvestorInvestmentListRecord[];
  initialStatus?: LoadStatus;
  initialError?: string;
}) {
  const [investments, setInvestments] = useState<InvestorInvestmentListRecord[]>(initialInvestments ?? []);
  const [status, setStatus] = useState<LoadStatus>(initialStatus);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [pagination, setPagination] = useState<ApiPagination>();

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await loadInvestorInvestments({ page, limit: DEFAULT_INVESTOR_PORTFOLIO_PAGE_SIZE, sortOrder });
      setInvestments(response.data);
      setPagination(response.pagination);
      setError(null);
      setStatus("success");
    } catch (cause) {
      setError(getApplicationErrorMessage(cause));
      setStatus("error");
    }
  }, [page, sortOrder]);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  return <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-9">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-primary">Investor workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Investment portfolio</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Review backend-confirmed investments and open each record to distinguish contributions, repayment allocations, and completed payouts.</p></div><Link href="/investor" className={buttonVariants({ variant: "outline" })}>Overview</Link></header>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{pagination ? `${pagination.total} investments` : "Your investment records"}</p><label className="flex items-center gap-2 text-sm">Sort by date<select className="h-10 rounded-md border border-input bg-background px-3" value={sortOrder} onChange={(event) => { setPage(1); setSortOrder(event.target.value as "asc" | "desc"); }}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label></div>
    {status === "error" ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><span>{error}</span><Button size="sm" variant="outline" onClick={() => void refresh()}><RefreshCw className="size-4"/>Retry</Button></div> : null}
    {status === "loading" && investments.length === 0 ? <div role="status" aria-busy="true" aria-label="Loading investments" className="grid gap-4 md:grid-cols-2"><div className="h-56 animate-pulse rounded-xl bg-muted"/><div className="h-56 animate-pulse rounded-xl bg-muted"/></div> : null}
    {status === "success" && !hasInvestorInvestments(investments, pagination) ? <Card><CardContent className="grid justify-items-center gap-3 py-12 text-center"><BriefcaseBusiness className="size-9 text-muted-foreground"/><h2 className="text-lg font-semibold">No investments yet</h2><p className="max-w-md text-sm text-muted-foreground">When you make a contribution to an eligible opportunity, the confirmed investment will appear here.</p><Link href="/investor/marketplace" className={buttonVariants({ variant: "outline" })}>Browse marketplace</Link></CardContent></Card> : null}
    {investments.length > 0 ? <div className="grid gap-4 md:grid-cols-2">{investments.map((investment) => <Card key={investment.id} className="flex flex-col"><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardDescription>Investment reference</CardDescription><CardTitle className="mt-1 break-all text-base">{investment.id}</CardTitle></div><Badge variant={investment.status === "CANCELLED" ? "warning" : "success"}>{formatDashboardStatus(investment.status)}</Badge></div></CardHeader><CardContent className="flex flex-1 flex-col gap-4"><dl className="grid grid-cols-2 gap-4"><Summary label="Posted contributions">{formatSatang(investment.totalContributedSatang)}</Summary><Summary label="Loan status">{formatDashboardStatus(investment.loan.status)}</Summary><Summary label="Loan reference">{investment.loan.id}</Summary><Summary label="Investment date">{formatDashboardDate(investment.createdAt)}</Summary></dl><Link href={`/investor/investments/${investment.id}`} className={`${buttonVariants({ variant: "outline" })} mt-auto w-full`}>Investment details <ArrowRight className="size-4"/></Link></CardContent></Card>)}</div> : null}
    {pagination && pagination.totalPages > 1 ? <nav aria-label="Investment portfolio pages" className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Page {page} of {pagination.totalPages}</p><div className="flex gap-2"><Button variant="outline" disabled={!pagination.hasPreviousPage || status === "loading"} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button variant="outline" disabled={!pagination.hasNextPage || status === "loading"} onClick={() => setPage((value) => value + 1)}>Next</Button></div></nav> : null}
  </main>;
}

export function InvestorInvestmentDetailsPage({ investmentId, initialInvestment, initialError }: { investmentId: string; initialInvestment?: InvestorInvestmentRecord; initialError?: string }) {
  const [investment, setInvestment] = useState<InvestorInvestmentRecord | null>(initialInvestment ?? null);
  const [loading, setLoading] = useState(!initialInvestment && !initialError);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [contributionPage, setContributionPage] = useState(1);
  const [allocationPage, setAllocationPage] = useState(1);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await loadInvestorInvestment(investmentId, undefined, signal, { contributionPage, allocationPage });
      setInvestment(response.data);
      setError(null);
    } catch (cause) {
      if (signal?.aborted) return;
      setInvestment(null);
      setError(getApplicationErrorMessage(cause));
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [investmentId, contributionPage, allocationPage]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { void refresh(controller.signal); });
    return () => controller.abort();
  }, [refresh]);

  if (loading && !investment) return <main className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-8 sm:px-6"><p role="status" aria-busy="true" className="text-sm text-muted-foreground">Loading investment details</p><div className="h-72 animate-pulse rounded-xl bg-muted"/></main>;
  if (!investment) return <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6"><Card><CardContent className="grid justify-items-center gap-3 py-10 text-center"><BriefcaseBusiness className="size-9 text-muted-foreground"/><h1 className="text-xl font-semibold">Investment unavailable</h1><p role="alert" className="max-w-lg text-sm text-muted-foreground">{error ?? "We could not load this investment."}</p><div className="flex gap-2"><Button variant="outline" onClick={() => void refresh()}>Retry</Button><Link href="/investor/portfolio" className={buttonVariants({ variant: "outline" })}>Back to portfolio</Link></div></CardContent></Card></main>;

  return <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-6 sm:px-6 sm:py-9"><Link href="/investor/portfolio" className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4"/>Portfolio</Link>
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm text-muted-foreground">Investment reference</p><h1 className="mt-1 break-all text-2xl font-bold tracking-tight sm:text-3xl">{investment.id}</h1><p className="mt-2 text-sm text-muted-foreground">Invested {formatDashboardDate(investment.createdAt)}</p></div><Badge variant={investment.status === "CANCELLED" ? "warning" : "success"}>{formatDashboardStatus(investment.status)}</Badge></header>
    <Card><CardHeader><CardTitle>Investment and loan</CardTitle><CardDescription>Contribution amount includes persisted rows linked to posted transactions. Loan terms and status are backend-provided.</CardDescription></CardHeader><CardContent><dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3"><Summary label="Posted contributions">{formatSatang(investment.totalContributedSatang)}</Summary><Summary label="Loan reference">{investment.loan.id}</Summary><Summary label="Loan status">{formatDashboardStatus(investment.loan.status)}</Summary><Summary label="Loan principal">{formatSatang(investment.loan.principalSatang)}</Summary><Summary label="Annual interest rate">{(Number(investment.loan.annualInterestRate) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}% p.a.</Summary><Summary label="Loan term">{investment.loan.termMonths} months</Summary></dl></CardContent></Card>

    <Card><CardHeader><CardTitle>Contributions</CardTitle><CardDescription>Posted wallet debits that funded this investment.</CardDescription></CardHeader><CardContent>{investment.contributions.length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] border-collapse text-left text-sm"><caption className="sr-only">Investment contributions</caption><thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">{["Contribution reference", "Date", "Amount", "Ledger status"].map((label) => <th key={label} scope="col" className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{investment.contributions.map((item) => <tr key={item.id} className="border-b border-border last:border-0"><th scope="row" className="max-w-48 break-all px-3 py-3 font-mono text-xs">{item.id}</th><td className="whitespace-nowrap px-3 py-3">{formatDashboardDate(item.createdAt)}</td><td className="whitespace-nowrap px-3 py-3 font-semibold">{formatSatang(item.amountSatang)}</td><td className="px-3 py-3"><Badge variant={item.ledgerTransaction.status === "POSTED" ? "success" : "secondary"}>{formatDashboardStatus(item.ledgerTransaction.status)}</Badge></td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">No contribution rows are available for this investment.</p>}</CardContent></Card>

    <Card><CardHeader><CardTitle>Repayment allocations and payouts</CardTitle><CardDescription>Allocated repayment amounts are separate from completed simulated-wallet credits.</CardDescription></CardHeader><CardContent>{investment.payoutAllocation.length ? <div className="grid gap-4">{investment.payoutAllocation.map((allocation) => { const payout = allocation.investorPayout; const credited = payout?.status === "COMPLETED" && Boolean(payout.ledgerTransactionId); return <article key={allocation.id} className="grid gap-3 rounded-lg border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-mono text-xs">Allocation {allocation.id}</p><p className="mt-1 text-sm text-muted-foreground">Repayment {allocation.repaymentId}</p></div><Badge variant={credited ? "success" : "secondary"}>{credited ? "Paid out" : "Allocated"}</Badge></div><dl className="grid gap-3 sm:grid-cols-3"><Summary label="Principal allocated">{formatSatang(allocation.principalSatang)}</Summary><Summary label="Interest allocated">{formatSatang(allocation.interestSatang)}</Summary><Summary label="Recovery allocated">{formatSatang(allocation.recoverySatang)}</Summary></dl>{payout ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm"><div><p className="font-medium">Payout {payout.id}</p><p className="mt-1 text-muted-foreground">{formatDashboardStatus(payout.status)} · {payout.completedAt ? formatDashboardDate(payout.completedAt) : "Not completed"}</p></div><p className={credited ? "font-semibold text-success" : "text-muted-foreground"}>{credited ? "Credited to simulated wallet" : "Not credited to your wallet"}</p></div> : <p className="border-t border-border pt-3 text-sm text-muted-foreground">Allocation has not been paid out.</p>}</article>; })}</div> : <p className="text-sm text-muted-foreground">No repayment allocations have been recorded for this investment.</p>}</CardContent></Card>
    <div className="grid gap-3 sm:grid-cols-2">
      <HistoryPager label="Contribution history" pagination={investment.contributionPagination} loading={loading} onPageChange={setContributionPage} />
      <HistoryPager label="Allocation history" pagination={investment.allocationPagination} loading={loading} onPageChange={setAllocationPage} />
    </div>
  </main>;
}

function HistoryPager({ label, pagination, loading, onPageChange }: { label: string; pagination: ApiPagination; loading: boolean; onPageChange: (page: number) => void }) {
  if (pagination.totalPages <= 1) return null;
  return <nav aria-label={`${label} pages`} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
    <p className="text-sm text-muted-foreground">{label}: page {pagination.page} of {pagination.totalPages}</p>
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={!pagination.hasPreviousPage || loading} onClick={() => onPageChange(Math.max(1, pagination.page - 1))}>Previous</Button>
      <Button size="sm" variant="outline" disabled={!pagination.hasNextPage || loading} onClick={() => onPageChange(pagination.page + 1)}>Next</Button>
    </div>
  </nav>;
}

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 break-all font-semibold">{children}</dd></div>;
}
