
import { Prisma } from "../../generated/prisma/client";
import {prisma} from "../prisma";
import {
  getAssetAccountBalance,
  requireLoanPrincipalAccounts,
  requireUserWalletControlAccount,
} from "./ledger-control-accounts.service";

const CURRENCY = "THB";

export interface PostWalletTransferInput {
  transactionType: string;
  referenceType: string;
  referenceId: string;
  description: string;
  idempotencyKey: string;

  debitWalletId: string;
  creditWalletId: string;

  amountSatang: bigint;
  principalReceivableMovement?: { amountSatang: bigint };
}

export interface PostedWalletTransfer {
  ledgerTransactionId: string;
  amountSatang: bigint;
  reused: boolean;
}

function validateInput(input: PostWalletTransferInput): void {
  if (
    !input.transactionType ||
    !input.referenceType ||
    !input.referenceId ||
    !input.description ||
    !input.idempotencyKey ||
    !input.debitWalletId ||
    !input.creditWalletId
  ) {
    throw new Error("Ledger transfer input is incomplete.");
  }

  if (input.amountSatang <= 0n) {
    throw new Error("Transfer amount must be greater than zero.");
  }

  if (input.debitWalletId === input.creditWalletId) {
    throw new Error("Debit and credit wallets must be different.");
  }
}

async function findExistingPosting(
  tx: Prisma.TransactionClient,
  input: PostWalletTransferInput,
  userControlAccountId: string | null,
  principalAccounts: Awaited<ReturnType<typeof requireLoanPrincipalAccounts>> | null,
): Promise<PostedWalletTransfer | null> {
  const existing = await tx.ledgerTransaction.findUnique({
    where: {
      idempotencyKey: input.idempotencyKey,
    },
    include: {
      entries: {
        select: {
          walletId: true,
          platformAccountId: true,
          entryType: true,
          amountSatang: true,
          currency: true,
        },
      },
    },
  });

  if (!existing) {
    return null;
  }

  if (
    existing.status !== "POSTED" ||
    existing.transactionType !== input.transactionType ||
    existing.referenceType !== input.referenceType ||
    existing.referenceId !== input.referenceId
  ) {
    throw new Error(
      "Idempotency key has already been used for a different or incomplete operation.",
    );
  }

  const debitEntries = existing.entries.filter(
    (entry) =>
      entry.walletId === input.debitWalletId &&
      (entry.platformAccountId === null || entry.platformAccountId === userControlAccountId) &&
      entry.entryType === "DEBIT",
  );

  const creditEntries = existing.entries.filter(
    (entry) =>
      entry.walletId === input.creditWalletId &&
      (entry.platformAccountId === null || entry.platformAccountId === userControlAccountId) &&
      entry.entryType === "CREDIT",
  );

  const principalAmount = input.principalReceivableMovement?.amountSatang ?? 0n;
  const debitReceivable = principalAccounts
    ? existing.entries.filter((entry) => entry.walletId === null && entry.platformAccountId === principalAccounts.fundingAsset.id && entry.entryType === "DEBIT" && entry.amountSatang === principalAmount && entry.currency === CURRENCY)
    : [];
  const creditReceivable = principalAccounts
    ? existing.entries.filter((entry) => entry.walletId === null && entry.platformAccountId === principalAccounts.loanReceivable.id && entry.entryType === "CREDIT" && entry.amountSatang === principalAmount && entry.currency === CURRENCY)
    : [];
  const expectedEntryCount = principalAmount > 0n ? 4 : 2;
  const valid =
    existing.entries.length === expectedEntryCount &&
    debitEntries.length === 1 &&
    creditEntries.length === 1 &&
    (principalAmount === 0n || (debitReceivable.length === 1 && creditReceivable.length === 1)) &&
    debitEntries[0].amountSatang === input.amountSatang &&
    creditEntries[0].amountSatang === input.amountSatang &&
    debitEntries[0].currency === CURRENCY &&
    creditEntries[0].currency === CURRENCY;

  if (!valid) {
    throw new Error(
      "Idempotency key conflicts with the original ledger posting.",
    );
  }

  return {
    ledgerTransactionId: existing.id,
    amountSatang: input.amountSatang,
    reused: true,
  };
}

