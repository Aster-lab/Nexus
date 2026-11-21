"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowRight, BriefcaseBusiness, CircleDollarSign, RefreshCw, WalletCards } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { formatDashboardDate, formatDashboardStatus, formatSatang } from "../../lib/client/borrower-dashboard";
import { useAuth } from "../auth/auth-provider";
import {
  createInitialInvestorDashboardData,
  loadInvestorDashboard,
  loadInvestorDashboardResource,
  subscribeInvestorDashboardRefresh,
  type InvestorDashboardData,
  type InvestorDashboardKey,
} from "../../lib/client/investor-dashboard";

function SectionLoading({ label }: { label: string }) {
  return <div role="status" aria-live="polite" aria-busy="true" className="space-y-3"><span className="sr-only">Loading {label}</span><Skeleton className="h-10 w-full"/><Skeleton className="h-10 w-5/6"/></div>;
}

function SectionError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="grid justify-items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"><p className="text-destructive">{message}</p><Button size="sm" variant="outline" onClick={retry}>Retry this section</Button></div>;
}

function SectionCard({ title, description, href, children }: { title: string; description: string; href?: string; children: ReactNode }) {
  return <Card><CardHeader className="flex-row items-start justify-between gap-4 space-y-0"><div><CardTitle>{title}</CardTitle><CardDescription className="mt-1">{description}</CardDescription></div>{href ? <Link href={href} aria-label={`View ${title.toLowerCase()}`} className="text-primary"><ArrowRight className="size-5"/></Link> : null}</CardHeader><CardContent>{children}</CardContent></Card>;
}

