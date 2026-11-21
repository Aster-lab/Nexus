"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, FileText, Plus, RefreshCw } from "lucide-react";
import { ApiClientError, apiGet } from "../../lib/client/api-client";
import { formatDashboardDate, formatDashboardStatus, formatSatang } from "../../lib/client/borrower-dashboard";
import {
  BORROWER_APPLICATION_STATUSES,
  DEFAULT_APPLICATION_PAGE_SIZE,
  getApplicationPurpose,
  hasApplicationRows,
  loadBorrowerApplications,
  type BorrowerApplicationListFilters,
  type BorrowerApplicationListItem,
} from "../../lib/client/borrower-applications";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

type ApplicationListState =
  | { status: "loading" }
  | { status: "success"; items: BorrowerApplicationListItem[]; pagination: NonNullable<Awaited<ReturnType<typeof loadBorrowerApplications>>["pagination"]> }
  | { status: "error"; message: string };

function StatusBadge({ status }: { status: string }) {
  const variant = status === "APPROVED" ? "success" :
    status === "REJECTED" || status === "CLOSED" || status === "WITHDRAWN" ? "outline" : "secondary";
  return <Badge variant={variant}>{formatDashboardStatus(status)}</Badge>;
}

function ApplicationListLoading() {
  return <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">Loading your applications</span>
    {Array.from({ length: 4 }, (_, index) => <Card className="p-5" key={index}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full space-y-2"><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-72 max-w-full" /></div>
        <Skeleton className="h-9 w-28" />
      </div>
    </Card>)}
  </div>;
}

export function BorrowerApplicationList() {
  const [status, setStatus] = useState<BorrowerApplicationListFilters["status"]>("ALL");
  const [sortOrder, setSortOrder] = useState<BorrowerApplicationListFilters["sortOrder"]>("desc");
  const [page, setPage] = useState(1);
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<ApplicationListState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setState({ status: "loading" });
      const filters = { status, page, limit: DEFAULT_APPLICATION_PAGE_SIZE, sortOrder };
      void loadBorrowerApplications(filters, apiGet, controller.signal).then((response) => {
        if (active) setState({ status: "success", items: response.data, pagination: response.pagination! });
      }).catch((error: unknown) => {
        if (active && !(error instanceof Error && error.name === "AbortError")) {
          setState({
            status: "error",
            message: error instanceof ApiClientError ? error.message : "We could not load your applications. Please retry.",
          });
        }
      });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [page, requestVersion, sortOrder, status]);

  function changeStatus(value: BorrowerApplicationListFilters["status"]) {
    setStatus(value);
    setPage(1);
  }

  const filterAnnouncement = status === "ALL" ? "all statuses" : formatDashboardStatus(status);
  const listHasRows = state.status === "success" && hasApplicationRows(state.items, state.pagination);

  return <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
    <header className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-7">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-accent">Borrower workspace</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-primary sm:text-4xl">Your applications</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Track each request and its latest status. Draft applications can be continued from their detail page.</p>
      </div>
      <Link className={buttonVariants({ variant: "default" })} href="/borrower/applications/new">
        <Plus className="size-4" aria-hidden="true" /> New application
      </Link>
    </header>

    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle>Application history</CardTitle>
          <CardDescription className="mt-1">Filter by status and sort by the supported creation date.</CardDescription>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Status
            <select className="h-10 min-w-44 rounded-md border border-border bg-background px-3 text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={status} onChange={(event) => changeStatus(event.target.value as BorrowerApplicationListFilters["status"])}>
              <option value="ALL">All statuses</option>
              {BORROWER_APPLICATION_STATUSES.map((item) => <option key={item} value={item}>{formatDashboardStatus(item)}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Sort by created date
            <select className="h-10 rounded-md border border-border bg-background px-3 text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={sortOrder} onChange={(event) => { setSortOrder(event.target.value as BorrowerApplicationListFilters["sortOrder"]); setPage(1); }}>
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </label>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="sr-only" aria-live="polite">Showing applications with {filterAnnouncement}; sorted {sortOrder === "desc" ? "newest first" : "oldest first"}.</p>
        {state.status === "loading" ? <ApplicationListLoading /> : null}
        {state.status === "error" ? <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <div>
            <p className="font-semibold text-destructive">Applications could not be loaded</p>
            <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
          </div>
          <Button variant="outline" onClick={() => setRequestVersion((version) => version + 1)}><RefreshCw className="size-4" aria-hidden="true" /> Retry</Button>
        </div> : null}
        {state.status === "success" && !listHasRows ? <div className="rounded-xl border border-dashed border-border bg-secondary/40 px-5 py-10 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-card text-primary shadow-sm"><FileText className="size-6" aria-hidden="true" /></span>
          <h2 className="mt-4 text-lg font-semibold text-foreground">{state.pagination.total === 0 && status === "ALL" ? "No applications yet" : "No matching applications"}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
            {state.pagination.total === 0 && status === "ALL"
              ? "Start a draft application when you are ready. You can review the details before saving it."
              : "Try another status filter or clear the current filter to see your applications."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {status === "ALL" ? <Link className={buttonVariants({ variant: "default" })} href="/borrower/applications/new"><Plus className="size-4" aria-hidden="true" /> Create application</Link> : <Button variant="outline" onClick={() => changeStatus("ALL")}>Clear filter</Button>}
          </div>
        </div> : null}
        {state.status === "success" && state.items.length > 0 ? <>
          <ul className="divide-y divide-border">
            {state.items.map((application) => {
              const purpose = getApplicationPurpose(application.currentVersion?.purpose);
              const href = `/borrower/applications/${application.id}`;
              const actionLabel = application.status === "DRAFT" ? "Continue draft" : "View application";
              return <li className="flex flex-col gap-4 py-5 first:pt-1 sm:flex-row sm:items-center sm:justify-between" key={application.id}>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-foreground">Application reference</h2>
                    <StatusBadge status={application.status} />
                  </div>
                  <p className="break-all font-mono text-xs text-muted-foreground" title={application.id}>{application.id}</p>
                  <p className="text-sm text-muted-foreground">
                    {application.currentVersion
                      ? `${formatSatang(application.currentVersion.requestedPrincipalSatang)} · ${application.currentVersion.requestedTermMonths} months${purpose ? ` · ${purpose}` : ""}`
                      : "Request details are not available yet"}
                  </p>
                  <p className="text-xs text-muted-foreground">Submitted {formatDashboardDate(application.submittedAt)} · Updated {formatDashboardDate(application.updatedAt)}</p>
                </div>
                <Link className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-primary hover:underline" href={href}>
                  {actionLabel} <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </li>;
            })}
          </ul>

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {state.pagination.total} application{state.pagination.total === 1 ? "" : "s"} · Page {state.pagination.page} of {Math.max(state.pagination.totalPages, 1)}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!state.pagination.hasPreviousPage} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                <ChevronLeft className="size-4" aria-hidden="true" /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={!state.pagination.hasNextPage} onClick={() => setPage((current) => current + 1)}>
                Next <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </> : null}
      </CardContent>
    </Card>
  </main>;
}
