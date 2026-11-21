import { apiGet, type ApiSuccessEnvelope } from "./api-client";

export interface AdminReconciliationIssue {
  code: string;
  entityId: string;
  message: string;
}

export interface AdminFinancialReconciliation {
  valid: boolean;
  issues: AdminReconciliationIssue[];
  financial: {
    valid: boolean;
    issues: AdminReconciliationIssue[];
    checked: { postedTransactions: number; wallets: number; repayments: number; installments: number; allocations: number };
  };
  payouts: {
    valid: boolean;
    issues: AdminReconciliationIssue[];
    unpaidAllocationIds: string[];
    clearing: null | {
      walletBalanceSatang: string;
      ledgerBalanceSatang: string;
      collectionsSatang: string;
      completedPayoutsSatang: string;
      otherPostedMovementSatang: string;
    };
    checked: { postedTransactions: number; wallets: number; allocations: number; completedPayouts: number; unpaidAllocations: number };
  };
}

export type AdminFinancialFetcher = <T>(path: string) => Promise<ApiSuccessEnvelope<T>>;

export function getAdminFinancialReconciliationPath(): string {
  return "/api/admin/reconciliation";
}

export async function loadAdminFinancialReconciliation(
  fetcher: AdminFinancialFetcher = apiGet,
): Promise<AdminFinancialReconciliation> {
  const response = await fetcher<AdminFinancialReconciliation>(getAdminFinancialReconciliationPath());
  return response.data;
}
