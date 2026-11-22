"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "../../lib/client/api-client";
import { loadAdminFinancialReconciliation, type AdminFinancialReconciliation } from "../../lib/client/admin-financial";
import { formatSatang } from "../../lib/client/financial-format";
import { AdminFinancialActivity } from "./admin-financial-activity";
import { AdminEscrowStatus } from "./admin-escrow-status";
import { AdminRepaymentClearingStatus } from "./admin-repayment-clearing-status";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { ErrorState, LoadingState } from "../ui/request-state";

export function AdminFinancialPage() {
  const [report, setReport] = useState<AdminFinancialReconciliation | null>(null);
  const [state, setState] = useState<"loading" | "error" | "success">("loading");
  const [error, setError] = useState("");
  const [refreshSequence, setRefreshSequence] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const result = await loadAdminFinancialReconciliation();
      setReport(result);
      setState("success");
      setError("");
    } catch (caught: unknown) {
      setError(caught instanceof ApiClientError ? caught.message : "Financial reconciliation is unavailable.");
      setState("error");
    }
  }, []);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh, refreshSequence]);

  return <section className="admin-page">
    <header className="admin-page__header"><div><p className="admin-eyebrow">Financial</p><h1>Financial overview &amp; reconciliation</h1><p className="admin-muted">Platform financial checks and reported discrepancies.</p></div></header>
    <AdminEscrowStatus />
    <AdminRepaymentClearingStatus onActivated={() => setRefreshSequence((current) => current + 1)} />
    <Card><CardHeader><CardTitle>Read-only reconciliation</CardTitle><CardDescription>This report compares ledger entries, wallet balances, repayments, installments, payouts, and allocations. It never changes financial records.</CardDescription></CardHeader><CardContent>
      {state === "loading" ? <LoadingState label="Loading financial reconciliation" /> : null}
      {state === "error" ? <ErrorState title="Reconciliation unavailable" message={error} /> : null}
      {state === "success" && report ? <div className="admin-financial-report">
        <div className="admin-financial-report__status"><Badge variant={report.valid ? "success" : "warning"}>{report.valid ? "Reconciled" : "Discrepancies found"}</Badge><span className="admin-muted">Read-only report</span></div>
        <h2>Financial checks</h2>
        <div className="admin-detail-metrics">
          <div className="admin-detail-metric"><span>Wallet control (2100)</span><strong>{report.financial.accountBalances.userWalletControlSatang === null ? "Unavailable" : formatSatang(report.financial.accountBalances.userWalletControlSatang)}</strong></div>
          <div className="admin-detail-metric"><span>Principal receivable (1200)</span><strong>{report.financial.accountBalances.loanPrincipalReceivableSatang === null ? "Unavailable" : formatSatang(report.financial.accountBalances.loanPrincipalReceivableSatang)}</strong></div>
          <div className="admin-detail-metric"><span>Outstanding principal</span><strong>{report.financial.accountBalances.expectedOutstandingPrincipalSatang === null ? "—" : formatSatang(report.financial.accountBalances.expectedOutstandingPrincipalSatang)}</strong></div>
        </div>
        <dl className="admin-financial-report__metrics">{Object.entries(report.financial.checked).map(([name, value]) => <div key={name}><dt>{name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</dt><dd>{value}</dd></div>)}</dl>
        <h2>Payout and clearing checks</h2>
        <dl className="admin-financial-report__metrics">{Object.entries(report.payouts.checked).map(([name, value]) => <div key={name}><dt>{name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</dt><dd>{value}</dd></div>)}</dl>
        {report.payouts.clearing ? <div className="admin-detail-metrics"><div className="admin-detail-metric"><span>Clearing wallet balance</span><strong>{formatSatang(report.payouts.clearing.walletBalanceSatang)}</strong></div><div className="admin-detail-metric"><span>Ledger-derived balance</span><strong>{formatSatang(report.payouts.clearing.ledgerBalanceSatang)}</strong></div><div className="admin-detail-metric"><span>Posted collections</span><strong>{formatSatang(report.payouts.clearing.collectionsSatang)}</strong></div><div className="admin-detail-metric"><span>Completed payouts</span><strong>{formatSatang(report.payouts.clearing.completedPayoutsSatang)}</strong></div></div> : <p className="admin-muted">Repayment Clearing wallet is not configured.</p>}
        <h2>Discrepancies</h2>
        {report.issues.length ? <ul className="admin-financial-report__issues">{report.issues.map((issue, index) => <li key={`${issue.code}-${issue.entityId}-${index}`}><Badge variant="warning">{issue.code}</Badge><span className="admin-table__strong">{issue.entityId}</span><p>{issue.message}</p></li>)}</ul> : <p className="admin-muted">No reconciliation discrepancies were reported.</p>}
      </div> : null}
    </CardContent></Card>
    <AdminFinancialActivity />
  </section>;
}
