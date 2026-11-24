import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import { requireFinancialAdministrator } from "./financial-authorization.service";
import { createInAppNotification } from "./notification.service";
import {
  postWalletTransfer,
  withSerializableTransactionRetry,
} from "./ledger-posting.service";

const CURRENCY = "THB";
const CLEARING_ACCOUNT_CODE = "2300";
const PAYOUT_TRANSACTION_TYPE = "INVESTOR_PAYOUT";
const PAYOUT_REFERENCE_TYPE = "PAYOUT_ALLOCATION";

type TransactionClient = Prisma.TransactionClient;

export interface PostInvestorPayoutInput {
  actorUserId: string;
  payoutAllocationId: string;
  idempotencyKey: string;
}

export interface PostedInvestorPayout {
  investorPayoutId: string;
  payoutAllocationId: string;
  ledgerTransactionId: string;
  amountSatang: bigint;
  status: "COMPLETED";
}

export interface PostInvestorPayoutTestOptions {
  afterLedgerPosted?: (
    tx: TransactionClient,
    ledgerTransactionId: string,
  ) => Promise<void>;
  createPayout?: (
    tx: TransactionClient,
    data: Prisma.InvestorPayoutUncheckedCreateInput,
  ) => Promise<{ id: string }>;
  completePayout?: (
    tx: TransactionClient,
    payoutId: string,
    ledgerTransactionId: string,
    completedAt: Date,
  ) => Promise<{ count: number }>;
}

export function assertPayoutRepaymentPosted(
  repaymentStatus: string,
  ledgerStatus: string,
): void {
  if (repaymentStatus !== "POSTED" || ledgerStatus !== "POSTED") {
    throw new Error("Payout requires a POSTED repayment and POSTED ledger transaction.");
  }
}

export function assertPayoutAmountPositive(amountSatang: bigint): void {
  if (amountSatang <= 0n) {
    throw new Error("Payout allocation must have a positive payable amount.");
  }
}

export function assertInvestorWalletCurrency(currency: string): void {
  if (currency !== CURRENCY) {
    throw new Error("Investor wallet currency must be THB.");
  }
}

export function assertPayoutClearingBalance(
  amountSatang: bigint,
  availableSatang: bigint,
): void {
  if (availableSatang < amountSatang) {
    throw new Error("Insufficient balance in the Repayment Clearing wallet.");
  }
}

function validateInput(input: PostInvestorPayoutInput): void {
  if (!input.actorUserId.trim()) {
    throw new Error("An administrator actor is required for payout processing.");
  }
  if (!input.payoutAllocationId.trim()) {
    throw new Error("A payout allocation ID is required.");
  }
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 255) {
    throw new Error("A valid payout idempotency key is required.");
  }
}

