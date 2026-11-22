import { apiPost } from "./api-client";
import { MAX_WALLET_TOP_UP_SATANG } from "../constants/wallet-top-up";

export type WalletTopUpRole = "BORROWER" | "INVESTOR";
export { MAX_WALLET_TOP_UP_SATANG };

export interface WalletTopUpResult {
  walletId: string;
  amountSatang: string;
  balanceSatang: string;
  currency: "THB";
  ledgerTransactionId: string;
  idempotencyRecordId: string;
  status: "POSTED";
  postedAt: string;
  simulated: true;
  reused: boolean;
}

export function getWalletTopUpPath(role: WalletTopUpRole): string {
  return role === "BORROWER" ? "/api/borrower/wallet/top-ups" : "/api/investor/wallet/top-ups";
}

export function parseWalletTopUpAmount(value: string): bigint | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  try {
    const amount = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
    return amount > 0n && amount <= MAX_WALLET_TOP_UP_SATANG ? amount : null;
  } catch {
    return null;
  }
}

export async function submitWalletTopUp(role: WalletTopUpRole, amountSatang: bigint, idempotencyKey: string): Promise<WalletTopUpResult> {
  return (await apiPost<WalletTopUpResult, { amountSatang: string }>(getWalletTopUpPath(role), { amountSatang: amountSatang.toString() }, { idempotencyKey })).data;
}
