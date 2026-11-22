import { ApiError } from "../api/errors";
import { prisma } from "../prisma";
import { requireFinancialAdministrator } from "./financial-authorization.service";
import { withSerializableTransactionRetry } from "./ledger-posting.service";

const CLEARING_ACCOUNT_CODE = "2300";
const CLEARING_ACCOUNT_NAME = "Repayment Clearing";

export async function getRepaymentClearingReadiness() {
  const account = await prisma.platformAccount.findUnique({
    where: { accountCode: CLEARING_ACCOUNT_CODE },
    select: {
      id: true,
      accountCode: true,
      accountName: true,
      accountType: true,
      currency: true,
      status: true,
      wallets: {
        select: {
          id: true,
          ownerUserId: true,
          ownerPlatformAccountId: true,
          currency: true,
          balanceSatang: true,
          status: true,
        },
      },
    },
  });
  const wallets = account?.wallets ?? [];
  const wallet = wallets[0] ?? null;
  const accountValid = Boolean(account && account.accountName === CLEARING_ACCOUNT_NAME && account.accountType === "LIABILITY" && account.currency === "THB");
  const walletValid = Boolean(wallet && wallet.ownerUserId === null && wallet.ownerPlatformAccountId === account?.id && wallet.currency === "THB" && wallet.status === "ACTIVE");
  const ready = Boolean(accountValid && account?.status === "ACTIVE" && wallets.length === 1 && walletValid);

  return {
    ready,
    account: account ? {
      id: account.id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      currency: account.currency,
      status: account.status,
      walletCount: wallets.length,
    } : null,
    wallet: wallet ? {
      id: wallet.id,
      currency: wallet.currency,
      balanceSatang: wallet.balanceSatang.toString(),
      status: wallet.status,
    } : null,
  };
}

export async function activateRepaymentClearingInfrastructure(input: { actorUserId: string; reason: string }) {
  const reason = input.reason.trim();
  if (!reason || reason.length > 500) {
    throw new ApiError("VALIDATION_ERROR", "Provide a reason between 1 and 500 characters.", 400);
  }

  return withSerializableTransactionRetry(async (tx) => {
    await requireFinancialAdministrator(tx, input.actorUserId);
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM platform_accounts WHERE account_code = ${CLEARING_ACCOUNT_CODE} FOR UPDATE
    `;
    let account = await tx.platformAccount.findUnique({
      where: { accountCode: CLEARING_ACCOUNT_CODE },
      select: { id: true, accountCode: true, accountName: true, accountType: true, currency: true, status: true },
    });
    const accountExisted = Boolean(account);
    const previousAccountStatus = account?.status ?? null;

    if (!account) {
      account = await tx.platformAccount.create({
        data: {
          accountCode: CLEARING_ACCOUNT_CODE,
          accountName: CLEARING_ACCOUNT_NAME,
          accountType: "LIABILITY",
          currency: "THB",
          status: "ACTIVE",
        },
        select: { id: true, accountCode: true, accountName: true, accountType: true, currency: true, status: true },
      });
    }
    if (account.accountType !== "LIABILITY" || account.currency !== "THB" || account.accountName !== CLEARING_ACCOUNT_NAME) {
      throw new ApiError("CLEARING_ACCOUNT_INVALID", "Platform account 2300 must match the approved Repayment Clearing THB liability definition.", 409);
    }

    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM wallets WHERE owner_platform_account_id = ${account.id}::uuid FOR UPDATE
    `;
    const existingWallets = await tx.wallet.findMany({
      where: { ownerPlatformAccountId: account.id },
      select: { id: true, ownerUserId: true, ownerPlatformAccountId: true, currency: true, balanceSatang: true, status: true },
    });
    if (existingWallets.length > 1) {
      throw new ApiError("CLEARING_WALLETS_AMBIGUOUS", "Account 2300 has more than one wallet; review the database records before activation.", 409);
    }
    const wallet = existingWallets[0] ?? null;
    if (wallet && (wallet.ownerUserId !== null || wallet.ownerPlatformAccountId !== account.id || wallet.currency !== "THB")) {
      throw new ApiError("CLEARING_WALLET_INVALID", "The wallet for account 2300 must be a platform-owned THB wallet.", 409);
    }
    if (wallet?.status === "CLOSED") {
      throw new ApiError("CLEARING_WALLET_CLOSED", "A closed clearing wallet cannot be reactivated. Have an administrator review replacement provisioning.", 409);
    }

    const resultingWallet = wallet
      ? await tx.wallet.update({
          where: { id: wallet.id },
          data: { status: "ACTIVE" },
          select: { id: true, currency: true, balanceSatang: true, status: true },
        })
      : await tx.wallet.create({
          data: { ownerPlatformAccountId: account.id, currency: "THB", balanceSatang: 0n, status: "ACTIVE" },
          select: { id: true, currency: true, balanceSatang: true, status: true },
        });
    const resultingAccount = account.status === "ACTIVE"
      ? account
      : await tx.platformAccount.update({
          where: { id: account.id },
          data: { status: "ACTIVE" },
          select: { id: true, accountCode: true, accountName: true, accountType: true, currency: true, status: true },
        });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: "REPAYMENT_CLEARING_INFRASTRUCTURE_ACTIVATED",
        targetType: "PLATFORM_ACCOUNT",
        targetId: account.id,
        reason,
        oldValues: {
          accountStatus: previousAccountStatus,
          accountExisted,
          walletStatus: wallet?.status ?? null,
          walletExisted: Boolean(wallet),
          balanceSatang: wallet?.balanceSatang.toString() ?? null,
        },
        newValues: {
          accountCode: resultingAccount.accountCode,
          accountStatus: resultingAccount.status,
          walletId: resultingWallet.id,
          walletStatus: resultingWallet.status,
          balanceSatang: resultingWallet.balanceSatang.toString(),
        },
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
