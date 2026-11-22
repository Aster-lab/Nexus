"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowRight, ClipboardCheck, FileText, Landmark, RefreshCw, Users, Wallet, ShieldCheck, type LucideIcon } from "lucide-react";
import { formatSatang } from "../../lib/client/financial-format";
import {
  type AdminDashboardOverview,
  type AdminDashboardSection,
  type AdminDashboardAuditRow,
  type AdminDashboardRepaymentRow,
  invalidateAdminDashboardCache,
  loadAdminDashboardOverview,
} from "../../lib/client/admin-dashboard";
import { Badge } from "../ui/badge";
import { buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { EmptyState, ErrorState, LoadingState } from "../ui/request-state";
import { useAuth } from "../auth/auth-provider";
import { RoleOnboardingTour } from "../shared/role-onboarding-tour";
import { Button } from "../ui/button";

function initialDashboard(): AdminDashboardOverview {
  return {
    users: { status: "loading" }, applications: { status: "loading" }, loans: { status: "loading" },
    payouts: { status: "loading" }, repayments: { status: "loading" }, audit: { status: "loading" },
  };
}

function MetricCard({
  title,
  icon: Icon,
  state,
  value,
  href,
  description,
  tourTarget,
}: {
  title: string;
  icon: LucideIcon;
  state: AdminDashboardSection<Record<string, number>>;
  value: (summary: Record<string, number>) => string;
  href: string;
  description: (summary: Record<string, number>) => string;
  tourTarget: string;
}) {
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
  state,
  rows,
  emptyTitle,
  tourTarget,
}: {
  title: string;
  description: string;
  state: AdminDashboardSection<T[]>;
  rows: (data: T[]) => ReactNode;
  emptyTitle: string;
  tourTarget: string;
}) {
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
  const [data, setData] = useState<AdminDashboardOverview>(initialDashboard);
  const loadDashboard = useCallback((force = false) => {
    if (force) invalidateAdminDashboardCache(identity?.id);
    const controller = new AbortController();
    void loadAdminDashboardOverview(undefined, controller.signal, identity?.id).then((overview) => {
      if (!controller.signal.aborted) setData(overview);
    });
    return () => controller.abort();
  }, [identity?.id]);
  useEffect(() => {
    return loadDashboard();
  }, [loadDashboard]);
  return <section className="admin-page">
    <header className="admin-page__header">
      <div><p className="admin-eyebrow">NEXUS operations</p><h1>Administrator dashboard</h1><p className="admin-muted">Welcome back, {displayName}. Here’s your overview of platform activity and items that may need attention.</p></div>
      <div className="flex flex-wrap gap-2"><RoleOnboardingTour userId={identity?.id ?? null} role="ADMIN"/><Button variant="outline" onClick={() => loadDashboard(true)}><RefreshCw size={16} />Refresh</Button><Link data-tour-target="admin-nav-policies" className={buttonVariants({ variant: "outline" })} href="/admin/policies"><ShieldCheck size={16} />Policies</Link><Link data-tour-target="admin-nav-financial" className={buttonVariants({ variant: "outline" })} href="/admin/financial"><ClipboardCheck size={16} />Reconciliation</Link></div>
    </header>

    <div className="admin-metric-grid" data-tour-target="admin-summary">
      <MetricCard title="Users" icon={Users} state={data.users} value={(summary) => String(summary.total)} description={(summary) => `${summary.borrowers} borrowers · ${summary.investors} investors`} href="/admin/users" tourTarget="admin-summary" />
      <MetricCard title="Pending applications" icon={FileText} state={data.applications} value={(summary) => String(summary.total)} description={() => "Submitted, under review, or awaiting information"} href="/admin/applications" tourTarget="admin-applications" />
      <MetricCard title="Active loans" icon={Landmark} state={data.loans} value={(summary) => String(summary.active)} description={() => "Loans currently in progress"} href="/admin/loans" tourTarget="admin-loans" />
      <MetricCard title="Pending investor payouts" icon={Wallet} state={data.payouts} value={(summary) => String(summary.pending)} description={() => "Allocations awaiting payout review"} href="/admin/payouts" tourTarget="admin-payouts" />
    </div>

    <div className="admin-activity-grid">
      <ActivityList title="Recent repayments" description="Latest repayments and their posting status." state={data.repayments} rows={(rows) => <RepaymentActivity data={rows} />} emptyTitle="No repayment activity" tourTarget="admin-repayments" />
      <ActivityList title="Recent administrative activity" description="Recent immutable audit events." state={data.audit} rows={(rows) => <AuditActivity data={rows} />} emptyTitle="No recent administrative activity" tourTarget="admin-audit-logs" />
    </div>
  </section>;
}
