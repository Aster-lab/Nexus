import type { Prisma } from "../../generated/prisma/client";

export const USER_WALLET_CONTROL_ACCOUNT_CODE = "2100";
export const LOAN_RECEIVABLE_ACCOUNT_CODE = "1200";
export const SIMULATED_FUNDING_ASSET_ACCOUNT_CODE = "1300";

export interface LoanPrincipalAccounts {
  loanReceivable: { id: string };
  fundingAsset: { id: string };
}

/** Resolve the active liability control account used by every user-owned wallet posting. */
export async function requireUserWalletControlAccount(
  tx: Prisma.TransactionClient,
): Promise<{ id: string }> {
  const rows = await tx.platformAccount.findMany({
    where: {
      accountCode: USER_WALLET_CONTROL_ACCOUNT_CODE,
    },
    select: { id: true, accountCode: true, accountType: true, currency: true, status: true },
  });
  const account = rows[0];

  if (
    !account || account.accountType !== "LIABILITY" ||
    account.status !== "ACTIVE" || account.currency !== "THB"
  ) {
    throw new Error("User Wallet Control account 2100 must be configured as an active THB liability account.");
  }

  return { id: account.id };
}

/** Resolve the active asset accounts used for principal receivable movements. */
export async function requireLoanPrincipalAccounts(
  tx: Prisma.TransactionClient,
): Promise<LoanPrincipalAccounts> {
  const rows = await tx.platformAccount.findMany({
    where: { accountCode: { in: [LOAN_RECEIVABLE_ACCOUNT_CODE, SIMULATED_FUNDING_ASSET_ACCOUNT_CODE] } },
    select: { id: true, accountCode: true, accountType: true, currency: true, status: true },
  });
  const byCode = new Map(rows.map((row) => [row.accountCode, row]));
  const loanReceivable = byCode.get(LOAN_RECEIVABLE_ACCOUNT_CODE);
  const fundingAsset = byCode.get(SIMULATED_FUNDING_ASSET_ACCOUNT_CODE);
  if (
    !loanReceivable || loanReceivable.accountType !== "ASSET" ||
    !fundingAsset || fundingAsset.accountType !== "ASSET" ||
    [loanReceivable, fundingAsset].some((account) => account.status !== "ACTIVE" || account.currency !== "THB")
  ) {
    throw new Error("Loan receivable account 1200 and funding asset account 1300 must be active THB asset accounts.");
  }
  return {
    loanReceivable: { id: loanReceivable.id },
    fundingAsset: { id: fundingAsset.id },
  };
}

export async function getAssetAccountBalance(
  tx: Prisma.TransactionClient,
  accountId: string,
): Promise<bigint> {
  const [row] = await tx.$queryRaw<Array<{ balanceSatang: bigint }>>`
    SELECT COALESCE(SUM(
      CASE WHEN e."entry_type" = 'DEBIT'::"ledger_entry_type"
        THEN e."amount_satang" ELSE -e."amount_satang" END
    ), 0)::BIGINT AS "balanceSatang"
    FROM "ledger_entries" e
    JOIN "ledger_transactions" t ON t."id" = e."ledger_transaction_id"
      AND t."status" = 'POSTED'::"ledger_transaction_status"
    WHERE e."platform_account_id" = ${accountId}::uuid
  `;
  return row?.balanceSatang ?? 0n;
}
