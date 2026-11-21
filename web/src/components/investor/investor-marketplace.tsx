"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CircleDollarSign, RefreshCw } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { formatDashboardDate, formatDashboardStatus, formatSatang } from "../../lib/client/borrower-dashboard";
import { getApplicationErrorMessage } from "../../lib/client/borrower-applications";
import type { ApiPagination } from "../../lib/client/api-client";
import {
  DEFAULT_INVESTOR_MARKETPLACE_PAGE_SIZE,
  hasMarketplaceOpportunities,
  loadInvestorMarketplace,
  loadInvestorMarketplaceDetail,
  type InvestorMarketplaceOpportunity,
} from "../../lib/client/investor-marketplace";

type LoadStatus = "loading" | "success" | "error";

export function InvestorMarketplaceListPage({ initialOpportunities, initialStatus = "loading", initialError }: {
  initialOpportunities?: InvestorMarketplaceOpportunity[];
  initialStatus?: LoadStatus;
  initialError?: string;
}) {
  const [opportunities, setOpportunities] = useState<InvestorMarketplaceOpportunity[]>(initialOpportunities ?? []);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"createdAt" | "fundingDeadline">("fundingDeadline");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [pagination, setPagination] = useState<ApiPagination>();
  const [status, setStatus] = useState<LoadStatus>(initialStatus);
  const [error, setError] = useState<string | null>(initialError ?? null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await loadInvestorMarketplace({ page, limit: DEFAULT_INVESTOR_MARKETPLACE_PAGE_SIZE, sortBy, sortOrder });
      setOpportunities(response.data);
      setPagination(response.pagination);
      setError(null);
      setStatus("success");
    } catch (cause) {
      setError(getApplicationErrorMessage(cause));
      setStatus("error");
    }
  }, [page, sortBy, sortOrder]);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  return <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-9">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-primary">Investor workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Investment marketplace</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Review loans that the backend currently marks eligible for funding. NEXUS does not guarantee returns.</p></div><Link href="/investor" className={buttonVariants({ variant: "outline" })}>Overview</Link></header>

    <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"><div><p className="font-medium">Available opportunities</p><p className="text-sm text-muted-foreground">Eligibility and remaining capacity are refreshed from NEXUS.</p></div><label className="flex items-center gap-2 text-sm">Sort by<select className="h-10 rounded-md border border-input bg-background px-3" value={`${sortBy}:${sortOrder}`} onChange={(event) => { const [nextSort, nextOrder] = event.target.value.split(":"); setPage(1); setSortBy(nextSort as "createdAt" | "fundingDeadline"); setSortOrder(nextOrder as "asc" | "desc"); }}><option value="fundingDeadline:asc">Funding deadline</option><option value="createdAt:desc">Recently listed</option></select></label></div>

    {status === "error" ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><span>{error}</span><Button size="sm" variant="outline" onClick={() => void refresh()}><RefreshCw className="size-4"/>Retry</Button></div> : null}
    {status === "loading" && opportunities.length === 0 ? <div role="status" aria-busy="true" aria-label="Loading investment opportunities" className="grid gap-4 md:grid-cols-2"><div className="h-56 animate-pulse rounded-xl bg-muted"/><div className="h-56 animate-pulse rounded-xl bg-muted"/></div> : null}
    {status === "success" && !hasMarketplaceOpportunities(opportunities, pagination) ? <Card><CardContent className="grid justify-items-center gap-3 py-12 text-center"><CircleDollarSign className="size-9 text-muted-foreground"/><h2 className="text-lg font-semibold">No opportunities are available right now</h2><p className="max-w-lg text-sm text-muted-foreground">New opportunities will appear here when a loan is open for funding and has available capacity.</p></CardContent></Card> : null}
    {opportunities.length > 0 ? <div className="grid gap-4 md:grid-cols-2">{opportunities.map((loan) => <OpportunityCard key={loan.id} loan={loan}/>)}</div> : null}
    {pagination && pagination.totalPages > 1 ? <nav aria-label="Marketplace pages" className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Page {page} of {pagination.totalPages} · {pagination.total} opportunities</p><div className="flex gap-2"><Button variant="outline" disabled={!pagination.hasPreviousPage || status === "loading"} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button variant="outline" disabled={!pagination.hasNextPage || status === "loading"} onClick={() => setPage((value) => value + 1)}>Next</Button></div></nav> : null}
  </main>;
}

