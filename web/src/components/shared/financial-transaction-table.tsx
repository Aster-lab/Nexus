import Link from "next/link";
import { formatDashboardDate, formatDashboardStatus } from "../../lib/client/borrower-dashboard";
import { formatSatang } from "../../lib/client/financial-format";
import type { RoleWalletTransaction } from "../../lib/client/borrower-wallet";
import { Badge } from "../ui/badge";

export function FinancialTransactionTable({ rows, label, borrowerReceipts = false }: { rows: RoleWalletTransaction[]; label: string; borrowerReceipts?: boolean }) {
  if (rows.length === 0) return <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">No posted wallet activity is available yet.</p>;
  return <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><caption className="sr-only">{label}</caption>
    <thead><tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><th scope="col" className="px-3 py-3 font-semibold">Date</th><th scope="col" className="px-3 py-3 font-semibold">Activity</th><th scope="col" className="px-3 py-3 font-semibold">Reference</th><th scope="col" className="px-3 py-3 font-semibold">Direction</th><th scope="col" className="px-3 py-3 font-semibold">Amount</th><th scope="col" className="px-3 py-3 font-semibold">Status</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.ledgerEntryId} className="border-b border-border last:border-0"><td className="whitespace-nowrap px-3 py-3">{formatDashboardDate(row.postedAt)}</td><td className="px-3 py-3"><span className="font-medium">{formatDashboardStatus(row.transactionType)}</span><span className="block max-w-64 truncate text-xs text-muted-foreground">{row.description}</span>{borrowerReceipts ? row.repayments?.map((repayment) => <Link key={repayment.id} className="mt-1 block text-xs text-primary underline" href={`/borrower/repayments/${encodeURIComponent(repayment.id)}/receipt`}>Repayment receipt · {repayment.id.slice(0, 8)}</Link>) : null}</td><td className="max-w-48 break-all px-3 py-3 font-mono text-xs">{row.referenceId ?? row.ledgerTransactionId}</td><td className="px-3 py-3"><Badge variant={row.direction === "CREDIT" ? "success" : "outline"}>{row.direction === "CREDIT" ? "Credit" : "Debit"}</Badge></td><td className="whitespace-nowrap px-3 py-3 font-semibold">{formatSatang(row.amountSatang, row.currency)}</td><td className="px-3 py-3"><Badge variant={row.status === "POSTED" ? "success" : "outline"}>{formatDashboardStatus(row.status)}</Badge></td></tr>)}</tbody>
  </table></div>;
}