async function lockWallets(
  tx: TransactionClient,
  walletIds: string[],
): Promise<void> {
  for (const walletId of [...new Set(walletIds)].sort()) {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM wallets WHERE id = ${walletId}::uuid FOR UPDATE
    `;
  }
}

function resultFromExisting(
  payout: {
    id: string;
    payoutAllocationId: string;
    status: string;
    ledgerTransactionId: string | null;
    principalSatang: bigint;
    interestSatang: bigint;
    ledgerTransaction: { status: string } | null;
  },
  input: PostInvestorPayoutInput,
): PostedInvestorPayout {
  if (payout.payoutAllocationId !== input.payoutAllocationId) {
    throw new Error("Payout idempotency key conflicts with a different allocation.");
  }
  if (
    payout.status !== "COMPLETED" ||
    !payout.ledgerTransactionId ||
    payout.ledgerTransaction?.status !== "POSTED"
  ) {
    throw new Error("The original payout request has not completed.");
  }
  return {
    investorPayoutId: payout.id,
    payoutAllocationId: payout.payoutAllocationId,
    ledgerTransactionId: payout.ledgerTransactionId,
    amountSatang: payout.principalSatang + payout.interestSatang,
    status: "COMPLETED",
  };
}

async function findExistingByKey(
  tx: TransactionClient,
  input: PostInvestorPayoutInput,
): Promise<PostedInvestorPayout | null> {
  const [payout, ledgerTransaction] = await Promise.all([
    tx.investorPayout.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { ledgerTransaction: { select: { status: true } } },
    }),
    tx.ledgerTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true },
    }),
  ]);
  if (payout) return resultFromExisting(payout, input);
  if (ledgerTransaction) {
    throw new Error("Payout idempotency key is already in use.");
  }
  return null;
}

async function createPayout(
  tx: TransactionClient,
  data: Prisma.InvestorPayoutUncheckedCreateInput,
): Promise<{ id: string }> {
  return tx.investorPayout.create({ data, select: { id: true } });
}

async function completePayout(
  tx: TransactionClient,
  payoutId: string,
  ledgerTransactionId: string,
  completedAt: Date,
): Promise<{ count: number }> {
  return tx.investorPayout.updateMany({
    where: { id: payoutId, status: "PENDING", ledgerTransactionId },
    data: { status: "COMPLETED", completedAt, nextRetryAt: null, lastError: null },
  });
}

async function postInvestorPayoutInTransaction(
  tx: TransactionClient,
  input: PostInvestorPayoutInput,
  options: PostInvestorPayoutTestOptions,
): Promise<PostedInvestorPayout> {
  await requireFinancialAdministrator(tx, input.actorUserId);
  const existing = await findExistingByKey(tx, input);
  if (existing) return existing;

  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM payout_allocations WHERE id = ${input.payoutAllocationId}::uuid FOR UPDATE
  `;
  const allocation = await tx.payoutAllocation.findUnique({
    where: { id: input.payoutAllocationId },
    include: {
      investorPayout: true,
      repayment: {
        include: { ledgerTransaction: { select: { id: true, status: true } } },
      },
      investment: {
        include: {
          investorProfile: {
            select: { id: true, userId: true, investorStatus: true },
          },
        },
      },
    },
  });
  if (!allocation) throw new Error("Payout allocation was not found.");
  if (allocation.investorPayout) {
    throw new Error("This allocation already has an investor payout.");
  }

  assertPayoutRepaymentPosted(
    allocation.repayment.status,
    allocation.repayment.ledgerTransaction.status,
  );
  const amountSatang = allocation.principalSatang + allocation.interestSatang;
  assertPayoutAmountPositive(amountSatang);
  if (allocation.recoverySatang !== 0n) {
    throw new Error("Recovery allocation requires a separate payout workflow.");
  }
  if (allocation.investment.investorProfile.investorStatus !== "ACTIVE") {
    throw new Error("Investor profile is not active for payout.");
  }

  const accountBeforeLock = await tx.platformAccount.findUnique({
    where: { accountCode: CLEARING_ACCOUNT_CODE },
    include: { wallets: { select: { id: true } } },
  });
  if (!accountBeforeLock || accountBeforeLock.wallets.length !== 1) {
    throw new Error("Repayment Clearing account must have exactly one wallet.");
  }
  const clearingWalletId = accountBeforeLock.wallets[0].id;
  const investorWalletBeforeLock = await tx.wallet.findUnique({
    where: { ownerUserId: allocation.investment.investorProfile.userId },
    select: { id: true },
  });
  if (!investorWalletBeforeLock) throw new Error("Investor wallet was not found.");

  await lockWallets(tx, [clearingWalletId, investorWalletBeforeLock.id]);

  const [account, clearingWallet, investorWallet] = await Promise.all([
    tx.platformAccount.findUnique({
      where: { accountCode: CLEARING_ACCOUNT_CODE },
      select: { id: true, status: true, accountType: true, currency: true },
    }),
    tx.wallet.findUnique({
      where: { id: clearingWalletId },
      select: {
        id: true, ownerUserId: true, ownerPlatformAccountId: true,
        status: true, currency: true, balanceSatang: true,
      },
    }),
    tx.wallet.findUnique({
      where: { id: investorWalletBeforeLock.id },
      select: {
        id: true, ownerUserId: true, ownerPlatformAccountId: true,
        status: true, currency: true, balanceSatang: true,
      },
    }),
  ]);

  if (
    !account || account.status !== "ACTIVE" || account.accountType !== "LIABILITY" ||
    account.currency !== CURRENCY
  ) {
    throw new Error("Repayment Clearing account is not active or correctly configured.");
  }
  if (
    !clearingWallet || clearingWallet.ownerPlatformAccountId !== account.id ||
    clearingWallet.ownerUserId !== null || clearingWallet.status !== "ACTIVE" ||
    clearingWallet.currency !== CURRENCY
  ) {
    throw new Error("Repayment Clearing wallet must be active and use THB.");
  }
  if (
    !investorWallet ||
    investorWallet.ownerUserId !== allocation.investment.investorProfile.userId ||
    investorWallet.ownerPlatformAccountId !== null ||
    investorWallet.status !== "ACTIVE"
  ) {
    throw new Error("Investor wallet must be active and owned by the allocated investor.");
  }
  assertInvestorWalletCurrency(investorWallet.currency);
  assertPayoutClearingBalance(amountSatang, clearingWallet.balanceSatang);

  const keyUse = await findExistingByKey(tx, input);
  if (keyUse) return keyUse;

  const transfer = await postWalletTransfer(tx, {
    transactionType: PAYOUT_TRANSACTION_TYPE,
    referenceType: PAYOUT_REFERENCE_TYPE,
    referenceId: allocation.id,
    description: `Investor payout for allocation ${allocation.id}`,
    idempotencyKey: input.idempotencyKey,
    debitWalletId: clearingWallet.id,
    creditWalletId: investorWallet.id,
    amountSatang,
  });
  if (transfer.reused) throw new Error("Payout ledger transaction was already used.");
  if (options.afterLedgerPosted) {
    await options.afterLedgerPosted(tx, transfer.ledgerTransactionId);
  }

  const payout = await (options.createPayout ?? createPayout)(tx, {
    investorProfileId: allocation.investment.investorProfile.id,
    walletId: investorWallet.id,
    payoutAllocationId: allocation.id,
    principalSatang: allocation.principalSatang,
    interestSatang: allocation.interestSatang,
    status: "PENDING",
    idempotencyKey: input.idempotencyKey,
    attemptCount: 1,
    ledgerTransactionId: transfer.ledgerTransactionId,
  });

  const completedAt = new Date();
  const updated = await (options.completePayout ?? completePayout)(
    tx, payout.id, transfer.ledgerTransactionId, completedAt,
  );
  if (updated.count !== 1) throw new Error("Investor payout could not be completed.");

  await createInAppNotification(tx, {
    userId: allocation.investment.investorProfile.userId,
    category: "PAYOUT",
    title: "Investor payout completed",
    content: "A repayment allocation has been paid to your simulated wallet. View payout history for details.",
    actionPath: "/investor/payouts",
  });

  await tx.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: "INVESTOR_PAYOUT_COMPLETED",
      targetType: "INVESTOR_PAYOUT",
      targetId: payout.id,
      reason: "Administrator processed an investor repayment allocation.",
      newValues: {
        payoutAllocationId: allocation.id,
        investorPayoutId: payout.id,
        investorProfileId: allocation.investment.investorProfile.id,
        walletId: investorWallet.id,
        ledgerTransactionId: transfer.ledgerTransactionId,
        totalSatang: amountSatang.toString(),
        idempotencyKey: input.idempotencyKey,
      },
      outcome: "SUCCESS",
      correlationId: randomUUID(),
    },
  });

  return {
    investorPayoutId: payout.id,
    payoutAllocationId: allocation.id,
    ledgerTransactionId: transfer.ledgerTransactionId,
    amountSatang,
    status: "COMPLETED",
  };
}

export async function postInvestorPayout(
  input: PostInvestorPayoutInput,
  options: PostInvestorPayoutTestOptions = {},
): Promise<PostedInvestorPayout> {
  validateInput(input);
  return withSerializableTransactionRetry((tx) =>
    postInvestorPayoutInTransaction(tx, input, options),
  );
}
