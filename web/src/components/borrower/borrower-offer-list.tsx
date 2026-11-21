"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Clock3, RefreshCw, WalletCards } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { formatDashboardStatus, formatSatang } from "../../lib/client/borrower-dashboard";
import { DEFAULT_BORROWER_OFFERS_PAGE_SIZE, formatOfferDateTime, hasBorrowerOfferRows, loadBorrowerOffers, type BorrowerOffer } from "../../lib/client/borrower-offers";
import { getApplicationErrorMessage } from "../../lib/client/borrower-applications";
import type { ApiPagination } from "../../lib/client/api-client";

export function BorrowerOfferList() {
  const [rows, setRows] = useState<BorrowerOffer[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<ApiPagination>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await loadBorrowerOffers({ page, limit: DEFAULT_BORROWER_OFFERS_PAGE_SIZE, sortOrder: "asc" });
      setRows(response.data);
      setPagination(response.pagination);
      setError(null);
    } catch (cause) {
      setError(getApplicationErrorMessage(cause));
    } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  return <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-9">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">Borrower workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Loan offers</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Review your offer terms and expiration before deciding whether to accept.</p></div><Link className={buttonVariants({ variant: "outline" })} href="/borrower/applications">View applications</Link></header>
    {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><span>{error}</span><Button size="sm" variant="outline" onClick={() => void refresh()}><RefreshCw className="size-4"/>Retry</Button></div> : null}
    {loading && rows.length === 0 ? <div aria-busy="true" aria-label="Loading loan offers" className="grid gap-4 md:grid-cols-2"><div className="h-52 animate-pulse rounded-xl bg-muted"/><div className="h-52 animate-pulse rounded-xl bg-muted"/></div> : null}
    {!loading && !error && !hasBorrowerOfferRows(rows, pagination) ? <Card><CardContent className="grid justify-items-center gap-3 py-12 text-center"><WalletCards className="size-9 text-muted-foreground"/><h2 className="text-lg font-semibold">No offers to review</h2><p className="max-w-md text-sm text-muted-foreground">When an offer is issued for an approved application, its terms will appear here.</p><Link className={buttonVariants({ variant: "outline" })} href="/borrower/applications">View applications</Link></CardContent></Card> : null}
    {rows.length > 0 ? <div className="grid gap-4 md:grid-cols-2">{rows.map((offer) => <Card key={offer.id} className="flex flex-col"><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardDescription>Offer reference</CardDescription><CardTitle className="mt-1 break-all text-base">{offer.id}</CardTitle></div><Badge variant={offer.status === "ACCEPTED" ? "success" : offer.isExpired ? "warning" : "secondary"}>{offer.isExpired ? "Expired" : formatDashboardStatus(offer.status)}</Badge></div><CardDescription>Application {offer.applicationId}</CardDescription></CardHeader><CardContent className="flex flex-1 flex-col gap-4"><dl className="grid grid-cols-2 gap-4"><div><dt className="text-xs text-muted-foreground">Principal</dt><dd className="mt-1 font-semibold">{formatSatang(offer.principalSatang)}</dd></div><div><dt className="text-xs text-muted-foreground">Interest rate</dt><dd className="mt-1 font-semibold">{(Number(offer.annualInterestRate) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}% p.a.</dd></div><div><dt className="text-xs text-muted-foreground">Term</dt><dd className="mt-1 font-semibold">{offer.termMonths} months</dd></div><div><dt className="text-xs text-muted-foreground">Repayment frequency</dt><dd className="mt-1 font-semibold">{formatDashboardStatus(offer.repaymentFrequency)}</dd></div></dl><p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4"/>Expires {formatOfferDateTime(offer.expiresAt)}</p><Link href={`/borrower/offers/${offer.id}`} className={`${buttonVariants({ variant: "outline" })} mt-auto w-full`}>Review offer <ArrowRight className="size-4"/></Link></CardContent></Card>)}</div> : null}
    {pagination && pagination.totalPages > 1 ? <nav aria-label="Offer pages" className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Page {page} of {pagination.totalPages}</p><div className="flex gap-2"><Button variant="outline" disabled={!pagination.hasPreviousPage || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button variant="outline" disabled={!pagination.hasNextPage || loading} onClick={() => setPage((value) => value + 1)}>Next</Button></div></nav> : null}
  </main>;
}
