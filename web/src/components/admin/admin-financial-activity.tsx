"use client";

import { useEffect, useRef, useState } from "react";
import { ApiClientError } from "../../lib/client/api-client";
import { formatDashboardStatus } from "../../lib/client/borrower-dashboard";
import { formatSatang } from "../../lib/client/financial-format";
import { parseBahtAmountToSatang } from "../../lib/client/borrower-applications";
import { postAdminOpeningBalance } from "../../lib/client/admin-opening-balance";
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
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [fundingWallet, setFundingWallet] = useState<AdminWalletRow | null>(null);
  const [fundingAmount, setFundingAmount] = useState("");
  const [fundingReason, setFundingReason] = useState("");
  const [fundingError, setFundingError] = useState("");
  const [fundingNotice, setFundingNotice] = useState("");
  const [fundingBusy, setFundingBusy] = useState(false);
  const [fundingConfirm, setFundingConfirm] = useState(false);
  const openingBalanceKeys = useRef(new Map<string, string>());
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
  }, [walletQuery, refreshVersion]);
  useEffect(() => {
    let current = true;
    void loadAdminLedgerTransactions(ledgerQuery).then((result) => { if (!current) return; setLedgerRows(result.data); setLedgerPages(result.pagination ? { page: result.pagination.page, totalPages: result.pagination.totalPages, total: result.pagination.total } : { page: 1, totalPages: 0, total: result.data.length }); setLedgerState("success"); })
      .catch((cause: unknown) => { if (!current) return; setLedgerError(cause instanceof ApiClientError ? cause.message : "Ledger transactions could not be loaded."); setLedgerState("error"); });
    return () => { current = false; };
  }, [ledgerQuery, refreshVersion]);

  function applyWalletFilters(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setWalletState("loading"); setWalletQuery({ ...walletDraft, page: 1 }); }
  function applyLedgerFilters(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setLedgerState("loading"); setLedgerQuery({ ...ledgerDraft, page: 1 }); }
  function changeWalletPage(page: number) { setWalletState("loading"); setWalletQuery((current) => ({ ...current, page })); }
  function changeLedgerPage(page: number) { setLedgerState("loading"); setLedgerQuery((current) => ({ ...current, page })); }

  function reviewOpeningBalance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fundingWallet?.ownerUser || fundingBusy) return;
    const amountSatang = parseBahtAmountToSatang(fundingAmount);
    if (amountSatang === null || amountSatang <= 0n) {
      setFundingError("Enter a positive THB amount with no more than two decimal places.");
      return;
    }
    const reason = fundingReason.trim();
    if (!reason || reason.length > 500) {
      setFundingError("Enter a reason between 1 and 500 characters.");
      return;
    }
    setFundingError("");
    setFundingConfirm(true);
  }

  async function submitOpeningBalance() {
    if (!fundingWallet?.ownerUser || fundingBusy) return;
    const amountSatang = parseBahtAmountToSatang(fundingAmount);
    const reason = fundingReason.trim();
    if (amountSatang === null || amountSatang <= 0n || !reason || reason.length > 500) return;

    const request = { walletId: fundingWallet.id, amountSatang: amountSatang.toString(), reason };
    const requestKey = JSON.stringify(request);
    const idempotencyKey = openingBalanceKeys.current.get(requestKey) ?? `admin-opening-${crypto.randomUUID()}`;
    openingBalanceKeys.current.set(requestKey, idempotencyKey);
    setFundingBusy(true);
    setFundingError("");
    setFundingNotice("");
    try {
      const result = await postAdminOpeningBalance(request, idempotencyKey);
      openingBalanceKeys.current.delete(requestKey);
      setFundingNotice(`Opening balance posted: ${formatSatang(result.data.amountSatang)}. Ledger transaction ${result.data.ledgerTransactionId}.`);
      setFundingWallet(null);
      setFundingAmount("");
      setFundingReason("");
      setFundingConfirm(false);
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      setFundingError(error instanceof ApiClientError
        ? error.message
        : "The result is unconfirmed. Check wallet and ledger activity before retrying; the same request will reuse its idempotency key.");
    } finally {
      setFundingBusy(false);
    }
  }

  return <div className="grid gap-6">
    <Card><CardHeader><CardTitle>Wallet balances</CardTitle><CardDescription>Review simulated wallet projections. Initial funding posts through the audited ledger service; balances are never edited directly.</CardDescription></CardHeader><CardContent className="grid gap-4">
      {fundingNotice ? <p role="status" className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">{fundingNotice}</p> : null}
      <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={applyWalletFilters}><label className="admin-form-label" htmlFor="admin-wallet-status">Status<select id="admin-wallet-status" className="admin-form-control" value={walletDraft.status} onChange={(event) => setWalletDraft((current) => ({ ...current, status: event.target.value as AdminWalletQuery["status"] }))}><option value="ALL">All</option><option value="ACTIVE">Active</option><option value="RESTRICTED">Restricted</option><option value="CLOSED">Closed</option></select></label><label className="admin-form-label" htmlFor="admin-wallet-currency">Currency<input id="admin-wallet-currency" className="admin-form-control" maxLength={3} value={walletDraft.currency} onChange={(event) => setWalletDraft((current) => ({ ...current, currency: event.target.value }))} placeholder="THB" /></label><label className="admin-form-label" htmlFor="admin-wallet-owner">Owner user ID<input id="admin-wallet-owner" className="admin-form-control" value={walletDraft.ownerUserId} onChange={(event) => setWalletDraft((current) => ({ ...current, ownerUserId: event.target.value }))} /></label><label className="admin-form-label" htmlFor="admin-wallet-account">Platform account ID<input id="admin-wallet-account" className="admin-form-control" value={walletDraft.ownerPlatformAccountId} onChange={(event) => setWalletDraft((current) => ({ ...current, ownerPlatformAccountId: event.target.value }))} /></label><label className="admin-form-label" htmlFor="admin-wallet-sort">Sort by<select id="admin-wallet-sort" className="admin-form-control" value={walletDraft.sortBy} onChange={(event) => setWalletDraft((current) => ({ ...current, sortBy: event.target.value as AdminWalletQuery["sortBy"] }))}><option value="createdAt">Created date</option><option value="balanceSatang">Balance</option></select></label><Button type="submit">Apply filters</Button></form>
      {walletState === "loading" ? <LoadingState label="Loading wallet balances" /> : null}{walletState === "error" ? <ErrorState title="Wallet balances unavailable" message={walletError} /> : null}{walletState === "success" && !walletRows.length ? <EmptyState title="No wallets found" description="No wallets match the selected filters." /> : null}
      {walletState === "success" && walletRows.length ? <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Wallet</th><th>Owner</th><th>Platform account</th><th>Balance</th><th>Currency</th><th>Status</th><th>Initial balance</th></tr></thead><tbody>{walletRows.map((row) => <tr key={row.id}><td><span className="admin-table__strong">{row.id}</span><span className="admin-muted">Created {new Date(row.createdAt).toLocaleDateString()}</span></td><td>{row.ownerUser ? <><span className="admin-table__strong">{row.ownerUser.email}</span><span className="admin-muted">{row.ownerUser.borrowerProfile?.legalName ?? row.ownerUser.investorProfile?.displayName ?? row.ownerUser.id}</span></> : <span className="admin-muted">—</span>}</td><td>{row.ownerPlatformAccount ? `${row.ownerPlatformAccount.accountCode} · ${row.ownerPlatformAccount.accountName}` : "—"}</td><td className="font-semibold">{formatSatang(row.balanceSatang, row.currency)}</td><td>{row.currency}</td><td><Badge variant={row.status === "ACTIVE" ? "success" : "warning"}>{formatDashboardStatus(row.status)}</Badge></td><td>{row.openingBalance ? <><Badge variant="success">Posted</Badge><span className="admin-muted">{formatSatang(row.openingBalance.amountSatang)} · {new Date(row.openingBalance.postedAt).toLocaleDateString()}</span></> : row.ownerUser && row.currency === "THB" ? <Button size="sm" variant="outline" disabled={row.status !== "ACTIVE" || fundingBusy} onClick={() => { setFundingWallet(row); setFundingAmount(""); setFundingReason(""); setFundingError(""); setFundingConfirm(false); }}>Assign initial balance</Button> : <span className="admin-muted">—</span>}</td></tr>)}</tbody></table></div><p className="text-xs text-muted-foreground">{walletPages.total} wallets</p><Pagination page={walletPages.page} totalPages={walletPages.totalPages} onPage={changeWalletPage}/></> : null}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Ledger transactions</CardTitle><CardDescription>Posted transaction entries are shown by default. This view is read-only and does not reconcile or repair data.</CardDescription></CardHeader><CardContent className="grid gap-4">
      <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={applyLedgerFilters}><label className="admin-form-label" htmlFor="admin-ledger-status">Status<select id="admin-ledger-status" className="admin-form-control" value={ledgerDraft.status} onChange={(event) => setLedgerDraft((current) => ({ ...current, status: event.target.value as AdminLedgerQuery["status"] }))}><option value="ALL">All</option><option value="POSTED">Posted</option><option value="DRAFT">Draft</option><option value="REVERSED">Reversed</option></select></label><label className="admin-form-label" htmlFor="admin-ledger-type">Transaction type<input id="admin-ledger-type" className="admin-form-control" value={ledgerDraft.transactionType} onChange={(event) => setLedgerDraft((current) => ({ ...current, transactionType: event.target.value }))} /></label><label className="admin-form-label" htmlFor="admin-ledger-reference-type">Reference type<input id="admin-ledger-reference-type" className="admin-form-control" value={ledgerDraft.referenceType} onChange={(event) => setLedgerDraft((current) => ({ ...current, referenceType: event.target.value }))} /></label><label className="admin-form-label" htmlFor="admin-ledger-reference-id">Reference ID<input id="admin-ledger-reference-id" className="admin-form-control" value={ledgerDraft.referenceId} onChange={(event) => setLedgerDraft((current) => ({ ...current, referenceId: event.target.value }))} /></label><label className="admin-form-label" htmlFor="admin-ledger-sort">Sort by<select id="admin-ledger-sort" className="admin-form-control" value={ledgerDraft.sortBy} onChange={(event) => setLedgerDraft((current) => ({ ...current, sortBy: event.target.value as AdminLedgerQuery["sortBy"] }))}><option value="postedAt">Posted date</option><option value="createdAt">Created date</option></select></label><Button type="submit">Apply filters</Button></form>
      {ledgerState === "loading" ? <LoadingState label="Loading ledger transactions" /> : null}{ledgerState === "error" ? <ErrorState title="Ledger unavailable" message={ledgerError} /> : null}{ledgerState === "success" && !ledgerRows.length ? <EmptyState title="No ledger transactions found" description="No transactions match the selected filters." /> : null}
      {ledgerState === "success" && ledgerRows.length ? <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Transaction</th><th>Type</th><th>Reference</th><th>Status</th><th>Posted</th><th>Entries</th></tr></thead><tbody>{ledgerRows.map((row) => <LedgerRow key={row.id} row={row}/>)}</tbody></table></div><p className="text-xs text-muted-foreground">{ledgerPages.total} ledger transactions</p><Pagination page={ledgerPages.page} totalPages={ledgerPages.totalPages} onPage={changeLedgerPage}/></> : null}
    </CardContent></Card>
    {fundingWallet ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="opening-balance-title" className="w-full max-w-lg rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl sm:p-6"><h2 id="opening-balance-title" className="text-lg font-semibold">{fundingConfirm ? "Confirm opening balance" : "Assign initial simulated balance"}</h2><p className="mt-2 break-all text-sm text-muted-foreground">Recipient: {fundingWallet.ownerUser?.email}</p><p className="mt-1 text-sm text-muted-foreground">This posts a balanced opening-balance transaction from account 1300 to the wallet. Posted history is immutable; later corrections require a compensating transaction.</p>{fundingConfirm ? <><dl className="my-5 grid gap-3 rounded-lg bg-muted/50 p-4"><div><dt className="text-sm text-muted-foreground">Credit amount</dt><dd className="font-semibold">{formatSatang(parseBahtAmountToSatang(fundingAmount)?.toString() ?? "0")}</dd></div><div><dt className="text-sm text-muted-foreground">Current wallet balance</dt><dd className="font-semibold">{formatSatang(fundingWallet.balanceSatang, fundingWallet.currency)}</dd></div><div><dt className="text-sm text-muted-foreground">Reason</dt><dd className="break-words">{fundingReason.trim()}</dd></div></dl>{fundingError ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{fundingError}</p> : null}<div className="flex flex-col-reverse justify-end gap-2 sm:flex-row"><Button type="button" variant="outline" disabled={fundingBusy} onClick={() => setFundingConfirm(false)}>Go back</Button><Button type="button" disabled={fundingBusy} onClick={() => void submitOpeningBalance()}>{fundingBusy ? "Posting…" : "Confirm and post"}</Button></div></> : <form className="mt-5 grid gap-4" onSubmit={reviewOpeningBalance}><label className="admin-form-label" htmlFor="opening-balance-amount">Amount (THB)<input id="opening-balance-amount" className="admin-form-control" type="text" inputMode="decimal" autoComplete="off" placeholder="2,000.00" value={fundingAmount} disabled={fundingBusy} onChange={(event) => setFundingAmount(event.target.value)} /></label><label className="admin-form-label" htmlFor="opening-balance-reason">Reason<textarea id="opening-balance-reason" className="admin-form-control min-h-20" maxLength={500} value={fundingReason} disabled={fundingBusy} onChange={(event) => setFundingReason(event.target.value)} /></label><p className="text-sm">Current balance: <strong>{formatSatang(fundingWallet.balanceSatang, fundingWallet.currency)}</strong></p>{fundingError ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{fundingError}</p> : null}<div className="flex flex-col-reverse justify-end gap-2 sm:flex-row"><Button type="button" variant="outline" disabled={fundingBusy} onClick={() => setFundingWallet(null)}>Cancel</Button><Button type="submit" disabled={fundingBusy}>Review opening balance</Button></div></form>}</section></div> : null}
  </div>;
}

function LedgerRow({ row }: { row: AdminLedgerTransactionRow }) {
  return <tr><td><span className="admin-table__strong">{row.id}</span><span className="admin-muted">{row.description}</span></td><td>{formatDashboardStatus(row.transactionType)}</td><td>{row.referenceType ?? "—"}<span className="admin-muted">{row.referenceId ?? "—"}</span></td><td><Badge variant={row.status === "POSTED" ? "success" : row.status === "REVERSED" ? "warning" : "outline"}>{row.status}</Badge></td><td>{row.postedAt ? new Date(row.postedAt).toLocaleString() : "Not posted"}</td><td><details className="admin-row-details"><summary>{row.entries.length} entries</summary><ul className="mt-2 grid gap-2">{row.entries.map((entry) => <li className="rounded-md bg-background p-2 text-xs" key={entry.id}><strong>{entry.entryType}</strong> {formatSatang(entry.amountSatang, entry.currency)}<span className="block text-muted-foreground">{entry.wallet?.ownerUser?.email ?? entry.wallet?.ownerPlatformAccount?.accountName ?? entry.platformAccount?.accountName ?? entry.walletId ?? entry.platformAccountId}</span></li>)}</ul></details></td></tr>;
}
