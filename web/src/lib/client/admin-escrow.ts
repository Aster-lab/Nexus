import { apiGet, apiPost } from "./api-client";

export interface AdminEscrowReadiness {
  ready: boolean;
  account: null | { id: string; accountCode: string; accountName: string; accountType: string; currency: string; status: string; walletCount: number };
  wallet: null | { id: string; currency: string; balanceSatang: string; status: string };
}

export interface AdminEscrowActivation {
  ready: true;
  accountCode: string;
  accountStatus: string;
  walletId: string;
  walletStatus: string;
  currency: string;
  balanceSatang: string;
}

export async function loadAdminEscrowReadiness() {
  return (await apiGet<AdminEscrowReadiness>("/api/admin/escrow")).data;
}

export async function activateAdminEscrow(reason: string) {
  return (await apiPost<AdminEscrowActivation, { reason: string }>("/api/admin/escrow", { reason })).data;
}
