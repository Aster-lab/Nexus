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
import { RoleOnboardingTour } from "../shared/role-onboarding-tour";
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

function SectionCard({ title, description, href, children, tourTarget }: { title: string; description: string; href?: string; children: ReactNode; tourTarget?: string }) {
  return <Card data-tour-target={tourTarget}><CardHeader className="flex-row items-start justify-between gap-4 space-y-0"><div><CardTitle>{title}</CardTitle><CardDescription className="mt-1">{description}</CardDescription></div>{href ? <Link href={href} aria-label={`View ${title.toLowerCase()}`} className="text-primary"><ArrowRight className="size-5"/></Link> : null}</CardHeader><CardContent>{children}</CardContent></Card>;
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
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-primary">Investor workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Welcome back, {displayName}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Keep track of your simulated wallet, investments, and completed payouts.</p></div><div className="flex flex-wrap gap-2"><RoleOnboardingTour userId={identity?.id ?? null} role="INVESTOR"/><Button variant="outline" onClick={() => { void refresh(); }}><RefreshCw className="size-4"/>Refresh</Button></div></header>

    <section aria-label="Portfolio summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {data.portfolio.status === "loading" ? Array.from({ length: 4 }, (_, i) => <Card key={i}><CardContent className="pt-5"><SectionLoading label="portfolio summary"/></CardContent></Card>) : null}
      {data.portfolio.status === "error" ? <Card className="sm:col-span-2 xl:col-span-4"><CardContent className="pt-5"><SectionError message={data.portfolio.message} retry={() => retry("portfolio")}/></CardContent></Card> : null}
      {data.portfolio.status === "success" ? <>
        <SummaryCard label="Available wallet balance" value={data.portfolio.data.wallet ? formatSatang(data.portfolio.data.wallet.balanceSatang) : "Wallet unavailable"} detail={data.portfolio.data.wallet ? `${data.portfolio.data.wallet.currency} · ${formatDashboardStatus(data.portfolio.data.wallet.status)}` : "No investor wallet is linked"} icon={WalletCards} tourTarget="investor-wallet-summary"/>
        <SummaryCard label="Total invested principal" value={formatSatang(data.portfolio.data.totalInvestedPrincipalSatang)} detail={`${data.portfolio.data.investmentCounts.active} active · ${data.portfolio.data.investmentCounts.completed} completed`} icon={BriefcaseBusiness}/>
        <SummaryCard label="Outstanding principal" value={formatSatang(data.portfolio.data.outstandingPrincipalSatang)} detail="Backend portfolio summary" icon={CircleDollarSign}/>
        <SummaryCard label="Received through completed payouts" value={`${formatSatang(data.portfolio.data.principalReceivedSatang)} principal`} detail={`${formatSatang(data.portfolio.data.interestReceivedSatang)} interest · posted payouts only`} icon={CircleDollarSign}/>
      </> : null}
    </section>

    {data.portfolio.status === "success" ? <InvestmentStatusChart active={data.portfolio.data.investmentCounts.active} completed={data.portfolio.data.investmentCounts.completed} /> : null}

    <section className="grid gap-5 lg:grid-cols-2">
      <SectionCard title="Recent investments" description="Your latest investments, loan references, and current status." href="/investor/portfolio" tourTarget="investor-portfolio">
        {data.investments.status === "loading" ? <SectionLoading label="recent investments"/> : null}
        {data.investments.status === "error" ? <SectionError message={data.investments.message} retry={() => retry("investments")}/> : null}
        {data.investments.status === "success" && data.investments.data.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No investments yet. Browse the marketplace to review currently eligible opportunities.</p> : null}
        {data.investments.status === "success" && data.investments.data.length > 0 ? <ul className="divide-y divide-border">{data.investments.data.map((investment) => <li key={investment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="break-all font-mono text-xs">{investment.id}</p><p className="mt-1 text-sm text-muted-foreground">Loan {investment.loan.id} · {formatDashboardDate(investment.createdAt)}</p></div><Badge variant={investment.status === "ACTIVE" ? "success" : "secondary"}>{formatDashboardStatus(investment.status)}</Badge></li>)}</ul> : null}
      </SectionCard>

      <SectionCard title="Recent payouts" description="A repayment allocation is not a wallet credit; completed payouts are confirmed separately." href="/investor/payouts" tourTarget="investor-payouts">
        {data.payouts.status === "loading" ? <SectionLoading label="recent payouts"/> : null}
        {data.payouts.status === "error" ? <SectionError message={data.payouts.message} retry={() => retry("payouts")}/> : null}
        {data.payouts.status === "success" && data.payouts.data.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No payouts have been recorded yet. Future payout status will appear here after administrator processing.</p> : null}
        {data.payouts.status === "success" && data.payouts.data.length > 0 ? <ul className="divide-y divide-border">{data.payouts.data.map((payout) => <li key={payout.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><Link className="break-all font-mono text-xs text-primary underline" href={`/investor/payouts/${payout.id}`}>{payout.id}</Link><p className="mt-1 text-sm text-muted-foreground">Principal {formatSatang(payout.principalSatang)} · Interest {formatSatang(payout.interestSatang)}</p><p className="text-xs text-muted-foreground">{formatDashboardDate(payout.completedAt ?? payout.createdAt)}</p></div><Badge variant={payout.status === "COMPLETED" ? "success" : payout.status === "FAILED" ? "warning" : "secondary"}>{formatDashboardStatus(payout.status)}</Badge></li>)}</ul> : null}
      </SectionCard>
    </section>

    <section aria-labelledby="wallet-activity-title" data-tour-target="investor-wallet-activity"><Card><CardHeader><CardTitle id="wallet-activity-title">Wallet activity</CardTitle><CardDescription>Recent posted wallet credits and debits from the investor-scoped ledger view. Allocations are not wallet credits until payouts are completed.</CardDescription></CardHeader><CardContent className="grid gap-4">
      {data.wallet.status === "loading" ? <SectionLoading label="wallet activity"/> : null}
      {data.wallet.status === "error" ? <SectionError message={data.wallet.message} retry={() => retry("wallet")}/> : null}
      {data.wallet.status === "success" && !data.wallet.data.wallet ? <p className="rounded-lg bg-secondary/50 p-4 text-sm text-muted-foreground">No investor wallet is linked to this account yet. Wallets are internal simulated THB balances.</p> : null}
      {data.wallet.status === "success" && data.wallet.data.wallet ? <>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary/50 p-4"><div><p className="text-sm text-muted-foreground">Available simulated wallet balance</p><p className="mt-1 text-xl font-bold">{formatSatang(data.wallet.data.wallet.balanceSatang)}</p></div><Badge variant={data.wallet.data.wallet.status === "ACTIVE" ? "success" : "warning"}>{formatDashboardStatus(data.wallet.data.wallet.status)}</Badge></div>
        {data.wallet.data.transactions.length ? <ul className="divide-y divide-border">{data.wallet.data.transactions.map((transaction) => <li key={transaction.ledgerEntryId} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"><div className="min-w-0"><p className="font-medium">{formatDashboardStatus(transaction.transactionType)}</p><p className="mt-1 break-all text-xs text-muted-foreground">{transaction.description || transaction.ledgerTransactionId} · {formatDashboardDate(transaction.postedAt)}</p></div><p className="shrink-0 font-semibold tabular-nums">{transaction.direction === "DEBIT" ? "−" : "+"}{formatSatang(transaction.amountSatang)}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">No posted wallet transactions yet.</p>}
      </> : null}
      <div className="flex justify-end"><Link className={buttonVariants({ variant: "outline" })} href="/investor/wallet">Open wallet activity <ArrowRight className="size-4"/></Link></div>
    </CardContent></Card></section>

    <footer className="flex flex-wrap gap-3"><Link data-tour-target="investor-marketplace" href="/investor/marketplace" className={buttonVariants({ variant: "default" })}>Browse marketplace</Link><Link href="/investor/recommendations" className={buttonVariants({ variant: "outline" })}>Personalized recommendations</Link><Link href="/investor/portfolio" className={buttonVariants({ variant: "outline" })}>View portfolio</Link><Link href="/investor/allocations" className={buttonVariants({ variant: "outline" })}>Repayment allocations</Link><Link href="/investor/payouts" className={buttonVariants({ variant: "outline" })}>Payout history</Link><Link href="/investor/wallet" className={buttonVariants({ variant: "outline" })}>Wallet summary</Link></footer>
  </main>;
}

function InvestmentStatusChart({ active, completed }: { active: number; completed: number }) {
  const total = active + completed;
  const activePercent = total === 0 ? 0 : Math.round((active / total) * 100);
  const completedPercent = total === 0 ? 0 : 100 - activePercent;
  return <Card aria-labelledby="investment-status-title">
    <CardHeader><CardTitle id="investment-status-title">Investment status</CardTitle><CardDescription>A count of your investments by current status. This chart does not show returns or performance.</CardDescription></CardHeader>
    <CardContent>
      {total === 0 ? <p className="rounded-lg bg-secondary/50 p-4 text-sm text-muted-foreground">Your investment status chart will appear after you make an investment.</p> : <>
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${active} active investments, ${completed} completed investments`}>
          {active > 0 ? <span className="h-full bg-accent transition-[width]" style={{ width: `${activePercent}%` }} /> : null}
          {completed > 0 ? <span className="h-full bg-primary transition-[width]" style={{ width: `${completedPercent}%` }} /> : null}
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          <li className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"><span className="flex items-center gap-2 text-sm"><i className="size-3 rounded-sm bg-accent" aria-hidden="true"/>Active</span><strong className="tabular-nums">{active} <span className="font-normal text-muted-foreground">({activePercent}%)</span></strong></li>
          <li className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"><span className="flex items-center gap-2 text-sm"><i className="size-3 rounded-sm bg-primary" aria-hidden="true"/>Completed</span><strong className="tabular-nums">{completed} <span className="font-normal text-muted-foreground">({completedPercent}%)</span></strong></li>
        </ul>
      </>}
    </CardContent>
  </Card>;
}

function SummaryCard({ label, value, detail, icon: Icon, tourTarget }: { label: string; value: string; detail: string; icon: typeof WalletCards; tourTarget?: string }) {
  return <Card data-tour-target={tourTarget}><CardContent className="flex min-h-32 items-start justify-between gap-3 pt-5"><div className="min-w-0"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 break-words text-xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" aria-hidden="true"/></span></CardContent></Card>;
}
