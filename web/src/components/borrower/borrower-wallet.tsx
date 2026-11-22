"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, WalletCards } from "lucide-react";
import { ApiClientError } from "../../lib/client/api-client";
import { loadBorrowerDashboardResource, type BorrowerDashboardSummary } from "../../lib/client/borrower-dashboard";
import { loadBorrowerWallet, type BorrowerWalletResult } from "../../lib/client/borrower-wallet";
import { formatSatang, formatFinancialStatus } from "../../lib/client/financial-format";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { FinancialTransactionTable } from "../shared/financial-transaction-table";
import { WalletTopUpForm } from "../shared/wallet-top-up-form";

type State<T> = { status: "loading" } | { status: "error"; message: string } | { status: "success"; data: T };
const PAGE_SIZE = 10;

export function BorrowerWalletPage() {
  const [wallet, setWallet] = useState<State<BorrowerWalletResult>>({ status: "loading" });
  const [obligations, setObligations] = useState<State<BorrowerDashboardSummary>>({ status: "loading" });
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(async () => {
    const [walletResult, summaryResult] = await Promise.allSettled([
      loadBorrowerWallet({ page, limit: PAGE_SIZE, sortOrder }),
      loadBorrowerDashboardResource("summary"),
    ]);
    if (walletResult.status === "fulfilled") setWallet({ status: "success", data: walletResult.value });
    else setWallet({ status: "error", message: walletResult.reason instanceof ApiClientError ? walletResult.reason.message : "Wallet activity could not be loaded." });
    if (summaryResult.status === "fulfilled" && summaryResult.value.status === "success") setObligations({ status: "success", data: summaryResult.value.data });
    else if (summaryResult.status === "fulfilled") setObligations({ status: "error", message: summaryResult.value.status === "error" ? summaryResult.value.message : "Loan obligations could not be loaded." });
    else setObligations({ status: "error", message: summaryResult.reason instanceof ApiClientError ? summaryResult.reason.message : "Loan obligations could not be loaded." });
  }, [page, sortOrder]);
  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh, revision]);

  const pagination = wallet.status === "success" ? wallet.data.pagination : undefined;
  return <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-9">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-primary">Borrower workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Simulated wallet</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Check your simulated balance and recent transactions. Your wallet is separate from outstanding loan obligations.</p></div><Button variant="outline" onClick={() => setRevision((value) => value + 1)}><RefreshCw className="size-4"/>Refresh</Button></header>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="size-5 text-primary"/>Wallet balance</CardTitle><CardDescription>Your balance reflects completed wallet transactions.</CardDescription></CardHeader><CardContent className="grid gap-4">{wallet.status === "loading" ? <div role="status" aria-busy="true" aria-label="Loading wallet balance" className="h-24 animate-pulse rounded-lg bg-muted"/> : null}{wallet.status === "error" ? <p role="alert" className="text-sm text-destructive">{wallet.message}</p> : null}{wallet.status === "success" ? wallet.data.wallet ? <><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-5"><div><p className="text-sm text-muted-foreground">Available balance</p><p className="mt-2 text-3xl font-bold">{formatSatang(wallet.data.wallet.balanceSatang, wallet.data.wallet.currency)}</p></div><Badge variant={wallet.data.wallet.status === "ACTIVE" ? "success" : "warning"}>{formatFinancialStatus(wallet.data.wallet.status)}</Badge></div>{wallet.data.wallet.status === "ACTIVE" && wallet.data.wallet.currency === "THB" ? <WalletTopUpForm role="BORROWER" onPosted={refresh}/> : null}</> : <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">A wallet has not been set up for this account yet.</p> : null}</CardContent></Card>
      <Card><CardHeader><CardTitle>Loan obligations</CardTitle><CardDescription>Outstanding repayment obligations are not deducted from or combined with the wallet balance.</CardDescription></CardHeader><CardContent>{obligations.status === "loading" ? <div role="status" aria-busy="true" aria-label="Loading loan obligations" className="h-24 animate-pulse rounded-lg bg-muted"/> : null}{obligations.status === "error" ? <p role="alert" className="text-sm text-destructive">{obligations.message}</p> : null}{obligations.status === "success" ? <div><p className="text-sm text-muted-foreground">Outstanding loan balance</p><p className="mt-2 text-3xl font-bold">{formatSatang(obligations.data.totalOutstandingBalanceSatang)}</p><p className="mt-2 text-xs text-muted-foreground">{obligations.data.activeLoanCount} active loans · provided by the borrower dashboard API</p></div> : null}</CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Wallet activity</CardTitle><CardDescription>Only completed transactions change your balance. Pending activity is not included yet.</CardDescription></CardHeader><CardContent className="grid gap-4">{wallet.status === "loading" ? <div role="status" aria-busy="true" aria-label="Loading wallet transactions" className="h-48 animate-pulse rounded-lg bg-muted"/> : null}{wallet.status === "error" ? <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{wallet.message}</div> : null}{wallet.status === "success" ? <><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{pagination ? `${pagination.total} transactions` : "Wallet transactions"}</span><label className="flex items-center gap-2 text-sm">Date order<select className="h-10 rounded-md border border-input bg-background px-3" value={sortOrder} onChange={(event) => { setPage(1); setSortOrder(event.target.value as "asc" | "desc"); }}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label></div><FinancialTransactionTable rows={wallet.data.transactions} label="Borrower wallet activity" borrowerReceipts/>{pagination && pagination.totalPages > 1 ? <nav className="flex items-center justify-between" aria-label="Wallet activity pages"><span className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</span><div className="flex gap-2"><Button variant="outline" disabled={!pagination.hasPreviousPage} onClick={() => setPage((current) => current - 1)}>Previous</Button><Button variant="outline" disabled={!pagination.hasNextPage} onClick={() => setPage((current) => current + 1)}>Next</Button></div></nav> : null}</> : null}</CardContent></Card>
    <div className="flex flex-wrap gap-3"><Link className={buttonVariants({ variant: "outline" })} href="/borrower/loans">View loans and schedules</Link><Link className={buttonVariants({ variant: "outline" })} href="/borrower/repayments">Repayment history and receipts</Link></div>
  </main>;
}
