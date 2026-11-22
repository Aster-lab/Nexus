"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, WalletCards } from "lucide-react";
import { ApiClientError } from "../../lib/client/api-client";
import { loadInvestorWallet, type InvestorWalletResult } from "../../lib/client/investor-wallet";
import { formatSatang, formatFinancialStatus } from "../../lib/client/financial-format";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { FinancialTransactionTable } from "../shared/financial-transaction-table";
import { WalletTopUpForm } from "../shared/wallet-top-up-form";

const PAGE_SIZE = 10;
type State = "loading" | "success" | "error";

export function InvestorWalletPage() {
  const [wallet, setWallet] = useState<InvestorWalletResult | null>(null);
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const refresh = useCallback(async () => {
    setState("loading");
    try { setWallet(await loadInvestorWallet({ page, limit: PAGE_SIZE, sortOrder })); setError(""); setState("success"); }
    catch (cause) { setError(cause instanceof ApiClientError ? cause.message : "Wallet activity could not be loaded."); setState("error"); }
  }, [page, sortOrder]);
  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);
  useEffect(() => {
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const pagination = wallet?.pagination ?? { page: 1, limit: PAGE_SIZE, total: wallet?.transactions.length ?? 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false };
  return <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-9">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-primary">Investor workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Simulated wallet</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">View your simulated balance and the transactions recorded for your account.</p></div><Button variant="outline" disabled={state === "loading"} onClick={() => void refresh()}><RefreshCw className={`size-4 ${state === "loading" ? "animate-spin" : ""}`}/>Refresh</Button></header>
    {state === "loading" && !wallet ? <div role="status" aria-busy="true" aria-label="Loading investor wallet" className="h-48 animate-pulse rounded-xl bg-muted"/> : null}
    {state === "error" && !wallet ? <Card><CardContent className="grid justify-items-start gap-3 pt-5"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => void refresh()}>Retry</Button></CardContent></Card> : null}
    {wallet ? <>
      {state === "error" ? <p role="alert" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">Showing the last successful wallet response. Refresh failed: {error}</p> : null}
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="size-5 text-primary"/>Wallet balance</CardTitle><CardDescription>Your balance reflects completed wallet transactions.</CardDescription></CardHeader><CardContent className="grid gap-4">{wallet.wallet ? <><div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-muted/50 p-5"><div><p className="text-sm text-muted-foreground">Available simulated balance</p><p className="mt-2 text-3xl font-bold tracking-tight">{formatSatang(wallet.wallet.balanceSatang, wallet.wallet.currency)}</p></div><Badge variant={wallet.wallet.status === "ACTIVE" && wallet.wallet.currency === "THB" ? "success" : "warning"}>{formatFinancialStatus(wallet.wallet.status)} · {wallet.wallet.currency}</Badge></div>{wallet.wallet.status === "ACTIVE" && wallet.wallet.currency === "THB" ? <WalletTopUpForm role="INVESTOR" onPosted={refresh}/> : null}</> : <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">An investor wallet has not been set up for this account yet.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Wallet activity</CardTitle><CardDescription>Only completed transactions change your wallet balance. Repayment allocations appear separately until a payout is complete.</CardDescription></CardHeader><CardContent className="grid gap-4"><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{pagination.total} transactions</span><label className="flex items-center gap-2 text-sm">Date order<select className="h-10 rounded-md border border-input bg-background px-3" value={sortOrder} onChange={(event) => { setPage(1); setSortOrder(event.target.value as "asc" | "desc"); }}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label></div><FinancialTransactionTable rows={wallet.transactions} label="Investor wallet activity"/>{pagination.totalPages > 1 ? <nav className="flex items-center justify-between" aria-label="Wallet activity pages"><span className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</span><div className="flex gap-2"><Button variant="outline" disabled={!pagination.hasPreviousPage || state === "loading"} onClick={() => setPage((current) => current - 1)}>Previous</Button><Button variant="outline" disabled={!pagination.hasNextPage || state === "loading"} onClick={() => setPage((current) => current + 1)}>Next</Button></div></nav> : null}</CardContent></Card>
    </> : null}
    <div className="flex flex-wrap gap-3"><Link href="/investor/payouts" className={buttonVariants({ variant: "outline" })}>Payout history</Link><Link href="/investor/allocations" className={buttonVariants({ variant: "outline" })}>Repayment allocations</Link><Link href="/investor/portfolio" className={buttonVariants({ variant: "outline" })}>Investment portfolio</Link></div>
  </main>;
}
