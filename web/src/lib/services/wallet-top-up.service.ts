import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../api/errors";
import { MAX_WALLET_TOP_UP_SATANG } from "../constants/wallet-top-up";
import { prisma } from "../prisma";
import { withSerializableTransactionRetry } from "./ledger-posting.service";
import { requireUserWalletControlAccount } from "./ledger-control-accounts.service";

const SOURCE_ACCOUNT_CODE = "1300";
const CURRENCY = "THB";
const MAX_BIGINT = 9_223_372_036_854_775_807n;
const OPERATION_TYPE = "SIMULATED_WALLET_TOP_UP";

export interface PostWalletTopUpInput {
  userId: string;
  role: "BORROWER" | "INVESTOR";
  amountSatang: bigint;
  idempotencyKey: string;
}

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

function fail(code: string, message: string, status: number): never {
  throw new ApiError(code, message, status);
}

function makeRequestHash(input: PostWalletTopUpInput, walletId: string): string {
  return createHash("sha256").update(JSON.stringify({
    operationType: OPERATION_TYPE,
    userId: input.userId,
    role: input.role,
    walletId,
    amountSatang: input.amountSatang.toString(),
  })).digest("hex");
}

function readSnapshot(value: Prisma.JsonValue | null): Omit<WalletTopUpResult, "reused"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("IDEMPOTENCY_REQUEST_IN_PROGRESS", "The prior top-up request has no completed result. Check wallet activity before retrying.", 409);
  const record = value as Record<string, unknown>;
  if (typeof record.walletId !== "string" || typeof record.amountSatang !== "string" || typeof record.balanceSatang !== "string" || typeof record.ledgerTransactionId !== "string" || typeof record.idempotencyRecordId !== "string" || typeof record.postedAt !== "string") {
    fail("IDEMPOTENCY_REQUEST_IN_PROGRESS", "The prior top-up request has no completed result. Check wallet activity before retrying.", 409);
  }
  return record as unknown as Omit<WalletTopUpResult, "reused">;
}

async function findExisting(tx: Prisma.TransactionClient, input: PostWalletTopUpInput, walletId: string, requestHash: string): Promise<WalletTopUpResult | null> {
  const existing = await tx.idempotencyRecord.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (!existing) return null;
  if (existing.userId !== input.userId || existing.operationType !== OPERATION_TYPE || existing.requestHash !== requestHash) {
    fail("IDEMPOTENCY_KEY_CONFLICT", "The idempotency key belongs to a different wallet top-up request.", 409);
  }
  if (existing.status !== "COMPLETED") fail("IDEMPOTENCY_REQUEST_IN_PROGRESS", "The prior top-up request has not completed. Check wallet activity before retrying.", 409);
  const result = readSnapshot(existing.responseSnapshot);
  if (result.walletId !== walletId) fail("IDEMPOTENCY_KEY_CONFLICT", "The idempotency key belongs to a different wallet top-up request.", 409);
  return { ...result, reused: true };
}

