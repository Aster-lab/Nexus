import { apiPost, type ApiPostOptions, type ApiSuccessEnvelope } from "./api-client";

export interface AdminOpeningBalanceRequest {
  walletId: string;
  amountSatang: string;
  reason: string;
}

export interface AdminOpeningBalanceResult {
  id: string;
  walletId: string;
  administratorUserId: string;
  amountSatang: string;
  currency: string;
  reason: string;
  ledgerTransactionId: string;
  status: string;
  postedAt: string;
}

export type AdminOpeningBalancePoster = <T, TBody>(path: string, body: TBody, options?: ApiPostOptions) => Promise<ApiSuccessEnvelope<T>>;

export async function postAdminOpeningBalance(
  input: AdminOpeningBalanceRequest,
  idempotencyKey: string,
  poster: AdminOpeningBalancePoster = apiPost,
): Promise<ApiSuccessEnvelope<AdminOpeningBalanceResult>> {
  return poster<AdminOpeningBalanceResult, AdminOpeningBalanceRequest>(
    "/api/admin/opening-balances",
    input,
    { idempotencyKey },
  );
}