export async function postWalletTransfer(
  tx: Prisma.TransactionClient,
  input: PostWalletTransferInput,
): Promise<PostedWalletTransfer> {
  validateInput(input);

  const wallets = await tx.wallet.findMany({
    where: {
      id: {
        in: [
          input.debitWalletId,
          input.creditWalletId,
        ],
      },
    },
    select: {
      id: true,
      ownerUserId: true,
      ownerPlatformAccountId: true,
      balanceSatang: true,
      currency: true,
      status: true,
    },
  });

  const debitWallet = wallets.find(
    (wallet) => wallet.id === input.debitWalletId,
  );

  const creditWallet = wallets.find(
    (wallet) => wallet.id === input.creditWalletId,
  );

  if (!debitWallet || !creditWallet) {
    throw new Error("One or both wallets do not exist.");
  }

  const userControlAccount =
    debitWallet.ownerUserId !== null || creditWallet.ownerUserId !== null
      ? await requireUserWalletControlAccount(tx)
      : null;
  const principalAccounts = input.principalReceivableMovement
    ? await requireLoanPrincipalAccounts(tx)
    : null;
  if (input.principalReceivableMovement && input.principalReceivableMovement.amountSatang <= 0n) {
    throw new Error("Principal receivable movement must be greater than zero.");
  }

  const existing = await findExistingPosting(
    tx,
    input,
    userControlAccount?.id ?? null,
    principalAccounts,
  );
  if (existing) return existing;
  if (input.principalReceivableMovement && principalAccounts) {
    const receivableBalance = await getAssetAccountBalance(tx, principalAccounts.loanReceivable.id);
    if (receivableBalance < input.principalReceivableMovement.amountSatang) {
      throw new Error("Loan receivable account 1200 has insufficient principal balance for this repayment.");
    }
  }

  for (const wallet of [debitWallet, creditWallet]) {
    if (wallet.status !== "ACTIVE") {
      throw new Error("Both wallets must be ACTIVE.");
    }

    if (wallet.currency !== CURRENCY) {
      throw new Error("Only THB wallet transfers are supported.");
    }

    if (
      (wallet.ownerUserId === null) ===
      (wallet.ownerPlatformAccountId === null)
    ) {
      throw new Error("Wallet must have exactly one owner.");
    }
  }

  if (debitWallet.balanceSatang < input.amountSatang) {
    throw new Error("Insufficient debit wallet balance.");
  }

  const transaction = await tx.ledgerTransaction.create({
    data: {
      transactionType: input.transactionType,
      status: "DRAFT",
      idempotencyKey: input.idempotencyKey,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description: input.description,
    },
    select: {
      id: true,
    },
  });

  const entries: Prisma.LedgerEntryCreateManyInput[] = [
      {
        ledgerTransactionId: transaction.id,
        walletId: input.debitWalletId,
        platformAccountId: debitWallet.ownerUserId ? userControlAccount?.id ?? null : null,
        entryType: "DEBIT",
        amountSatang: input.amountSatang,
        currency: CURRENCY,
      },
      {
        ledgerTransactionId: transaction.id,
        walletId: input.creditWalletId,
        platformAccountId: creditWallet.ownerUserId ? userControlAccount?.id ?? null : null,
        entryType: "CREDIT",
        amountSatang: input.amountSatang,
        currency: CURRENCY,
      },
  ];
  if (input.principalReceivableMovement && principalAccounts) {
    entries.push(
      {
        ledgerTransactionId: transaction.id,
        platformAccountId: principalAccounts.fundingAsset.id,
        entryType: "DEBIT",
        amountSatang: input.principalReceivableMovement.amountSatang,
        currency: CURRENCY,
      },
      {
        ledgerTransactionId: transaction.id,
        platformAccountId: principalAccounts.loanReceivable.id,
        entryType: "CREDIT",
        amountSatang: input.principalReceivableMovement.amountSatang,
        currency: CURRENCY,
      },
    );
  }
  await tx.ledgerEntry.createMany({ data: entries });

  const debitUpdate = await tx.wallet.updateMany({
    where: {
      id: input.debitWalletId,
      status: "ACTIVE",
      currency: CURRENCY,
      balanceSatang: {
        gte: input.amountSatang,
      },
    },
    data: {
      balanceSatang: {
        decrement: input.amountSatang,
      },
    },
  });

  if (debitUpdate.count !== 1) {
    throw new Error(
      "Debit wallet balance changed or is insufficient.",
    );
  }

  const creditUpdate = await tx.wallet.updateMany({
    where: {
      id: input.creditWalletId,
      status: "ACTIVE",
      currency: CURRENCY,
    },
    data: {
      balanceSatang: {
        increment: input.amountSatang,
      },
    },
  });

  if (creditUpdate.count !== 1) {
    throw new Error("Could not update credit wallet.");
  }

  const posted = await tx.ledgerTransaction.updateMany({
    where: {
      id: transaction.id,
      status: "DRAFT",
    },
    data: {
      status: "POSTED",
      postedAt: new Date(),
    },
  });

  if (posted.count !== 1) {
    throw new Error("Ledger transaction could not be posted.");
  }

  return {
    ledgerTransactionId: transaction.id,
    amountSatang: input.amountSatang,
    reused: false,
  };
}


export async function withSerializableTransactionRetry<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("maxAttempts must be a positive integer.");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      });
    } catch (error) {
      const knownError =
        error && typeof error === "object"
          ? (error as {
              code?: unknown;
              meta?: { code?: unknown };
              message?: unknown;
            })
          : undefined;
      const prismaCode = knownError?.code;
      const postgresCode = knownError?.meta?.code;
      const errorMessage =
        typeof knownError?.message === "string" ? knownError.message : "";

      const isSerializationConflict =
        prismaCode === "P2034" ||
        prismaCode === "40001" ||
        postgresCode === "40001" ||
        (prismaCode === "P2010" && /\b40001\b/.test(errorMessage));

      const isUniqueConflict = prismaCode === "P2002";

      const retryable =
        isSerializationConflict ||
        isUniqueConflict;

      if (!retryable || attempt === maxAttempts) {
        throw error;
      }

      const backoffWindowMs = 50 * 2 ** (attempt - 1);
      const jitterMs = Math.floor(Math.random() * backoffWindowMs);
      await new Promise((resolve) =>
        setTimeout(resolve, jitterMs),
      );
    }
  }

  throw new Error("Serializable transaction retry limit exceeded.");
}

