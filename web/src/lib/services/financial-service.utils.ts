
import { Prisma } from "../../generated/prisma/client";

export type TransactionClient = Prisma.TransactionClient;

export class FinancialServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "FinancialServiceError";
  }
}

export function reject(
  message: string,
  code: string,
): never {
  throw new FinancialServiceError(message, code);
}

export function validateReason(
  reason: string,
  maxLength = 1000,
): string {
  if (
    typeof reason !== "string" ||
    !reason.trim() ||
    reason.trim().length > maxLength
  ) {
    reject("A valid reason is required.", "INVALID_REASON");
  }

  return reason.trim();
}

export function validateIdempotencyKey(
  key: string,
  maxLength = 255,
): string {
  if (
    typeof key !== "string" ||
    !key.trim() ||
    key.trim().length > maxLength
  ) {
    reject(
      "A valid idempotency key is required.",
      "INVALID_IDEMPOTENCY_KEY",
    );
  }

  return key.trim();
}


export function isRetryableTransactionError(
  error: unknown,
): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    meta?: {
      code?: unknown;
      driverAdapterError?: {
        kind?: unknown;
        originalCode?: unknown;
        cause?: {
          kind?: unknown;
          originalCode?: unknown;
        };
      };
    };
    cause?: {
      kind?: unknown;
      originalCode?: unknown;
    };
  };

  if (candidate.code === "P2034") {
    return true;
  }

  const adapterError = candidate.meta?.driverAdapterError;

  if (
    adapterError?.kind === "TransactionWriteConflict" ||
    adapterError?.originalCode === "40001" ||
    adapterError?.cause?.kind === "TransactionWriteConflict" ||
    adapterError?.cause?.originalCode === "40001"
  ) {
    return true;
  }

  if (
    candidate.cause?.kind === "TransactionWriteConflict" ||
    candidate.cause?.originalCode === "40001"
  ) {
    return true;
  }

  return false;
}


export function isUniqueConstraintError(
  error: unknown,
): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function assertAdministrator(
  tx: TransactionClient,
  userId: string,
): Promise<void> {
  if (!userId) {
    reject("Administrator ID is required.", "INVALID_REFERENCE");
  }

  const [assignment, user] = await Promise.all([
    tx.userRole.findFirst({
      where: {
        userId,
        role: { code: "ADMIN" },
      },
      select: { id: true },
    }),
    tx.user.findUnique({
      where: { id: userId },
      select: { accountStatus: true },
    }),
  ]);

  if (!assignment) {
    reject(
      "Administrator privileges are required.",
      "ADMIN_REQUIRED",
    );
  }

  if (!user || user.accountStatus !== "ACTIVE") {
    reject(
      "Administrator account is inactive.",
      "INVALID_ADMIN",
    );
  }
}

export async function lockLoan(
  tx: TransactionClient,
  loanId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id
    FROM loans
    WHERE id = ${loanId}::uuid
    FOR UPDATE
  `;
}

export async function lockEscrowAccount(
  tx: TransactionClient,
  escrowAccountId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id
    FROM escrow_accounts
    WHERE id = ${escrowAccountId}::uuid
    FOR UPDATE
  `;
}

export async function lockWallets(
  tx: TransactionClient,
  walletIds: string[],
): Promise<void> {
  const orderedIds = [...new Set(walletIds)].sort();

  for (const walletId of orderedIds) {
    await tx.$queryRaw`
      SELECT id
      FROM wallets
      WHERE id = ${walletId}::uuid
      FOR UPDATE
    `;
  }
}

export const FINANCIAL_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const;

export const MAX_FINANCIAL_RETRIES = 3;
