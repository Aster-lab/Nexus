"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { getApplicationErrorMessage } from "../../lib/client/borrower-applications";
import type { ApiPagination } from "../../lib/client/api-client";
import { formatDashboardDate, formatDashboardStatus, formatSatang } from "../../lib/client/borrower-dashboard";
import {
  DEFAULT_INVESTOR_PAYOUT_PAGE_SIZE,
  hasInvestorPayouts,
  isCompletedInvestorPayout,
  loadInvestorPayout,
  loadInvestorPayouts,
  type InvestorPayoutDetails,
  type InvestorPayoutRecord,
} from "../../lib/client/investor-payouts";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

type LoadStatus = "loading" | "success" | "error";

export function InvestorPayoutHistoryPage({ initialPayouts, initialStatus = "loading", initialError }: {
  initialPayouts?: InvestorPayoutRecord[];
  initialStatus?: LoadStatus;
  initialError?: string;
}) {
  const [payouts, setPayouts] = useState<InvestorPayoutRecord[]>(initialPayouts ?? []);
  const [status, setStatus] = useState<LoadStatus>(initialStatus);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [pagination, setPagination] = useState<ApiPagination>();

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await loadInvestorPayouts({ page, limit: DEFAULT_INVESTOR_PAYOUT_PAGE_SIZE, sortOrder });
      setPayouts(response.data);
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
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-primary">Investor workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Payout history</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Review administrator-processed payouts. Completed payouts with a posted transaction are credited to your simulated wallet.</p></div><div className="flex gap-2"><Button variant="outline" disabled={status === "loading"} onClick={() => void refresh()}><RefreshCw className={`size-4 ${status === "loading" ? "animate-spin" : ""}`}/>Refresh</Button><Link href="/investor/wallet" className={buttonVariants({ variant: "outline" })}>Wallet</Link></div></header>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{pagination ? `${pagination.total} payout records` : "Read-only payout records"}</p><label className="flex items-center gap-2 text-sm">Sort by date<select className="h-10 rounded-md border border-input bg-background px-3" value={sortOrder} onChange={(event) => { setPage(1); setSortOrder(event.target.value as "asc" | "desc"); }}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label></div>
    {status === "error" ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><span>{error}</span><Button size="sm" variant="outline" onClick={() => void refresh()}>Retry</Button></div> : null}
    {status === "loading" && payouts.length === 0 ? <div role="status" aria-busy="true" aria-label="Loading payout history" className="h-64 animate-pulse rounded-xl bg-muted"/> : null}
    {status === "success" && !hasInvestorPayouts(payouts, pagination) ? <Card><CardContent className="grid justify-items-center gap-3 py-12 text-center"><h2 className="text-lg font-semibold">No payouts yet</h2><p className="max-w-md text-sm text-muted-foreground">When an administrator processes an investor payout, its status and references will appear here.</p><Link href="/investor/allocations" className={buttonVariants({ variant: "outline" })}>Review repayment allocations</Link></CardContent></Card> : null}
    {payouts.length > 0 ? <Card><CardHeader><CardTitle>Payout records</CardTitle><CardDescription>Payout requests and retries are handled by administrators. Investors can view the persisted status and references here.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[950px] border-collapse text-left text-sm"><caption className="sr-only">Investor payout history</caption><thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">{["Payout reference", "Allocation", "Investment", "Principal", "Interest", "Status", "Payout date", "Wallet credit"].map((label) => <th key={label} scope="col" className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{payouts.map((payout) => <PayoutRow key={payout.id} payout={payout}/>)}</tbody></table></div></CardContent></Card> : null}
    {pagination && pagination.totalPages > 1 ? <nav aria-label="Payout history pages" className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Page {page} of {pagination.totalPages}</p><div className="flex gap-2"><Button variant="outline" disabled={!pagination.hasPreviousPage || status === "loading"} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button variant="outline" disabled={!pagination.hasNextPage || status === "loading"} onClick={() => setPage((value) => value + 1)}>Next</Button></div></nav> : null}
  </main>;
}

function PayoutRow({ payout }: { payout: InvestorPayoutRecord }) {
  const completed = isCompletedInvestorPayout(payout);
  const allocation = payout.payoutAllocation;
  return <tr className="border-b border-border last:border-0 align-top"><th scope="row" className="max-w-40 break-all px-3 py-3 font-mono text-xs"><Link className="text-primary underline" href={`/investor/payouts/${payout.id}`}>{payout.id}</Link></th><td className="max-w-40 break-all px-3 py-3"><p className="font-mono text-xs">{allocation.id}</p></td><td className="max-w-40 break-all px-3 py-3"><Link className="text-primary underline" href={`/investor/investments/${allocation.investmentId}`}>{allocation.investmentId}</Link></td><td className="whitespace-nowrap px-3 py-3">{formatSatang(payout.principalSatang)}</td><td className="whitespace-nowrap px-3 py-3">{formatSatang(payout.interestSatang)}</td><td className="px-3 py-3"><Badge variant={payout.status === "COMPLETED" && completed ? "success" : payout.status === "FAILED" ? "warning" : "secondary"}>{formatDashboardStatus(payout.status)}</Badge></td><td className="whitespace-nowrap px-3 py-3">{formatDashboardDate(payout.completedAt ?? payout.createdAt)}</td><td className="px-3 py-3">{completed ? <span className="font-medium text-success">Credited to simulated wallet</span> : <span className="text-muted-foreground">Not credited{payout.status === "FAILED" ? " · Administrator retry" : ""}</span>}</td></tr>;
}

export function InvestorPayoutDetailsPage({ payoutId, initialPayout, initialError }: { payoutId: string; initialPayout?: InvestorPayoutDetails; initialError?: string }) {
  const [payout, setPayout] = useState<InvestorPayoutDetails | null>(initialPayout ?? null);
  const [loading, setLoading] = useState(!initialPayout && !initialError);
  const [error, setError] = useState<string | null>(initialError ?? null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await loadInvestorPayout(payoutId);
      setPayout(response.data);
      setError(null);
    } catch (cause) {
      setPayout(null);
      setError(getApplicationErrorMessage(cause));
    } finally { setLoading(false); }
  }, [payoutId]);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  if (loading && !payout) return <main className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-8 sm:px-6"><p role="status" aria-busy="true">Loading payout details</p><div className="h-72 animate-pulse rounded-xl bg-muted"/></main>;
  if (!payout) return <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6"><Card><CardContent className="grid justify-items-center gap-3 py-10 text-center"><h1 className="text-xl font-semibold">Payout unavailable</h1><p role="alert" className="max-w-lg text-sm text-muted-foreground">{error ?? "We could not load this payout."}</p><div className="flex gap-2"><Button variant="outline" onClick={() => void refresh()}>Retry</Button><Link href="/investor/payouts" className={buttonVariants({ variant: "outline" })}>Back to payouts</Link></div></CardContent></Card></main>;

  const completed = isCompletedInvestorPayout(payout);
  const allocation = payout.payoutAllocation;
  return <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-6 sm:px-6 sm:py-9"><Link href="/investor/payouts" className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4"/>Payout history</Link><header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">Payout reference</p><h1 className="mt-1 break-all text-2xl font-bold tracking-tight sm:text-3xl">{payout.id}</h1></div><Badge variant={completed ? "success" : payout.status === "FAILED" ? "warning" : "secondary"}>{formatDashboardStatus(payout.status)}</Badge></header>
    <Card><CardHeader><CardTitle>Payout details</CardTitle><CardDescription>Amounts and status are returned by the investor payout service.</CardDescription></CardHeader><CardContent><dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2"><Summary label="Principal paid">{formatSatang(payout.principalSatang)}</Summary><Summary label="Interest paid">{formatSatang(payout.interestSatang)}</Summary><Summary label="Payout date">{formatDashboardDate(payout.completedAt ?? payout.createdAt)}</Summary><Summary label="Payout ledger transaction">{payout.ledgerTransactionId ?? "Not posted"}</Summary><Summary label="Allocation reference">{payout.payoutAllocationId}</Summary><Summary label="Investment reference"><Link className="text-primary underline" href={`/investor/investments/${allocation.investmentId}`}>{allocation.investmentId}</Link></Summary><Summary label="Repayment reference">{allocation.repaymentId}</Summary><Summary label="Loan reference">{allocation.repayment.loanId}</Summary><Summary label="Source repayment transaction">{allocation.repayment.ledgerTransactionId}</Summary></dl></CardContent></Card>
    <section role={completed ? "status" : "note"} className={`rounded-lg border p-4 text-sm ${completed ? "border-success/30 bg-success/5 text-success" : payout.status === "FAILED" ? "border-warning/30 bg-warning/5 text-foreground" : "border-border bg-muted/40 text-muted-foreground"}`}><p className="font-semibold">{completed ? "Credited to your simulated wallet" : payout.status === "FAILED" ? "Payout failed; an administrator handles any retry" : "Payout is not yet credited to your wallet"}</p><p className="mt-1">Investors cannot initiate, retry, reverse, or edit payout records.</p></section>
    <Link href="/investor/wallet" className={buttonVariants({ variant: "outline" })}>View wallet summary</Link>
  </main>;
}

function Summary({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 break-all font-semibold">{children}</dd></div>;
}
