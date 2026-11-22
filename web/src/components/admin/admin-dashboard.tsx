"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, ClipboardCheck, FileText, Landmark, Users, Wallet, ShieldCheck, type LucideIcon } from "lucide-react";
import { ApiClientError } from "../../lib/client/api-client";
import { formatSatang } from "../../lib/client/financial-format";
import {
  loadAdminDashboardApplications,
  loadAdminDashboardLoans,
  loadAdminDashboardPayouts,
  loadAdminDashboardUsers,
  loadAdminRecentAuditLogs,
  loadAdminRecentRepayments,
  type AdminDashboardAuditRow,
  type AdminDashboardRepaymentRow,
} from "../../lib/client/admin-dashboard";
import { apiGet } from "../../lib/client/api-client";
import { Badge } from "../ui/badge";
import { buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { EmptyState, ErrorState, LoadingState } from "../ui/request-state";
import { useAuth } from "../auth/auth-provider";
import { RoleOnboardingTour } from "../shared/role-onboarding-tour";

type LoadState<T> = { status: "loading" } | { status: "error"; message: string } | { status: "success"; data: T };

function useDashboardSection<T>(load: (signal?: AbortSignal) => Promise<T>): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then((data) => {
      if (!controller.signal.aborted) setState({ status: "success", data });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const message = error instanceof ApiClientError
        ? error.message
        : "This dashboard section could not be loaded. Retry or check its dedicated page.";
      setState({ status: "error", message });
    });
    return () => controller.abort();
  }, [load]);
  return state;
}

const usersLoader = (signal?: AbortSignal) => loadAdminDashboardUsers(apiGet, signal);
const applicationsLoader = (signal?: AbortSignal) => loadAdminDashboardApplications(apiGet, signal);
const loansLoader = (signal?: AbortSignal) => loadAdminDashboardLoans(apiGet, signal);
const payoutsLoader = (signal?: AbortSignal) => loadAdminDashboardPayouts(apiGet, signal);
const repaymentsLoader = (signal?: AbortSignal) => loadAdminRecentRepayments(apiGet, signal);
const auditLoader = (signal?: AbortSignal) => loadAdminRecentAuditLogs(apiGet, signal);

function MetricCard({
  title,
  icon: Icon,
  load,
  value,
  href,
  description,
  tourTarget,
}: {
  title: string;
  icon: LucideIcon;
  load: () => Promise<Record<string, number>>;
  value: (summary: Record<string, number>) => string;
  href: string;
  description: (summary: Record<string, number>) => string;
  tourTarget: string;
}) {
  const state = useDashboardSection(load);
  return <Card className="admin-metric-card" data-tour-target={tourTarget}>
    <CardHeader className="admin-metric-card__header">
      <div className="admin-metric-card__icon" aria-hidden="true"><Icon size={19} /></div>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
    <CardContent>
      {state.status === "loading" ? <LoadingState label={`Loading ${title.toLowerCase()}`} /> : null}
      {state.status === "error" ? <ErrorState title={`${title} unavailable`} message={state.message} /> : null}
      {state.status === "success" ? <>
        <p className="admin-metric-card__value">{value(state.data)}</p>
        <p className="admin-muted">{description(state.data)}</p>
        <Link className="admin-text-link" href={href}>View details <ArrowRight size={15} aria-hidden="true" /></Link>
      </> : null}
    </CardContent>
  </Card>;
}

function ActivityList<T extends { id: string }>({
  title,
  description,
  load,
  rows,
  emptyTitle,
  tourTarget,
}: {
  title: string;
  description: string;
  load: () => Promise<T[]>;
  rows: (data: T[]) => ReactNode;
  emptyTitle: string;
  tourTarget: string;
}) {
  const state = useDashboardSection(load);
  return <Card className="admin-activity-card" data-tour-target={tourTarget}>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent>
      {state.status === "loading" ? <LoadingState label={`Loading ${title.toLowerCase()}`} /> : null}
      {state.status === "error" ? <ErrorState title={`${title} unavailable`} message={state.message} /> : null}
      {state.status === "success" && state.data.length === 0 ? <EmptyState title={emptyTitle} description="New records will appear here when available." /> : null}
      {state.status === "success" && state.data.length > 0 ? rows(state.data) : null}
    </CardContent>
  </Card>;
}

