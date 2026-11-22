
import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import { requireUserWalletControlAccount } from "./ledger-control-accounts.service";

const OPENING_BALANCE_ACCOUNT_CODE = "1300";
const ADMIN_ROLE_CODE = "ADMIN";
const CURRENCY = "THB";
const MAX_BIGINT = 9_223_372_036_854_775_807n;
const MAX_TRANSACTION_RETRIES = 5;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateOpeningBalanceInput = {
  administratorUserId: string;
  walletId: string;
  amountSatang: bigint;
  idempotencyKey: string;
  reason: string;
};

export type OpeningBalanceErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "SELF_FUNDING_NOT_ALLOWED"
  | "WALLET_NOT_ELIGIBLE"
  | "SOURCE_ACCOUNT_UNAVAILABLE"
  | "OPENING_BALANCE_ALREADY_EXISTS"
  | "IDEMPOTENCY_CONFLICT"
  | "POSTING_FAILED";

export class OpeningBalanceError extends Error {
  constructor(
    public readonly code: OpeningBalanceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OpeningBalanceError";
  }
}

type NormalizedInput = {
  administratorUserId: string;
  walletId: string;
  amountSatang: bigint;
  idempotencyKey: string;
  reason: string;
};

type ExistingOpeningBalance = Prisma.OpeningBalanceGetPayload<{
  include: {
    ledgerTransaction: true;
    wallet: true;
  };
}>;

function reject(code: OpeningBalanceErrorCode, message: string): never {
  throw new OpeningBalanceError(code, message);
}

function normalizeInput(
  input: CreateOpeningBalanceInput,
): NormalizedInput {
  if (
    typeof input.administratorUserId !== "string" ||
    typeof input.walletId !== "string" ||
    typeof input.idempotencyKey !== "string" ||
    typeof input.reason !== "string" ||
    typeof input.amountSatang !== "bigint"
  ) {
    reject("INVALID_INPUT", "Invalid opening-balance request.");
  }

  const normalized: NormalizedInput = {
    administratorUserId: input.administratorUserId.trim(),
    walletId: input.walletId.trim(),
    amountSatang: input.amountSatang,
    idempotencyKey: input.idempotencyKey.trim(),
    reason: input.reason.trim(),
  };

  if (
    !UUID_PATTERN.test(normalized.administratorUserId) ||
    !UUID_PATTERN.test(normalized.walletId) ||
    normalized.amountSatang <= 0n ||
    normalized.amountSatang > MAX_BIGINT ||
    normalized.idempotencyKey.length === 0 ||
    normalized.idempotencyKey.length > 255 ||
    normalized.reason.length === 0
  ) {
    reject("INVALID_INPUT", "Provide valid UUIDs, a positive amount, an idempotency key of at most 255 characters, and a reason.");
  }

  return normalized;
}

function isPrismaError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === code,
  );
}

function isSerializationConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: {
      code?: unknown;
      driverAdapterError?: {
        originalCode?: unknown;
        cause?: { originalCode?: unknown };
      };
    };
  };

  return (
    candidate.code === "P2034" ||
    candidate.code === "40001" ||
    candidate.meta?.code === "40001" ||
    candidate.meta?.driverAdapterError?.originalCode === "40001" ||
    candidate.meta?.driverAdapterError?.cause?.originalCode === "40001" ||
    (candidate.code === "P2010" &&
      typeof candidate.message === "string" &&
      /\b40001\b/.test(candidate.message))
  );
}

function assertSameRequest(
  existing: {
    administratorUserId: string;
    walletId: string;
    amountSatang: bigint;
    reason: string;
  },
  input: NormalizedInput,
): void {
  const matches =
    existing.administratorUserId === input.administratorUserId &&
    existing.walletId === input.walletId &&
    existing.amountSatang === input.amountSatang &&
    existing.reason === input.reason;

  if (!matches) {
    reject("IDEMPOTENCY_CONFLICT", "The idempotency key has already been used with different request data.");
  }
}

