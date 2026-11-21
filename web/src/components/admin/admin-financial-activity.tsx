"use client";

import { useEffect, useState } from "react";
import { ApiClientError } from "../../lib/client/api-client";
import { formatDashboardStatus } from "../../lib/client/borrower-dashboard";
import { formatSatang } from "../../lib/client/financial-format";
import { loadAdminLedgerTransactions, loadAdminWallets, type AdminLedgerQuery, type AdminLedgerTransactionRow, type AdminWalletQuery, type AdminWalletRow } from "../../lib/client/admin-financial-activity";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { EmptyState, ErrorState, LoadingState } from "../ui/request-state";

const INITIAL_WALLETS: AdminWalletQuery = { page: 1, limit: 10, status: "ALL", currency: "", ownerUserId: "", ownerPlatformAccountId: "", sortBy: "createdAt", sortOrder: "desc" };
const INITIAL_LEDGER: AdminLedgerQuery = { page: 1, limit: 10, status: "POSTED", transactionType: "", referenceType: "", referenceId: "", sortBy: "postedAt", sortOrder: "desc" };

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  if (totalPages < 2) return null;
  return <nav className="flex items-center justify-between" aria-label="Financial records pages"><span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button><Button variant="outline" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</Button></div></nav>;
}

export function AdminFinancialActivity() {
  const [walletQuery, setWalletQuery] = useState(INITIAL_WALLETS);
  const [walletDraft, setWalletDraft] = useState(INITIAL_WALLETS);
  const [walletRows, setWalletRows] = useState<AdminWalletRow[]>([]);
  const [walletPages, setWalletPages] = useState({ page: 1, totalPages: 0, total: 0 });
  const [walletState, setWalletState] = useState<"loading" | "error" | "success">("loading");
  const [walletError, setWalletError] = useState("");
  const [ledgerQuery, setLedgerQuery] = useState(INITIAL_LEDGER);
  const [ledgerDraft, setLedgerDraft] = useState(INITIAL_LEDGER);
  const [ledgerRows, setLedgerRows] = useState<AdminLedgerTransactionRow[]>([]);
  const [ledgerPages, setLedgerPages] = useState({ page: 1, totalPages: 0, total: 0 });
  const [ledgerState, setLedgerState] = useState<"loading" | "error" | "success">("loading");
  const [ledgerError, setLedgerError] = useState("");

  useEffect(() => {
    let current = true;
    void loadAdminWallets(walletQuery).then((result) => { if (!current) return; setWalletRows(result.data); setWalletPages(result.pagination ? { page: result.pagination.page, totalPages: result.pagination.totalPages, total: result.pagination.total } : { page: 1, totalPages: 0, total: result.data.length }); setWalletState("success"); })
      .catch((cause: unknown) => { if (!current) return; setWalletError(cause instanceof ApiClientError ? cause.message : "Wallet balances could not be loaded."); setWalletState("error"); });
    return () => { current = false; };
  }, [walletQuery]);
  useEffect(() => {
    let current = true;
    void loadAdminLedgerTransactions(ledgerQuery).then((result) => { if (!current) return; setLedgerRows(result.data); setLedgerPages(result.pagination ? { page: result.pagination.page, totalPages: result.pagination.totalPages, total: result.pagination.total } : { page: 1, totalPages: 0, total: result.data.length }); setLedgerState("success"); })
      .catch((cause: unknown) => { if (!current) return; setLedgerError(cause instanceof ApiClientError ? cause.message : "Ledger transactions could not be loaded."); setLedgerState("error"); });
    return () => { current = false; };
  }, [ledgerQuery]);

  function applyWalletFilters(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setWalletState("loading"); setWalletQuery({ ...walletDraft, page: 1 }); }
  function applyLedgerFilters(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setLedgerState("loading"); setLedgerQuery({ ...ledgerDraft, page: 1 }); }
  function changeWalletPage(page: number) { setWalletState("loading"); setWalletQuery((current) => ({ ...current, page })); }
  function changeLedgerPage(page: number) { setLedgerState("loading"); setLedgerQuery((current) => ({ ...current, page })); }

  return <div className="grid gap-6">
    <Card><CardHeader><CardTitle>Wallet balances</CardTitle><CardDescription>Administrator read-only view of simulated wallet projections and their owners.</CardDescription></CardHeader><CardContent className="grid gap-4">
      <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={applyWalletFilters}><label className="admin-form-label" htmlFor="admin-wallet-status">Status<select id="admin-wallet-status" className="admin-form-control" value={walletDraft.status} onChange={(event) => setWalletDraft((current) => ({ ...current, status: event.target.value as AdminWalletQuery["status"] }))}><option value="ALL">All</option><option value="ACTIVE">Active</option><option value="RESTRICTED">Restricted</option><option value="CLOSED">Closed</option></select></label><label className="admin-form-label" htmlFor="admin-wallet-currency">Currency<input id="admin-wallet-currency" className="admin-form-control" maxLength={3} value={walletDraft.currency} onChange={(event) => setWalletDraft((current) => ({ ...current, currency: event.target.value }))} placeholder="THB" /></label><label className="admin-form-label" htmlFor="admin-wallet-owner">Owner user ID<input id="admin-wallet-owner" className="admin-form-control" value={walletDraft.ownerUserId} onChange={(event) => setWalletDraft((current) => ({ ...current, ownerUserId: event.target.value }))} /></label><label className="admin-form-label" htmlFor="admin-wallet-account">Platform account ID<input id="admin-wallet-account" className="admin-form-control" value={walletDraft.ownerPlatformAccountId} onChange={(event) => setWalletDraft((current) => ({ ...current, ownerPlatformAccountId: event.target.value }))} /></label><label className="admin-form-label" htmlFor="admin-wallet-sort">Sort by<select id="admin-wallet-sort" className="admin-form-control" value={walletDraft.sortBy} onChange={(event) => setWalletDraft((current) => ({ ...current, sortBy: event.target.value as AdminWalletQuery["sortBy"] }))}><option value="createdAt">Created date</option><option value="balanceSatang">Balance</option></select></label><Button type="submit">Apply filters</Button></form>
      {walletState === "loading" ? <LoadingState label="Loading wallet balances" /> : null}{walletState === "error" ? <ErrorState title="Wallet balances unavailable" message={walletError} /> : null}{walletState === "success" && !walletRows.length ? <EmptyState title="No wallets found" description="No wallets match the selected filters." /> : null}
      {walletState === "success" && walletRows.length ? <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Wallet</th><th>Owner</th><th>Platform account</th><th>Balance</th><th>Currency</th><th>Status</th></tr></thead><tbody>{walletRows.map((row) => <tr key={row.id}><td><span className="admin-table__strong">{row.id}</span><span className="admin-muted">Created {new Date(row.createdAt).toLocaleDateString()}</span></td><td>{row.ownerUser ? <><span className="admin-table__strong">{row.ownerUser.email}</span><span className="admin-muted">{row.ownerUser.borrowerProfile?.legalName ?? row.ownerUser.investorProfile?.displayName ?? row.ownerUser.id}</span></> : <span className="admin-muted">—</span>}</td><td>{row.ownerPlatformAccount ? `${row.ownerPlatformAccount.accountCode} · ${row.ownerPlatformAccount.accountName}` : "—"}</td><td className="font-semibold">{formatSatang(row.balanceSatang, row.currency)}</td><td>{row.currency}</td><td><Badge variant={row.status === "ACTIVE" ? "success" : "warning"}>{formatDashboardStatus(row.status)}</Badge></td></tr>)}</tbody></table></div><p className="text-xs text-muted-foreground">{walletPages.total} wallets</p><Pagination page={walletPages.page} totalPages={walletPages.totalPages} onPage={changeWalletPage}/></> : null}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Ledger transactions</CardTitle><CardDescription>Posted transaction entries are shown by default. This view is read-only and does not reconcile or repair data.</CardDescription></CardHeader><CardContent className="grid gap-4">
      <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={applyLedgerFilters}><label className="admin-form-label" htmlFor="admin-ledger-status">Status<select id="admin-ledger-status" className="admin-form-control" value={ledgerDraft.status} onChange={(event) => setLedgerDraft((current) => ({ ...current, status: event.target.value as AdminLedgerQuery["status"] }))}><option value="ALL">All</option><option value="POSTED">Posted</option><option value="DRAFT">Draft</option><option value="REVERSED">Reversed</option></select></label><label className="admin-form-label" htmlFor="admin-ledger-type">Transaction type<input id="admin-ledger-type" className="admin-form-control" value={ledgerDraft.transactionType} onChange={(event) => setLedgerDraft((current) => ({ ...current, transactionType: event.target.value }))} /></label><label className="admin-form-label" htmlFor="admin-ledger-reference-type">Reference type<input id="admin-ledger-reference-type" className="admin-form-control" value={ledgerDraft.referenceType} onChange={(event) => setLedgerDraft((current) => ({ ...current, referenceType: event.target.value }))} /></label><label className="admin-form-label" htmlFor="admin-ledger-reference-id">Reference ID<input id="admin-ledger-reference-id" className="admin-form-control" value={ledgerDraft.referenceId} onChange={(event) => setLedgerDraft((current) => ({ ...current, referenceId: event.target.value }))} /></label><label className="admin-form-label" htmlFor="admin-ledger-sort">Sort by<select id="admin-ledger-sort" className="admin-form-control" value={ledgerDraft.sortBy} onChange={(event) => setLedgerDraft((current) => ({ ...current, sortBy: event.target.value as AdminLedgerQuery["sortBy"] }))}><option value="postedAt">Posted date</option><option value="createdAt">Created date</option></select></label><Button type="submit">Apply filters</Button></form>
      {ledgerState === "loading" ? <LoadingState label="Loading ledger transactions" /> : null}{ledgerState === "error" ? <ErrorState title="Ledger unavailable" message={ledgerError} /> : null}{ledgerState === "success" && !ledgerRows.length ? <EmptyState title="No ledger transactions found" description="No transactions match the selected filters." /> : null}
      {ledgerState === "success" && ledgerRows.length ? <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Transaction</th><th>Type</th><th>Reference</th><th>Status</th><th>Posted</th><th>Entries</th></tr></thead><tbody>{ledgerRows.map((row) => <LedgerRow key={row.id} row={row}/>)}</tbody></table></div><p className="text-xs text-muted-foreground">{ledgerPages.total} ledger transactions</p><Pagination page={ledgerPages.page} totalPages={ledgerPages.totalPages} onPage={changeLedgerPage}/></> : null}
    </CardContent></Card>
  </div>;
}

function LedgerRow({ row }: { row: AdminLedgerTransactionRow }) {
  return <tr><td><span className="admin-table__strong">{row.id}</span><span className="admin-muted">{row.description}</span></td><td>{formatDashboardStatus(row.transactionType)}</td><td>{row.referenceType ?? "—"}<span className="admin-muted">{row.referenceId ?? "—"}</span></td><td><Badge variant={row.status === "POSTED" ? "success" : row.status === "REVERSED" ? "warning" : "outline"}>{row.status}</Badge></td><td>{row.postedAt ? new Date(row.postedAt).toLocaleString() : "Not posted"}</td><td><details className="admin-row-details"><summary>{row.entries.length} entries</summary><ul className="mt-2 grid gap-2">{row.entries.map((entry) => <li className="rounded-md bg-background p-2 text-xs" key={entry.id}><strong>{entry.entryType}</strong> {formatSatang(entry.amountSatang, entry.currency)}<span className="block text-muted-foreground">{entry.wallet?.ownerUser?.email ?? entry.wallet?.ownerPlatformAccount?.accountName ?? entry.platformAccount?.accountName ?? entry.walletId ?? entry.platformAccountId}</span></li>)}</ul></details></td></tr>;
}