function RepaymentActivity({ data }: { data: AdminDashboardRepaymentRow[] }) {
  return <ul className="admin-activity-list">
    {data.map((row) => <li className="admin-activity-row" key={row.id}>
      <div><span className="admin-activity-row__title">Loan {row.loanId.slice(0, 8)}</span><span className="admin-muted">Installment {row.installment.installmentNumber} · {new Date(row.receivedAt).toLocaleDateString()}</span></div>
      <div className="admin-activity-row__end"><strong>{formatSatang(row.totalSatang)}</strong><Badge variant={row.status === "POSTED" ? "success" : "outline"}>{row.status}</Badge></div>
    </li>)}
  </ul>;
}

function AuditActivity({ data }: { data: AdminDashboardAuditRow[] }) {
  return <ul className="admin-activity-list">
    {data.map((row) => <li className="admin-activity-row" key={row.id}>
      <div><span className="admin-activity-row__title">{row.action.replaceAll("_", " ")}</span><span className="admin-muted">{row.targetType} · {row.targetId ? row.targetId.slice(0, 8) : "No target"}</span></div>
      <div className="admin-activity-row__end"><Badge variant={row.outcome === "SUCCESS" ? "success" : "warning"}>{row.outcome}</Badge><span className="admin-muted">{new Date(row.createdAt).toLocaleString()}</span></div>
    </li>)}
  </ul>;
}

export function AdminDashboardPage() {
  const { identity } = useAuth();
  const displayName = identity?.email ?? "Administrator";
  return <section className="admin-page">
    <header className="admin-page__header">
      <div><p className="admin-eyebrow">NEXUS operations</p><h1>Welcome back, {displayName}</h1><p className="admin-muted">Administrator dashboard · A live operational snapshot from the authorized administrative APIs.</p></div>
      <div className="flex flex-wrap gap-2"><RoleOnboardingTour userId={identity?.id ?? null} role="ADMIN"/><Link data-tour-target="admin-nav-policies" className={buttonVariants({ variant: "outline" })} href="/admin/policies"><ShieldCheck size={16} />Policies</Link><Link data-tour-target="admin-nav-financial" className={buttonVariants({ variant: "outline" })} href="/admin/financial"><ClipboardCheck size={16} />Reconciliation</Link></div>
    </header>

    <div className="admin-metric-grid" data-tour-target="admin-summary">
      <MetricCard title="Users" icon={Users} load={usersLoader} value={(summary) => String(summary.total)} description={(summary) => `${summary.borrowers} borrowers · ${summary.investors} investors`} href="/admin/users" tourTarget="admin-summary" />
      <MetricCard title="Pending applications" icon={FileText} load={applicationsLoader} value={(summary) => String(summary.total)} description={() => "Submitted, under review, or awaiting information"} href="/admin/applications" tourTarget="admin-applications" />
      <MetricCard title="Active loans" icon={Landmark} load={loansLoader} value={(summary) => String(summary.active)} description={() => "Current ACTIVE loan records"} href="/admin/loans" tourTarget="admin-loans" />
      <MetricCard title="Pending investor payouts" icon={Wallet} load={payoutsLoader} value={(summary) => String(summary.pending)} description={() => "Unpaid allocations requiring administrator review"} href="/admin/payouts" tourTarget="admin-payouts" />
    </div>

    <div className="admin-activity-grid">
      <ActivityList title="Recent repayments" description="Latest repayment records and posting states." load={repaymentsLoader} rows={(data) => <RepaymentActivity data={data} />} emptyTitle="No repayment activity" tourTarget="admin-repayments" />
      <ActivityList title="Recent administrative activity" description="Recent immutable audit events." load={auditLoader} rows={(data) => <AuditActivity data={data} />} emptyTitle="No recent administrative activity" tourTarget="admin-audit-logs" />
    </div>
  </section>;
}