export async function postSimulatedWalletTopUp(input: PostWalletTopUpInput): Promise<WalletTopUpResult> {
  const key = input.idempotencyKey.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.userId) || !key || key.length > 255 || input.amountSatang <= 0n || input.amountSatang > MAX_WALLET_TOP_UP_SATANG) {
    fail("VALIDATION_ERROR", "Enter a positive amount up to THB 50,000 and provide a valid idempotency key.", 400);
  }
  const normalizedInput = { ...input, idempotencyKey: key };

  try {
    return await withSerializableTransactionRetry(async (tx) => {
      // Lock the owner's wallet before reading its balance; all writes remain one transaction.
      const lockedWallets = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM wallets WHERE owner_user_id = ${normalizedInput.userId}::uuid FOR UPDATE
      `;
      if (lockedWallets.length !== 1) fail("WALLET_NOT_ELIGIBLE", "An active user wallet is required for simulated top-ups.", 422);
      const wallet = await tx.wallet.findUnique({ where: { id: lockedWallets[0].id } });
      if (!wallet || wallet.ownerUserId !== normalizedInput.userId || wallet.ownerPlatformAccountId !== null || wallet.status !== "ACTIVE" || wallet.currency !== CURRENCY) {
        fail("WALLET_NOT_ELIGIBLE", "An active THB user wallet is required for simulated top-ups.", 422);
      }

      const requestHash = makeRequestHash(normalizedInput, wallet.id);
      const existing = await findExisting(tx, normalizedInput, wallet.id, requestHash);
      if (existing) return existing;

      const user = await tx.user.findUnique({ where: { id: normalizedInput.userId }, select: { id: true, accountStatus: true, deactivatedAt: true } });
      if (!user || user.accountStatus !== "ACTIVE" || user.deactivatedAt !== null) fail("FORBIDDEN", "An active account is required for simulated top-ups.", 403);
      const activeRole = await tx.userRole.findFirst({ where: { userId: normalizedInput.userId, revokedAt: null, role: { code: normalizedInput.role } }, select: { id: true } });
      if (!activeRole) fail("FORBIDDEN", "You are not authorized to use this wallet top-up endpoint.", 403);
      if (normalizedInput.role === "BORROWER") {
        const profile = await tx.borrowerProfile.findUnique({ where: { userId: normalizedInput.userId }, select: { id: true } });
        if (!profile) fail("FORBIDDEN", "A borrower profile is required for simulated top-ups.", 403);
      } else {
        const profile = await tx.investorProfile.findFirst({ where: { userId: normalizedInput.userId, investorStatus: "ACTIVE" }, select: { id: true } });
        if (!profile) fail("FORBIDDEN", "An active investor profile is required for simulated top-ups.", 403);
      }

      // Global key uniqueness spans all financial operations, so check after determining owner scope.
      const foreignLedger = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: key }, select: { id: true } });
      if (foreignLedger) fail("IDEMPOTENCY_KEY_CONFLICT", "The idempotency key is already used by another financial request.", 409);

      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM platform_accounts WHERE account_code = ${SOURCE_ACCOUNT_CODE} FOR UPDATE
      `;
      const source = await tx.platformAccount.findUnique({ where: { accountCode: SOURCE_ACCOUNT_CODE } });
      if (!source || source.status !== "ACTIVE" || source.accountType !== "ASSET" || source.currency !== CURRENCY) {
        fail("SOURCE_ACCOUNT_UNAVAILABLE", "The simulated funding source is unavailable. Contact an administrator.", 503);
      }
      if (wallet.balanceSatang > MAX_BIGINT - normalizedInput.amountSatang) fail("VALIDATION_ERROR", "The resulting wallet balance exceeds the supported database range.", 400);

      const idempotencyRecordId = randomUUID();
      const walletControlAccount = await requireUserWalletControlAccount(tx);
      await tx.idempotencyRecord.create({ data: { id: idempotencyRecordId, idempotencyKey: key, userId: normalizedInput.userId, operationType: OPERATION_TYPE, requestHash, status: "PROCESSING" } });
      const now = new Date();
      const ledgerTransaction = await tx.ledgerTransaction.create({ data: {
        transactionType: OPERATION_TYPE,
        status: "DRAFT",
        idempotencyKey: key,
        referenceType: "WALLET_TOP_UP",
        referenceId: idempotencyRecordId,
        description: "Simulated wallet top-up; no real payment was collected.",
      }, select: { id: true } });
      await tx.ledgerEntry.createMany({ data: [
        { ledgerTransactionId: ledgerTransaction.id, platformAccountId: source.id, entryType: "DEBIT", amountSatang: normalizedInput.amountSatang, currency: CURRENCY },
        { ledgerTransactionId: ledgerTransaction.id, walletId: wallet.id, platformAccountId: walletControlAccount.id, entryType: "CREDIT", amountSatang: normalizedInput.amountSatang, currency: CURRENCY },
      ] });
      const balanceSatang = wallet.balanceSatang + normalizedInput.amountSatang;
      const updated = await tx.wallet.updateMany({ where: { id: wallet.id, status: "ACTIVE", currency: CURRENCY, balanceSatang: wallet.balanceSatang }, data: { balanceSatang } });
      if (updated.count !== 1) throw new Error("Wallet balance changed while processing the simulated top-up.");
      const posted = await tx.ledgerTransaction.updateMany({ where: { id: ledgerTransaction.id, status: "DRAFT" }, data: { status: "POSTED", postedAt: now } });
      if (posted.count !== 1) throw new Error("The simulated wallet top-up could not be posted.");

      const snapshot: Omit<WalletTopUpResult, "reused"> = {
        walletId: wallet.id,
        amountSatang: normalizedInput.amountSatang.toString(),
        balanceSatang: balanceSatang.toString(),
        currency: CURRENCY,
        ledgerTransactionId: ledgerTransaction.id,
        idempotencyRecordId,
        status: "POSTED",
        postedAt: now.toISOString(),
        simulated: true,
      };
      await tx.idempotencyRecord.update({ where: { id: idempotencyRecordId }, data: { status: "COMPLETED", responseSnapshot: snapshot as Prisma.InputJsonValue, completedAt: now } });
      await tx.auditLog.create({ data: {
        actorUserId: normalizedInput.userId,
        action: "SIMULATED_WALLET_TOP_UP_POSTED",
        targetType: "WALLET_TOP_UP",
        targetId: ledgerTransaction.id,
        reason: "User requested a simulated wallet credit; no external funds were received.",
        oldValues: { walletBalanceSatang: wallet.balanceSatang.toString() },
        newValues: { walletId: wallet.id, amountSatang: normalizedInput.amountSatang.toString(), balanceSatang: balanceSatang.toString(), currency: CURRENCY, ledgerTransactionId: ledgerTransaction.id, idempotencyRecordId },
        outcome: "SUCCESS",
        correlationId: idempotencyRecordId,
      } });
      return { ...snapshot, reused: false };
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const candidate = error as { code?: unknown };
    if (candidate?.code === "P2002") fail("IDEMPOTENCY_KEY_CONFLICT", "The idempotency key is already used by another financial request.", 409);
    console.error("Simulated wallet top-up failed:", error);
    fail("FINANCIAL_POSTING_FAILED", "The simulated top-up could not be confirmed. Check wallet activity before retrying.", 503);
  }
}
