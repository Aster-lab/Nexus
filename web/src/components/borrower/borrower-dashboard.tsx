"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  Landmark,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { useAuth } from "../auth/auth-provider";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import {
  createInitialBorrowerDashboardData,
  formatDashboardDate,
  formatDashboardStatus,
  formatSatang,
  loadBorrowerDashboard,
  loadBorrowerDashboardResource,
  subscribeBorrowerDashboardRefresh,
  type BorrowerApplicationSummary,
  type BorrowerDashboardData,
  type BorrowerDashboardInstallment,
  type BorrowerDashboardSummary,
  type BorrowerLoanSummary,
  type BorrowerRepaymentSummary,
  type DashboardResource,
  type DashboardResourceKey,
} from "../../lib/client/borrower-dashboard";

function SectionError({ title, message, retry }: { title: string; message: string; retry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert">
      <div className="flex items-start gap-2 text-destructive">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={retry}>Retry this section</Button>
    </div>
  );
}

function SectionLoading({ label }: { label: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading {label}</span>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-11/12" />
      <Skeleton className="h-12 w-4/5" />
    </div>
  );
}

function Panel({
  title,
  description,
  href,
  actionLabel,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description?: string;
  href?: string;
  actionLabel?: string;
  icon: typeof FileText;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
          </div>
        </div>
        {href && actionLabel ? (
          <Link className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline" href={href}>
            <span className="hidden sm:inline">{actionLabel}</span>
            <ArrowUpRight className="size-4" aria-hidden="true" />
            <span className="sr-only">{actionLabel}</span>
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SummaryCards({ resource, retry }: {
  resource: BorrowerDashboardData["summary"];
  retry: () => void;
}) {
  if (resource.status === "loading") {
    return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5" role="status" aria-live="polite" aria-busy="true" aria-label="Loading account summary">
      {Array.from({ length: 5 }, (_, index) => <Card className="p-5" key={index}>
        <Skeleton className="mb-4 size-10 rounded-xl" />
        <Skeleton className="mb-2 h-7 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </Card>)}
    </div>;
  }
  if (resource.status === "error") {
    return <SectionError title="Account summary could not be loaded" message={resource.message} retry={retry} />;
  }

  const summary = resource.data;
  const next = summary.nextInstallment;
  const metrics = [
    { label: "Active loans", value: String(summary.activeLoanCount), icon: Landmark, detail: "Active or overdue" },
    { label: "Outstanding balance", value: formatSatang(summary.totalOutstandingBalanceSatang), icon: CircleDollarSign, detail: "Current loan schedules" },
    { label: "Next installment", value: next ? formatSatang(next.remainingBalanceSatang) : "None due", icon: CalendarClock, detail: next ? `Due ${formatDashboardDate(next.dueDate)}` : "No unpaid installments" },
    { label: "Pending applications", value: String(summary.pendingApplicationCount), icon: FileText, detail: "Drafts and in review" },
    { label: "Available offers", value: String(summary.availableOfferCount), icon: WalletCards, detail: "Valid offers to review" },
  ];

  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
    {metrics.map(({ label, value, icon: Icon, detail }) => <Card className="min-w-0" key={label}>
      <CardContent className="flex h-full items-start gap-3 p-4 sm:p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 break-words text-xl font-bold tracking-tight text-foreground" aria-label={`${label}: ${value}`}>{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>)}
  </div>;
}

function InstallmentList({ items, emptyMessage, overdue = false }: {
  items: BorrowerDashboardInstallment[];
  emptyMessage: string;
  overdue?: boolean;
}) {
  if (items.length === 0) {
    return <div className="flex items-center gap-2 rounded-lg bg-secondary/60 p-4 text-sm text-muted-foreground">
      <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
      <p>{emptyMessage}</p>
    </div>;
  }
  return <ul className="divide-y divide-border">
    {items.map((item) => <li className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between" key={item.installmentId}>
      <div className="min-w-0">
        <p className="font-semibold text-foreground">Installment {item.installmentNumber}</p>
        <p className="text-sm text-muted-foreground">Loan {item.loanId.slice(0, 8)} · Due {formatDashboardDate(item.dueDate)}</p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <Badge variant={overdue ? "warning" : "outline"}>{overdue ? "Overdue" : "Upcoming"}</Badge>
        <span className="font-semibold tabular-nums text-foreground">{formatSatang(item.remainingBalanceSatang)}</span>
      </div>
    </li>)}
  </ul>;
}

function ApplicationSection({ data, retry }: { data: DashboardResource<BorrowerApplicationSummary>; retry: () => void }) {
  if (data.status === "loading") return <SectionLoading label="applications" />;
  if (data.status === "error") return <SectionError title="Applications could not be loaded" message={data.message} retry={retry} />;
  if (data.data.length === 0) return <div className="rounded-lg bg-secondary/60 p-5 text-center">
    <p className="font-semibold text-foreground">No applications yet</p>
    <p className="mt-1 text-sm text-muted-foreground">Your application status will appear here after you start one.</p>
    <Link className={buttonVariants({ variant: "default", size: "sm", className: "mt-4" })} href="/borrower/applications">Start an application</Link>
  </div>;
  return <ul className="divide-y divide-border">
    {data.data.map((application) => <li className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between" key={application.id}>
      <div className="min-w-0">
        <p className="font-semibold text-foreground">Application {application.id.slice(0, 8)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {application.currentVersion ? `${formatSatang(application.currentVersion.requestedPrincipalSatang)} · ${application.currentVersion.requestedTermMonths} months` : "Details not submitted"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Updated {formatDashboardDate(application.updatedAt)}</p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <Badge variant="outline">{formatDashboardStatus(application.status)}</Badge>
        <Link className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline" href="/borrower/applications">
          Applications <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </li>)}
  </ul>;
}

function LoansSection({
  data,
  balances,
  retry,
}: {
  data: DashboardResource<BorrowerLoanSummary>;
  balances: BorrowerDashboardSummary["activeLoans"];
  retry: () => void;
}) {
  if (data.status === "loading") return <SectionLoading label="loans" />;
  if (data.status === "error") return <SectionError title="Loans could not be loaded" message={data.message} retry={retry} />;
  if (data.data.length === 0) return <div className="rounded-lg bg-secondary/60 p-5 text-center">
    <p className="font-semibold text-foreground">No loans to show</p>
    <p className="mt-1 text-sm text-muted-foreground">Accepted offers and their status will appear here.</p>
  </div>;
  return <ul className="divide-y divide-border">
    {data.data.map((loan) => {
      const balance = balances.find((item) => item.loanId === loan.id);
      return <li className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between" key={loan.id}>
        <div className="min-w-0">
          <p className="font-semibold text-foreground">Loan {loan.id.slice(0, 8)}</p>
          <p className="mt-1 text-sm text-muted-foreground">Original principal {formatSatang(loan.principalSatang)} · {loan.termMonths} months</p>
          <p className="mt-1 text-xs text-muted-foreground">Next due {formatDashboardDate(balance?.nextDueDate ?? null)}</p>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <div className="text-left sm:text-right">
            <Badge variant="outline">{formatDashboardStatus(loan.status)}</Badge>
            <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
              {balance ? formatSatang(balance.outstandingBalanceSatang) : "Balance unavailable"}
            </p>
          </div>
          <Link className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline" href={`/borrower/loans/${loan.id}`}>
            Details <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </li>;
    })}
  </ul>;
}

function RepaymentsSection({ data, retry }: {
  data: DashboardResource<BorrowerRepaymentSummary>;
  retry: () => void;
}) {
  if (data.status === "loading") return <SectionLoading label="repayment history" />;
  if (data.status === "error") return <SectionError title="Repayment history could not be loaded" message={data.message} retry={retry} />;
  if (data.data.length === 0) return <div className="rounded-lg bg-secondary/60 p-5 text-center">
    <p className="font-semibold text-foreground">No repayments recorded</p>
    <p className="mt-1 text-sm text-muted-foreground">Posted repayments and receipts will appear here.</p>
  </div>;
  return <ul className="divide-y divide-border">
    {data.data.map((repayment) => <li className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between" key={repayment.id}>
      <div className="min-w-0">
        <p className="font-semibold text-foreground">Installment {repayment.installment.installmentNumber}</p>
        <p className="mt-1 text-sm text-muted-foreground">Received {formatDashboardDate(repayment.receivedAt)} · Loan {repayment.loanId.slice(0, 8)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{formatSatang(repayment.interestSatang)} interest · {formatSatang(repayment.principalSatang)} principal</p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <div className="text-left sm:text-right">
          <Badge variant={repayment.status === "POSTED" && repayment.ledgerTransaction.status === "POSTED" ? "success" : "outline"}>
            {formatDashboardStatus(repayment.status)}
          </Badge>
          <p className="mt-1 font-semibold tabular-nums text-foreground">{formatSatang(repayment.totalSatang)}</p>
        </div>
        {repayment.status === "POSTED" && repayment.ledgerTransaction.status === "POSTED" ? (
          <Link className="text-sm font-semibold text-primary hover:underline" href={`/api/borrower/repayments/${repayment.id}/receipt`}>Receipt</Link>
        ) : null}
      </div>
    </li>)}
  </ul>;
}

export function BorrowerDashboard() {
  const { identity } = useAuth();
  const [data, setData] = useState<BorrowerDashboardData>(createInitialBorrowerDashboardData);
  const [refreshing, setRefreshing] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setRequestVersion((version) => version + 1);
  }, []);

  const retrySection = useCallback((key: DashboardResourceKey) => {
    setData((current) => ({ ...current, [key]: { status: "loading" } }) as BorrowerDashboardData);
    void loadBorrowerDashboardResource(key).then((resource) => {
      setData((current) => ({ ...current, [key]: resource }) as BorrowerDashboardData);
    });
  }, []);

  useEffect(() => {
    return subscribeBorrowerDashboardRefresh(refresh);
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setData(createInitialBorrowerDashboardData());
      void loadBorrowerDashboard(undefined, controller.signal, (key, resource) => {
        if (active) setData((current) => ({ ...current, [key]: resource }) as BorrowerDashboardData);
      }).finally(() => {
        if (active) setRefreshing(false);
      });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [requestVersion]);

  const name = identity?.borrowerProfile?.legalName ?? identity?.email ?? "Borrower";
  const summary = data.summary.status === "success" ? data.summary.data : null;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-7">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-accent">Borrower workspace</p>
          <h1 className="mt-2 break-words text-3xl font-bold tracking-tight text-primary sm:text-4xl">Welcome, {name}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Review your applications, loan balances, upcoming installments, and confirmed repayment activity.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link className={buttonVariants({ variant: "outline", size: "default" })} href="/borrower/wallet">
            Wallet <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link className={buttonVariants({ variant: "outline", size: "default" })} href="/borrower/repayments">
            Repayment history <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link className={buttonVariants({ variant: "outline", size: "default" })} href="/borrower/offers">
            Offers <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Button variant="outline" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>
          <Link className={buttonVariants({ variant: "default", size: "default" })} href="/borrower/applications">
            Applications <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      {refreshing ? <p className="sr-only" role="status" aria-live="polite">Refreshing your dashboard…</p> : null}
      <SummaryCards resource={data.summary} retry={() => retrySection("summary")} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Upcoming installments" description="Amounts due from your current repayment schedules" href="/borrower/loans" actionLabel="View loans" icon={CalendarClock}>
          {data.summary.status === "loading" ? <SectionLoading label="upcoming installments" /> : null}
          {data.summary.status === "error" ? <SectionError title="Upcoming installments could not be loaded" message={data.summary.message} retry={() => retrySection("summary")} /> : null}
          {summary ? <InstallmentList items={summary.upcomingInstallments} emptyMessage="You have no upcoming unpaid installments." /> : null}
        </Panel>
        <Panel title="Overdue installments" description="Past-due amounts, shown without added penalty estimates" href="/borrower/loans" actionLabel="Review loans" icon={Clock3}>
          {data.summary.status === "loading" ? <SectionLoading label="overdue installments" /> : null}
          {data.summary.status === "error" ? <SectionError title="Overdue installments could not be loaded" message={data.summary.message} retry={() => retrySection("summary")} /> : null}
          {summary ? <InstallmentList items={summary.overdueInstallments} emptyMessage="No overdue installments." overdue /> : null}
        </Panel>
        <Panel title="Recent applications" description="Your latest requests and their current status" href="/borrower/applications" actionLabel="View all" icon={FileText}>
          <ApplicationSection data={data.applications} retry={() => retrySection("applications")} />
        </Panel>
        <Panel title="Your loans" description="Principal, current outstanding amount, and next due date" href="/borrower/loans" actionLabel="View loans" icon={Landmark}>
          <LoansSection data={data.loans} balances={summary?.activeLoans ?? []} retry={() => retrySection("loans")} />
        </Panel>
        <Panel title="Recent repayments" description="Posted repayments from your repayment history" href="/borrower/repayments" actionLabel="View history" icon={WalletCards} className="xl:col-span-2">
          <RepaymentsSection data={data.repayments} retry={() => retrySection("repayments")} />
        </Panel>
      </div>
    </main>
  );
}