export function InvestorDashboardPage({ initialData }: { initialData?: InvestorDashboardData }) {
  const { identity } = useAuth();
  const displayName = identity?.investorProfile?.displayName ?? identity?.email ?? "Investor";
  initialData ??= createInitialInvestorDashboardData();
  const [data, setData] = useState<InvestorDashboardData>(initialData);

  const refresh = useCallback(() => {
    const controller = new AbortController();
    void loadInvestorDashboard(undefined, controller.signal, (key, resource) => {
      setData((current) => ({ ...current, [key]: resource }) as InvestorDashboardData);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    let cancel: (() => void) | undefined;
    const unsubscribe = subscribeInvestorDashboardRefresh(() => { cancel?.(); cancel = refresh(); });
    queueMicrotask(() => { if (active) cancel = refresh(); });
    return () => { active = false; cancel?.(); unsubscribe(); };
  }, [refresh]);

  const retry = useCallback((key: InvestorDashboardKey) => {
    setData((current) => ({ ...current, [key]: { status: "loading" } }));
    void loadInvestorDashboardResource(key).then((resource) => setData((current) => ({ ...current, [key]: resource }) as InvestorDashboardData));
  }, []);

  return <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-9">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-primary">Investor workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Welcome back, {displayName}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Track your confirmed wallet balance, investments, and payouts. All figures come from persisted NEXUS records.</p></div><Button variant="outline" onClick={() => { void refresh(); }}><RefreshCw className="size-4"/>Refresh</Button></header>

    <section aria-label="Portfolio summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {data.portfolio.status === "loading" ? Array.from({ length: 4 }, (_, i) => <Card key={i}><CardContent className="pt-5"><SectionLoading label="portfolio summary"/></CardContent></Card>) : null}
      {data.portfolio.status === "error" ? <Card className="sm:col-span-2 xl:col-span-4"><CardContent className="pt-5"><SectionError message={data.portfolio.message} retry={() => retry("portfolio")}/></CardContent></Card> : null}
      {data.portfolio.status === "success" ? <>
        <SummaryCard label="Available wallet balance" value={data.portfolio.data.wallet ? formatSatang(data.portfolio.data.wallet.balanceSatang) : "Wallet unavailable"} detail={data.portfolio.data.wallet ? `${data.portfolio.data.wallet.currency} · ${formatDashboardStatus(data.portfolio.data.wallet.status)}` : "No investor wallet is linked"} icon={WalletCards}/>
        <SummaryCard label="Total invested principal" value={formatSatang(data.portfolio.data.totalInvestedPrincipalSatang)} detail={`${data.portfolio.data.investmentCounts.active} active · ${data.portfolio.data.investmentCounts.completed} completed`} icon={BriefcaseBusiness}/>
        <SummaryCard label="Outstanding principal" value={formatSatang(data.portfolio.data.outstandingPrincipalSatang)} detail="Backend portfolio summary" icon={CircleDollarSign}/>
        <SummaryCard label="Received through completed payouts" value={`${formatSatang(data.portfolio.data.principalReceivedSatang)} principal`} detail={`${formatSatang(data.portfolio.data.interestReceivedSatang)} interest · posted payouts only`} icon={CircleDollarSign}/>
      </> : null}
    </section>

    <section className="grid gap-5 lg:grid-cols-2">
      <SectionCard title="Recent investments" description="Latest investment and loan references, dates, and current backend status." href="/investor/portfolio">
        {data.investments.status === "loading" ? <SectionLoading label="recent investments"/> : null}
        {data.investments.status === "error" ? <SectionError message={data.investments.message} retry={() => retry("investments")}/> : null}
        {data.investments.status === "success" && data.investments.data.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No investments yet. Browse the marketplace to review currently eligible opportunities.</p> : null}
        {data.investments.status === "success" && data.investments.data.length > 0 ? <ul className="divide-y divide-border">{data.investments.data.map((investment) => <li key={investment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="break-all font-mono text-xs">{investment.id}</p><p className="mt-1 text-sm text-muted-foreground">Loan {investment.loan.id} · {formatDashboardDate(investment.createdAt)}</p></div><Badge variant={investment.status === "ACTIVE" ? "success" : "secondary"}>{formatDashboardStatus(investment.status)}</Badge></li>)}</ul> : null}
      </SectionCard>

      <SectionCard title="Recent payouts" description="A repayment allocation is not a wallet credit; completed payouts are confirmed separately." href="/investor/payouts">
        {data.payouts.status === "loading" ? <SectionLoading label="recent payouts"/> : null}
        {data.payouts.status === "error" ? <SectionError message={data.payouts.message} retry={() => retry("payouts")}/> : null}
        {data.payouts.status === "success" && data.payouts.data.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No payouts have been recorded yet. Future payout status will appear here after administrator processing.</p> : null}
        {data.payouts.status === "success" && data.payouts.data.length > 0 ? <ul className="divide-y divide-border">{data.payouts.data.map((payout) => <li key={payout.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><Link className="break-all font-mono text-xs text-primary underline" href={`/investor/payouts/${payout.id}`}>{payout.id}</Link><p className="mt-1 text-sm text-muted-foreground">Principal {formatSatang(payout.principalSatang)} · Interest {formatSatang(payout.interestSatang)}</p><p className="text-xs text-muted-foreground">{formatDashboardDate(payout.completedAt ?? payout.createdAt)}</p></div><Badge variant={payout.status === "COMPLETED" ? "success" : payout.status === "FAILED" ? "warning" : "secondary"}>{formatDashboardStatus(payout.status)}</Badge></li>)}</ul> : null}
      </SectionCard>
    </section>

    <section aria-labelledby="wallet-activity-title"><Card><CardHeader><CardTitle id="wallet-activity-title">Wallet activity</CardTitle><CardDescription>Posted wallet credits and debits come from the investor-scoped ledger view.</CardDescription></CardHeader><CardContent><div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-5"><p className="max-w-xl text-sm text-muted-foreground">Review posted activity separately from repayment allocations. An allocation is not a wallet credit until its payout is completed and posted.</p><Link className={buttonVariants({ variant: "outline" })} href="/investor/wallet">Open wallet activity <ArrowRight className="size-4"/></Link></div></CardContent></Card></section>

    <footer className="flex flex-wrap gap-3"><Link href="/investor/marketplace" className={buttonVariants({ variant: "default" })}>Browse marketplace</Link><Link href="/investor/recommendations" className={buttonVariants({ variant: "outline" })}>Personalized recommendations</Link><Link href="/investor/portfolio" className={buttonVariants({ variant: "outline" })}>View portfolio</Link><Link href="/investor/allocations" className={buttonVariants({ variant: "outline" })}>Repayment allocations</Link><Link href="/investor/payouts" className={buttonVariants({ variant: "outline" })}>Payout history</Link><Link href="/investor/wallet" className={buttonVariants({ variant: "outline" })}>Wallet summary</Link></footer>
  </main>;
}

function SummaryCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof WalletCards }) {
  return <Card><CardContent className="flex min-h-32 items-start justify-between gap-3 pt-5"><div className="min-w-0"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 break-words text-xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" aria-hidden="true"/></span></CardContent></Card>;
}
