"use client";

import { useRef, useState, type FormEvent } from "react";
import { ApiClientError } from "../../lib/client/api-client";
import { formatSatang } from "../../lib/client/financial-format";
import { parseWalletTopUpAmount, submitWalletTopUp, type WalletTopUpResult, type WalletTopUpRole } from "../../lib/client/wallet-top-ups";
import { Button } from "../ui/button";

interface WalletTopUpFormProps {
  role: WalletTopUpRole;
  onPosted: () => Promise<void> | void;
}

interface Attempt {
  key: string;
  amountSatang: bigint;
}

export function WalletTopUpForm({ role, onPosted }: WalletTopUpFormProps) {
  const [amount, setAmount] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<WalletTopUpResult | null>(null);
  const submitting = useRef(false);
  const amountSatang = parseWalletTopUpAmount(amount);
  const retrying = Boolean(attempt);
  const amountInvalid = amount.trim() !== "" && amountSatang === null;

  function requestConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !amountSatang) return;
    if (attempt && attempt.amountSatang !== amountSatang) {
      setError("This request has an unconfirmed result. Retry it with the same amount or confirm the previous result in wallet activity before starting another top-up.");
      return;
    }
    setError("");
    setConfirmationOpen(true);
  }

  async function confirmTopUp() {
    if (submitting.current || !amountSatang) return;
    submitting.current = true;
    setPending(true);
    setError("");
    const currentAttempt = attempt && attempt.amountSatang === amountSatang
      ? attempt
      : { key: crypto.randomUUID(), amountSatang };
    setAttempt(currentAttempt);
    try {
      const posted = await submitWalletTopUp(role, currentAttempt.amountSatang, currentAttempt.key);
      setResult(posted);
      setAttempt(null);
      setAmount("");
      setConfirmationOpen(false);
      try {
        await onPosted();
      } catch {
        setError("The top-up posted successfully, but wallet activity could not refresh. Use Refresh to load the latest balance.");
      }
    } catch (cause) {
      const isUncertain = !(cause instanceof ApiClientError) || cause.code === "NETWORK_ERROR" || cause.status >= 500;
      if (!isUncertain) setAttempt(null);
      setError(isUncertain
        ? "We could not confirm whether this simulated top-up completed. Retry this same request to safely check its result; the same idempotency key prevents a duplicate credit."
        : cause instanceof ApiClientError ? cause.message : "The simulated top-up was rejected.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <section className="grid min-w-0 gap-3 rounded-xl border border-border p-4" aria-labelledby={`${role.toLowerCase()}-wallet-top-up-title`}>
    <div><h3 id={`${role.toLowerCase()}-wallet-top-up-title`} className="font-semibold">Add simulated funds</h3><p className="mt-1 text-sm text-muted-foreground">This credits your simulated NEXUS wallet through the financial ledger. No real bank deposit or payment is made. Each top-up can be up to ฿50,000.</p></div>
    {result ? <p role="status" className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm">Top-up posted: {formatSatang(result.amountSatang)}. Confirmed ledger transaction {result.ledgerTransactionId}.</p> : null}
    <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={requestConfirmation}>
      <label className="grid min-w-0 gap-1.5 text-sm font-medium" htmlFor={`${role.toLowerCase()}-top-up-amount`}>Amount (THB)
        <input id={`${role.toLowerCase()}-top-up-amount`} className="box-border h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} disabled={pending || retrying} aria-invalid={amountInvalid} aria-describedby={`${role.toLowerCase()}-top-up-limit${amountInvalid ? ` ${role.toLowerCase()}-top-up-error` : ""}`} onChange={(event) => { setAmount(event.target.value); setResult(null); }}/>
      </label>
      <Button type="submit" disabled={pending || !amountSatang}>{retrying ? "Review same request" : "Review top-up"}</Button>
      <p id={`${role.toLowerCase()}-top-up-limit`} className="text-xs text-muted-foreground sm:col-span-2">Enter a positive THB amount with up to two decimal places. Maximum per top-up: ฿50,000.</p>
      {amountInvalid ? <p id={`${role.toLowerCase()}-top-up-error`} role="alert" className="text-sm text-destructive sm:col-span-2">Enter a valid positive THB amount with no more than two decimal places and a maximum of ฿50,000.</p> : null}
    </form>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {confirmationOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setConfirmationOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby={`${role.toLowerCase()}-top-up-confirm-title`} className="w-full max-w-md rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl sm:p-6"><h2 id={`${role.toLowerCase()}-top-up-confirm-title`} className="text-lg font-semibold">Confirm simulated top-up</h2><p className="mt-2 text-sm text-muted-foreground">A ledger posting will credit this amount to your simulated wallet. No external funds will be collected.</p><p className="my-5 rounded-lg bg-muted/50 p-4 text-2xl font-bold">{formatSatang((amountSatang ?? 0n).toString())}</p><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" disabled={pending} onClick={() => setConfirmationOpen(false)}>Go back</Button><Button disabled={pending || !amountSatang} onClick={() => void confirmTopUp()}>{pending ? "Posting…" : retrying ? "Retry same top-up" : "Confirm top-up"}</Button></div></section></div> : null}
  </section>;
}