function validateExistingResult(
  existing: ExistingOpeningBalance,
  input: NormalizedInput,
): ExistingOpeningBalance {
  assertSameRequest(existing, input);

  if (existing.ledgerTransaction.status !== "POSTED") {
    reject("POSTING_FAILED", "The existing opening-balance record is not posted.");
  }

  return existing;
}

async function findExistingByKey(
  input: NormalizedInput,
): Promise<ExistingOpeningBalance | null> {
  const existing = await prisma.openingBalance.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: {
      ledgerTransaction: true,
      wallet: true,
    },
  });

  return existing
    ? validateExistingResult(existing, input)
    : null;
}

/**
 * Resolve unique-constraint races after the failed transaction has rolled back.
 */
async function resolveUniqueConflict(
  input: NormalizedInput,
): Promise<ExistingOpeningBalance | null> {
  const existingByKey = await findExistingByKey(input);

  if (existingByKey) {
    return existingByKey;
  }

  const existingByWallet = await prisma.openingBalance.findUnique({
    where: { walletId: input.walletId },
    select: { id: true },
  });

  if (existingByWallet) {
    reject("OPENING_BALANCE_ALREADY_EXISTS", "This wallet already has an opening balance.");
  }

  const existingLedger = await prisma.ledgerTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true },
  });

  if (existingLedger) {
    reject("IDEMPOTENCY_CONFLICT", "The idempotency key is already used by another ledger operation.");
  }

  return null;
}

