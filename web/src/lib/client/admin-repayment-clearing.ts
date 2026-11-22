import { apiGet, apiPost } from "./api-client";

export interface AdminRepaymentClearingReadiness {
  ready: boolean;
  account: null | { id: string; accountCode: string; accountName: string; accountType: string; currency: string; status: string; walletCount: number };
  wallet: null | { id: string; currency: string; balanceSatang: string; status: string };
}

export interface AdminRepaymentClearingActivation {
  ready: true;
  accountCode: string;
  accountStatus: string;
  walletId: string;
  walletStatus: string;
  currency: string;
  balanceSatang: string;
}

export async function loadAdminRepaymentClearingReadiness() {
  return (await apiGet<AdminRepaymentClearingReadiness>("/api/admin/repayment-clearing")).data;
}

export async function activateAdminRepaymentClearing(reason: string) {
  return (await apiPost<AdminRepaymentClearingActivation, { reason: string }>("/api/admin/repayment-clearing", { reason })).data;
}