function OpportunityCard({ loan }: { loan: InvestorMarketplaceOpportunity }) {
  return <Card className="flex flex-col"><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardDescription>Loan reference</CardDescription><CardTitle className="mt-1 break-all text-base">{loan.id}</CardTitle></div><Badge variant="success">{formatDashboardStatus(loan.status)}</Badge></div></CardHeader><CardContent className="flex flex-1 flex-col gap-4"><dl className="grid grid-cols-2 gap-4"><div><dt className="text-xs text-muted-foreground">Principal</dt><dd className="mt-1 font-semibold">{formatSatang(loan.principalSatang)}</dd></div><div><dt className="text-xs text-muted-foreground">Funded</dt><dd className="mt-1 font-semibold">{formatSatang(loan.fundedSatang)}</dd></div><div><dt className="text-xs text-muted-foreground">Remaining opportunity</dt><dd className="mt-1 font-semibold">{formatSatang(loan.remainingFundingSatang)}</dd></div><div><dt className="text-xs text-muted-foreground">Interest rate</dt><dd className="mt-1 font-semibold">{(Number(loan.annualInterestRate) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}% p.a.</dd></div><div><dt className="text-xs text-muted-foreground">Term</dt><dd className="mt-1 font-semibold">{loan.termMonths} months</dd></div><div><dt className="text-xs text-muted-foreground">Funding deadline</dt><dd className="mt-1 font-semibold">{formatMarketplaceDate(loan.fundingDeadline)}</dd></div></dl><Link href={`/investor/marketplace/${loan.id}`} className={`${buttonVariants({ variant: "outline" })} mt-auto w-full`}>Review opportunity <ArrowRight className="size-4"/></Link></CardContent></Card>;
}

export function InvestorMarketplaceDetailPage({ loanId, initialOpportunity, initialError }: { loanId: string; initialOpportunity?: InvestorMarketplaceOpportunity; initialError?: string }) {
  const [opportunity, setOpportunity] = useState<InvestorMarketplaceOpportunity | null>(initialOpportunity ?? null);
  const [loading, setLoading] = useState(!initialOpportunity && !initialError);
  const [error, setError] = useState<string | null>(initialError ?? null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await loadInvestorMarketplaceDetail(loanId);
      setOpportunity(response.data);
      setError(null);
    } catch (cause) {
      setOpportunity(null);
      setError(getApplicationErrorMessage(cause));
    } finally { setLoading(false); }
  }, [loanId]);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  if (loading && !opportunity) return <main className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-8 sm:px-6"><p role="status" aria-busy="true" className="text-sm text-muted-foreground">Loading opportunity details</p><div className="h-72 animate-pulse rounded-xl bg-muted"/></main>;
  if (!opportunity) return <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6"><Card><CardContent className="grid justify-items-center gap-3 py-10 text-center"><CircleDollarSign className="size-9 text-muted-foreground"/><h1 className="text-xl font-semibold">Opportunity unavailable</h1><p role="alert" className="max-w-lg text-sm text-muted-foreground">{error ?? "This loan is no longer available for funding."}</p><div className="flex gap-2"><Button variant="outline" onClick={() => void refresh()}>Refresh eligibility</Button><Link href="/investor/marketplace" className={buttonVariants({ variant: "outline" })}>Back to marketplace</Link></div></CardContent></Card></main>;

  return <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-6 sm:px-6 sm:py-9"><Link href="/investor/marketplace" className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4"/>Marketplace</Link><header><p className="text-sm font-medium text-primary">Eligible funding opportunity</p><h1 className="mt-1 break-all text-2xl font-bold tracking-tight sm:text-3xl">{opportunity.id}</h1><p className="mt-2 text-sm text-muted-foreground">NEXUS displays only public loan terms. No borrower identity or private underwriting data is shown.</p></header><Card><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>Opportunity terms</CardTitle><CardDescription className="mt-1">Confirm current availability before making any investment decision.</CardDescription></div><Badge variant="success">{formatDashboardStatus(opportunity.status)}</Badge></div></CardHeader><CardContent><dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2"><Summary label="Approved principal">{formatSatang(opportunity.principalSatang)}</Summary><Summary label="Currently funded">{formatSatang(opportunity.fundedSatang)}</Summary><Summary label="Remaining funding opportunity">{formatSatang(opportunity.remainingFundingSatang)}</Summary><Summary label="Annual interest rate">{(Number(opportunity.annualInterestRate) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}% p.a.</Summary><Summary label="Loan term">{opportunity.termMonths} months</Summary><Summary label="Funding deadline">{formatMarketplaceDate(opportunity.fundingDeadline)}</Summary></dl></CardContent></Card><p className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm text-muted-foreground">This opportunity is not a guarantee of return. Funding eligibility can change; the backend revalidates availability during any investment submission.</p><Link href={`/investor/marketplace/${opportunity.id}/invest`} className={buttonVariants()}>Continue to investment amount</Link></main>;
}

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-semibold">{children}</dd></div>;
}

function formatMarketplaceDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