export async function postOpeningBalance(
  input: NormalizedInput,
): Promise<ExistingOpeningBalance> {
  return prisma.$transaction(
    async (tx) => {
      /*
       * Check idempotency inside every transaction attempt.
       * This is important when a concurrent identical request
       * succeeds while this request is being retried.
       */
      const existing = await tx.openingBalance.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: {
          ledgerTransaction: true,
          wallet: true,
        },
      });

      if (existing) {
        return validateExistingResult(existing, input);
      }

      /*
       * Lock the recipient wallet before reading its balance.
       */
      const lockedWallets = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM wallets
        WHERE id = ${input.walletId}::uuid
        FOR UPDATE
      `;

      if (lockedWallets.length !== 1) {
        reject("WALLET_NOT_ELIGIBLE", "The recipient wallet does not exist.");
      }

      const wallet = await tx.wallet.findUnique({
        where: { id: input.walletId },
      });

      if (
        !wallet ||
        !wallet.ownerUserId ||
        wallet.ownerPlatformAccountId !== null ||
        wallet.status !== "ACTIVE" ||
        wallet.currency !== CURRENCY
      ) {
        reject("WALLET_NOT_ELIGIBLE", "The recipient must have an active, user-owned THB wallet.");
      }

      if (wallet.ownerUserId === input.administratorUserId) {
        reject("SELF_FUNDING_NOT_ALLOWED", "An administrator cannot fund their own wallet.");
      }

      /*
       * Validate the administrator account and active ADMIN role.
       */
      const administrator = await tx.user.findUnique({
        where: { id: input.administratorUserId },
        select: {
          id: true,
          accountStatus: true,
          deactivatedAt: true,
        },
      });

      if (
        !administrator ||
        administrator.accountStatus !== "ACTIVE" ||
        administrator.deactivatedAt !== null
      ) {
        reject("UNAUTHORIZED", "The administrator account is not active.");
      }

      const administratorRole = await tx.userRole.findFirst({
        where: {
          userId: input.administratorUserId,
          revokedAt: null,
          role: {
            code: ADMIN_ROLE_CODE,
          },
        },
        select: { id: true },
      });

      if (!administratorRole) {
        reject("UNAUTHORIZED", "The user does not have an active ADMIN role.");
      }

      /*
       * Validate the recipient user account.
       */
      const recipient = await tx.user.findUnique({
        where: { id: wallet.ownerUserId },
        select: {
          id: true,
          accountStatus: true,
          deactivatedAt: true,
        },
      });

      if (
        !recipient ||
        recipient.accountStatus !== "ACTIVE" ||
        recipient.deactivatedAt !== null
      ) {
        reject("WALLET_NOT_ELIGIBLE", "The wallet owner account is not active.");
      }

      /*
       * A recipient must have an active investor profile
       * or an existing borrower profile.
       *
       * BorrowerProfile status is not checked here because
       * its exact status field was not present in the
       * previously shared schema excerpt.
       */
      const investorProfile = await tx.investorProfile.findFirst({
        where: {
          userId: recipient.id,
          investorStatus: "ACTIVE",
        },
        select: { id: true },
      });

      const borrowerProfile = investorProfile
        ? null
        : await tx.borrowerProfile.findUnique({
            where: { userId: recipient.id },
            select: { id: true },
          });

      if (!investorProfile && !borrowerProfile) {
        reject("WALLET_NOT_ELIGIBLE", "The recipient must have an active investor profile or an existing borrower profile.");
      }

      /*
       * Enforce one opening balance per wallet.
       */
      const existingByWallet = await tx.openingBalance.findUnique({
        where: { walletId: wallet.id },
        select: { id: true },
      });

      if (existingByWallet) {
        reject("OPENING_BALANCE_ALREADY_EXISTS", "This wallet already has an opening balance.");
      }

      /*
       * Lock the source account and validate its configuration.
       * Account 1300 is enabled only by its explicit seed/migration configuration.
       */
      const lockedAccounts = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM platform_accounts
        WHERE account_code = ${OPENING_BALANCE_ACCOUNT_CODE}
        FOR UPDATE
      `;

      if (lockedAccounts.length !== 1) {
        reject("SOURCE_ACCOUNT_UNAVAILABLE", "Opening-balance source account 1300 does not exist.");
      }

      const sourceAccount = await tx.platformAccount.findUnique({
        where: { accountCode: OPENING_BALANCE_ACCOUNT_CODE },
      });

      if (
        !sourceAccount ||
        sourceAccount.accountType !== "ASSET" ||
        sourceAccount.currency !== CURRENCY ||
        sourceAccount.status !== "ACTIVE"
      ) {
        reject("SOURCE_ACCOUNT_UNAVAILABLE", "Opening-balance source account 1300 must be an active THB ASSET account.");
      }

      /*
       * Protect PostgreSQL signed BIGINT range.
       */
      if (wallet.balanceSatang > MAX_BIGINT - input.amountSatang) {
        reject(
          "INVALID_INPUT",
          "The resulting wallet balance exceeds the supported database range.",
        );
      }

      const newWalletBalance =
        wallet.balanceSatang + input.amountSatang;
      const walletControlAccount = await requireUserWalletControlAccount(tx);

      const now = new Date();
      const openingBalanceId = randomUUID();
      const correlationId = randomUUID();

      /*
       * Create the ledger header and its balanced entries.
       *
       * Debit: Simulated Opening Balance Asset (1300)
       * Credit: Recipient's user-owned wallet
       */
      const ledgerTransaction = await tx.ledgerTransaction.create({
        data: {
          transactionType: "OPENING_BALANCE",
          status: "DRAFT",
          idempotencyKey: input.idempotencyKey,
          referenceType: "OPENING_BALANCE",
          referenceId: openingBalanceId,
          description: input.reason,
        },
      });

      await tx.ledgerEntry.createMany({
        data: [
          {
            ledgerTransactionId: ledgerTransaction.id,
            platformAccountId: sourceAccount.id,
            entryType: "DEBIT",
            amountSatang: input.amountSatang,
            currency: CURRENCY,
          },
          {
            ledgerTransactionId: ledgerTransaction.id,
            walletId: wallet.id,
            platformAccountId: walletControlAccount.id,
            entryType: "CREDIT",
            amountSatang: input.amountSatang,
            currency: CURRENCY,
          },
        ],
      });

      /*
       * Update the wallet cache conditionally.
       * The row lock and Serializable isolation protect concurrent writes.
       */
      const walletUpdate = await tx.wallet.updateMany({
        where: {
          id: wallet.id,
          balanceSatang: wallet.balanceSatang,
          status: "ACTIVE",
        },
        data: {
          balanceSatang: newWalletBalance,
        },
      });

      if (walletUpdate.count !== 1) {
        throw new OpeningBalanceError(
          "POSTING_FAILED",
          "The recipient wallet changed during opening-balance processing.",
        );
      }

      /*
       * Post before creating the included relation.
       * Deferred ledger constraints are evaluated at transaction commit.
       */
      await tx.ledgerTransaction.update({
        where: { id: ledgerTransaction.id },
        data: {
          status: "POSTED",
          postedAt: now,
        },
      });

      const openingBalance = await tx.openingBalance.create({
        data: {
          id: openingBalanceId,
          walletId: wallet.id,
          administratorUserId: administrator.id,
          ledgerTransactionId: ledgerTransaction.id,
          amountSatang: input.amountSatang,
          currency: CURRENCY,
          idempotencyKey: input.idempotencyKey,
          reason: input.reason,
          approvedAt: now,
          postedAt: now,
        },
        include: {
          ledgerTransaction: true,
          wallet: true,
        },
      });

      /*
       * Record the administrative action in the audit log.
       * Verify the AuditLog outcome type against the generated client.
       */
      await tx.auditLog.create({
        data: {
          actorUserId: administrator.id,
          action: "OPENING_BALANCE_POSTED",
          targetType: "OPENING_BALANCE",
          targetId: openingBalance.id,
          reason: input.reason,
          oldValues: {
            walletBalanceSatang: wallet.balanceSatang.toString(),
          },
          newValues: {
            walletBalanceSatang: newWalletBalance.toString(),
            amountSatang: input.amountSatang.toString(),
            currency: CURRENCY,
            ledgerTransactionId: ledgerTransaction.id,
          },
          outcome: "SUCCESS",
          correlationId,
        },
      });

      return openingBalance;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait : 10_000,
      timeout : 20_000,
    },
  );
}

