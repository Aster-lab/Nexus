import { ApiError } from "../api/errors";
import { prisma } from "../prisma";
import { requireFinancialAdministrator } from "./financial-authorization.service";
import { withSerializableTransactionRetry } from "./ledger-posting.service";

const ESCROW_ACCOUNT_CODE = "2200";
const ESCROW_ACCOUNT_NAME = "Simulated Escrow";

export async function getEscrowReadiness() {
  const account = await prisma.platformAccount.findUnique({
    where: { accountCode: ESCROW_ACCOUNT_CODE },
    select: {
      id: true,
      accountCode: true,
      accountName: true,
      accountType: true,
      currency: true,
      status: true,
      wallets: { select: { id: true, currency: true, balanceSatang: true, status: true, ownerUserId: true, ownerPlatformAccountId: true } },
    },
  });
  const wallet = account?.wallets[0] ?? null;
  const ready = Boolean(account && account.accountName === ESCROW_ACCOUNT_NAME &&
    account.accountType === "LIABILITY" && account.currency === "THB" && account.status === "ACTIVE" &&
    account.wallets.length === 1 && wallet && wallet.ownerUserId === null &&
    wallet.ownerPlatformAccountId === account.id && wallet.currency === "THB" && wallet.status === "ACTIVE");
  return {
    ready,
    account: account ? {
      id: account.id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      currency: account.currency,
      status: account.status,
      walletCount: account.wallets.length,
    } : null,
    wallet: wallet ? {
      id: wallet.id,
      currency: wallet.currency,
      balanceSatang: wallet.balanceSatang.toString(),
      status: wallet.status,
    } : null,
  };
}

export async function activateEscrowInfrastructure(input: { actorUserId: string; reason: string }) {
  const reason = input.reason.trim();
  if (!reason || reason.length > 500) {
    throw new ApiError("VALIDATION_ERROR", "Provide a reason between 1 and 500 characters.", 400);
  }

  return withSerializableTransactionRetry(async (tx) => {
    await requireFinancialAdministrator(tx, input.actorUserId);
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM platform_accounts WHERE account_code = ${ESCROW_ACCOUNT_CODE} FOR UPDATE
    `;
    let account = await tx.platformAccount.findUnique({
      where: { accountCode: ESCROW_ACCOUNT_CODE },
      select: { id: true, accountCode: true, accountName: true, accountType: true, currency: true, status: true },
    });
    const accountExisted = Boolean(account);
    const previousAccountStatus = account?.status ?? null;
    if (!account) {
      account = await tx.platformAccount.create({
        data: { accountCode: ESCROW_ACCOUNT_CODE, accountName: ESCROW_ACCOUNT_NAME, accountType: "LIABILITY", currency: "THB", status: "ACTIVE" },
        select: { id: true, accountCode: true, accountName: true, accountType: true, currency: true, status: true },
      });
    }
    if (account.accountName !== ESCROW_ACCOUNT_NAME || account.accountType !== "LIABILITY" || account.currency !== "THB") {
      throw new ApiError("ESCROW_ACCOUNT_INVALID", "Platform account 2200 must match the approved Simulated Escrow THB liability definition before activation.", 409);
    }

    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM wallets WHERE owner_platform_account_id = ${account.id}::uuid FOR UPDATE
    `;
    const wallet = await tx.wallet.findUnique({
      where: { ownerPlatformAccountId: account.id },
      select: { id: true, ownerUserId: true, ownerPlatformAccountId: true, currency: true, balanceSatang: true, status: true },
    });
    if (wallet && (wallet.ownerUserId !== null || wallet.ownerPlatformAccountId !== account.id || wallet.currency !== "THB")) {
      throw new ApiError("ESCROW_WALLET_INVALID", "The platform wallet for account 2200 must be unowned and denominated in THB.", 409);
    }
    if (wallet?.status === "CLOSED") {
      throw new ApiError("ESCROW_WALLET_CLOSED", "A closed escrow wallet cannot be reactivated. Provision a reviewed replacement instead.", 409);
    }

    const accountStatus = account.status;
    const walletStatus = wallet?.status ?? null;
    const resultingWallet = wallet
      ? await tx.wallet.update({ where: { id: wallet.id }, data: { status: "ACTIVE" }, select: { id: true, currency: true, balanceSatang: true, status: true } })
      : await tx.wallet.create({ data: { ownerPlatformAccountId: account.id, currency: "THB", balanceSatang: 0n, status: "ACTIVE" }, select: { id: true, currency: true, balanceSatang: true, status: true } });
    const resultingAccount = account.status === "ACTIVE"
      ? account
      : await tx.platformAccount.update({ where: { id: account.id }, data: { status: "ACTIVE" }, select: { id: true, accountCode: true, status: true } });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: "ESCROW_INFRASTRUCTURE_ACTIVATED",
        targetType: "PLATFORM_ACCOUNT",
        targetId: account.id,
        reason,
        oldValues: { accountStatus: previousAccountStatus, accountExisted, walletStatus, walletExisted: Boolean(wallet), balanceSatang: wallet?.balanceSatang.toString() ?? null },
        newValues: { accountStatus: resultingAccount.status, accountCode: resultingAccount.accountCode, walletStatus: resultingWallet.status, walletId: resultingWallet.id, balanceSatang: resultingWallet.balanceSatang.toString() },
        outcome: "SUCCESS",
      },
    });

    return {
      ready: true as const,
      accountCode: resultingAccount.accountCode,
      accountStatus: resultingAccount.status,
      walletId: resultingWallet.id,
      walletStatus: resultingWallet.status,
      currency: resultingWallet.currency,
      balanceSatang: resultingWallet.balanceSatang.toString(),
    };
  });
}
