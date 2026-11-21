import { apiGet, type ApiSuccessEnvelope } from "./api-client";
import type { BorrowerRepaymentHistoryItem, RepaymentFetcher } from "./borrower-repayments";

export interface BorrowerReceipt {
  receiptId: string;
  borrower: { legalName: string };
  loanId: string;
  ledgerTransactionId: string;
  status: string;
  repaymentDate: string;
  receiptTimestamp: string;
  totalReceivedSatang: string;
  principalSatang: string;
  interestSatang: string;
  repaymentIds: string[];
  repayments: Array<{
    repaymentId: string;
    installmentId: string;
    installmentNumber: number;
    ledgerTransactionId: string;
    principalSatang: string;
    interestSatang: string;
    totalSatang: string;
    remainingBalanceSatang: string;
  }>;
}

export function getBorrowerReceiptPath(repaymentId: string): string {
  return `/api/borrower/repayments/${encodeURIComponent(repaymentId)}/receipt`;
}

export async function loadBorrowerReceipt(
  repaymentId: string,
  fetcher: RepaymentFetcher = apiGet,
): Promise<ApiSuccessEnvelope<BorrowerReceipt>> {
  return fetcher<BorrowerReceipt>(getBorrowerReceiptPath(repaymentId));
}

export function canOpenBorrowerReceipt(item: Pick<BorrowerRepaymentHistoryItem, "status" | "ledgerTransaction">): boolean {
  return item.status === "POSTED" && item.ledgerTransaction.status === "POSTED" && item.ledgerTransaction.postedAt !== null;
}