export async function createOpeningBalance(
  rawInput: CreateOpeningBalanceInput,
): Promise<ExistingOpeningBalance> {
  const input = normalizeInput(rawInput);

  const existing = await findExistingByKey(input);

  if (existing) {
    return existing;
  }

  for (
    let attempt = 1;
    attempt <= MAX_TRANSACTION_RETRIES;
    attempt += 1
  ) {
    try {
      return await postOpeningBalance(input);
    } catch (error) {
      if (error instanceof OpeningBalanceError) {
        throw error;
      }

      if (isSerializationConflict(error)) {
        if (attempt < MAX_TRANSACTION_RETRIES) {
          const backoffWindowMs = 50 * 2 ** (attempt - 1);
          await new Promise((resolve) =>
            setTimeout(resolve, Math.floor(Math.random() * backoffWindowMs)),
          );
          continue;
        }

        /*
         * A concurrent identical request may have committed
         * while this request was retrying.
         */
        const resolved = await findExistingByKey(input);

        if (resolved) {
          return resolved;
        }

        throw new OpeningBalanceError(
          "POSTING_FAILED",
          "Concurrent database activity prevented the opening balance from being posted. Retry the request.",
        );
      }

      if (isPrismaError(error, "P2002")) {
        const resolved = await resolveUniqueConflict(input);

        if (resolved) {
          return resolved;
        }
      }

      /*
       * Keep database details in server-side logs.
       * Do not expose SQL or database internals to callers.
       */
      console.error("Opening balance posting failed:", error);

      reject(
        "POSTING_FAILED",
        "The opening balance could not be posted.",
      );
    }
  }

  reject(
    "POSTING_FAILED",
    "The opening balance could not be posted.",
  );
}
